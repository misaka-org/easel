import { effect } from "@vue/reactivity";
import type { State } from "../core/types";
import { vec2_sub, vec2_scale, vec2_add, vec2_create } from "../core/math";
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

  const get_port_position = (
    node_id: string,
    port_id: string,
    type: "input" | "output",
    state: State
  ) => {
    const node = state.nodes[node_id];
    if (!node) return { x: 0, y: 0 };

    // 如果节点处于折叠状态，统一使用节点边框中点（假设 header 高度为 40px）
    if (node.collapsed) {
      // 约定折叠时 header 高度约为 40px，连线点位于垂直中点（20px 偏移）
      const header_mid_y = node.position.y + 20;
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

    const node_el = container.querySelector(
      `.node[data-id="${node_id}"]`
    ) as HTMLElement;
    if (!node_el) return { x: 0, y: 0 };

    const port_el = node_el.querySelector(
      `.port[data-port-id="${port_id}"] .port-dot`
    ) as HTMLElement;
    if (!port_el) {
      // 保底：不使用 DOM 坐标，直接根据节点位置计算偏移
      const is_in = type === "input";
      return {
        x: node.position.x + (is_in ? 0 : node.size.x),
        y: node.position.y + 40,
      };
    }

    const node_rect = node_el.getBoundingClientRect();
    const port_rect = port_el.getBoundingClientRect();

    const center_x = port_rect.left + port_rect.width / 2 - node_rect.left;
    const center_y = port_rect.top + port_rect.height / 2 - node_rect.top;

    return {
      x: node.position.x + center_x / state.camera.zoom,
      y: node.position.y + center_y / state.camera.zoom,
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
      
      let color = 'var(--wire-color)';
      if (type === 'text') color = '#3b82f6';
      else if (type === 'image') color = '#10b981';
      else if (type === 'video') color = '#8b5cf6';
      else if (type === 'audio') color = '#f59e0b';
      else if (type === 'number') color = '#0dcaf0';

      el.setAttribute('stroke', color);

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

      el.setAttribute("d", draw_bezier(p1.x, p1.y, p2.x, p2.y));
    });

    if (state.interaction.mode === "wiring") {
      active_wire_path.style.display = "block";
      const p1 = get_port_position(
        state.interaction.source_node_id,
        state.interaction.source_port_id,
        "output",
        state
      );

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
      active_wire_path.style.display = "none";
    }
  });
};
