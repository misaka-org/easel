import { effect } from "@vue/reactivity";
import type { State } from "@/core/types";
import { vec2_sub, vec2_scale, vec2_add, vec2_create } from "@/core/math";
import { frame_effect } from "./frame_effect";

export const render_wires = (
  container: HTMLElement,
  state_ref: { value: State }
): void => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("wires-container");
  container.appendChild(svg);

  const active_wire_path = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path"
  );
  active_wire_path.classList.add("wire-active");
  svg.appendChild(active_wire_path);

  const wire_elements = new Map<string, SVGPathElement>();

  // Port 位置缓存（相对 node 的偏移），避免每帧 getBoundingClientRect 导致 layout thrash
  const port_rel_positions = new Map<string, Map<string, { x: number; y: number }>>();
  const node_layout_versions = new Map<string, string>();

  const get_port_position = (
    node_id: string,
    port_id: string,
    type: "input" | "output",
    state: State
  ): { x: number; y: number } | undefined => {
    const node = state.nodes[node_id];
    if (!node) return undefined;

    const layout_key = `${node_id}_${node.type}_${node.size.x.toFixed(1)}_${node.size.y.toFixed(1)}_${node.inputs.length}_${node.outputs.length}_${!!node.collapsed}`;
    const cached_version = node_layout_versions.get(node_id);
    if (cached_version !== layout_key) {
      port_rel_positions.delete(node_id);
      node_layout_versions.set(node_id, layout_key);
    }

    // 如果节点处于折叠状态，统一使用节点边框中点（假设 header 高度为 40px）
    if (node.collapsed) {
      // 动态测量 header 高度，避免硬编码
      const node_el = container.querySelector(`.node[data-id="${node_id}"]`) as HTMLElement;
      const header_h = node_el ? (node_el.querySelector('.node-header') as HTMLElement)?.offsetHeight || 36 : 36;
      const header_mid_y = node.position.y + header_h / 2;
      if (type === "input") {
        return {
          x: node.position.x,
          y: header_mid_y,
        };
      } else {
        return {
          x: node.position.x + node.size.x,
          y: header_mid_y,
        };
      }
    }

    // 检查缓存
    const node_cache = port_rel_positions.get(node_id);
    if (node_cache) {
      const rel = node_cache.get(port_id);
      if (rel) {
        return {
          x: node.position.x + rel.x,
          y: node.position.y + rel.y,
        };
      }
    }

    const node_el = container.querySelector(
      `.node[data-id="${node_id}"]`
    ) as HTMLElement;
    if (!node_el) return undefined;

    const port_el = node_el.querySelector(
      `.port[data-port-id="${port_id}"] .port-dot`
    ) as HTMLElement;
    if (!port_el) {
      return undefined;
    }

    const node_rect = node_el.getBoundingClientRect();
    const port_rect = port_el.getBoundingClientRect();

    // Fallback for when a node is expanded and port rect is not yet computed by layout
    if (port_rect.width === 0 && port_rect.height === 0) {
      const is_input = type === 'input';
      return {
        x: node.position.x + (is_input ? 0 : node.size.x),
        y: node.position.y + node.size.y / 2, // Use vertical center as a fallback
      };
    }

    const center_x = port_rect.left + port_rect.width / 2 - node_rect.left;
    const center_y = port_rect.top + port_rect.height / 2 - node_rect.top;

    // 写入缓存（相对 node 的偏移，与 zoom 无关）
    const rel_x = center_x / state.camera.zoom;
    const rel_y = center_y / state.camera.zoom;
    if (!port_rel_positions.has(node_id)) {
      port_rel_positions.set(node_id, new Map());
    }
    port_rel_positions.get(node_id)!.set(port_id, { x: rel_x, y: rel_y });

    return {
      x: node.position.x + rel_x,
      y: node.position.y + rel_y,
    };
  };

  const draw_bezier = (x1: number, y1: number, x2: number, y2: number) => {
    const dist = Math.abs(x2 - x1) * 0.5;
    const cp1x = x1 + Math.max(dist, 50);
    const cp2x = x2 - Math.max(dist, 50);
    return `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`;
  };

  frame_effect(() => {
    const state = state_ref.value;

    svg.style.transform = `translate(${state.camera.position.x}px, ${state.camera.position.y}px) scale(${state.camera.zoom})`;
    svg.style.strokeWidth = `${2 / state.camera.zoom}px`; // keep line width constant visually

    const current_ids = new Set(Object.keys(state.wires));

    Array.from(wire_elements.entries()).forEach(([id, el]) => {
      if (!current_ids.has(id)) {
        svg.removeChild(el);
        wire_elements.delete(id);
      }
    });

    Array.from(current_ids).forEach((id) => {
      const wire = state.wires[id];
      if (!wire) return;

      let el = wire_elements.get(id);
      if (!el) {
        el = document.createElementNS("http://www.w3.org/2000/svg", "path");
        el.classList.add("wire");
        svg.appendChild(el);
        wire_elements.set(id, el);
      }

      const source_node = state.nodes[wire.source_node_id];
      const source_port = source_node?.outputs.find(p => p.id === wire.source_port_id);
      const type = source_port?.value_type;
      
      if (type) {
        el.dataset.valueType = type;
      } else {
        delete el.dataset.valueType;
      }

      const p1 = get_port_position(
        wire.source_node_id,
        wire.source_port_id,
        "output",
        state
      );
      const p2 = get_port_position(
        wire.target_node_id,
        wire.target_port_id,
        "input",
        state
      );

      if (p1 && p2) {
        el.setAttribute("d", draw_bezier(p1.x, p1.y, p2.x, p2.y));
      } else {
        el.setAttribute("d", ""); // Hide wire if port not found
      }
    });

    if (state.interaction.mode === "wiring") {
      active_wire_path.style.display = "block";
      const p1 = get_port_position(
        state.interaction.source_node_id,
        state.interaction.source_port_id,
        "output",
        state
      );

      if (p1) {
        const screen_delta = vec2_sub(
          state.interaction.target_pos,
          state.camera.position
        );
        const world_target = vec2_scale(screen_delta, 1 / state.camera.zoom);

        active_wire_path.setAttribute(
          "d",
          draw_bezier(p1.x, p1.y, world_target.x, world_target.y)
        );
      } else {
        active_wire_path.setAttribute("d", "");
      }
    } else {
      active_wire_path.style.display = "none";
    }
  });
};
