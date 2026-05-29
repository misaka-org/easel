/**
 * Wire 渲染模块。
 *
 * 从 src/runtime/render_wires.ts 迁移，适配为插件渲染。
 * 使用 SVG overlay 绘制贝塞尔曲线连线。
 * 连线数据来源：easel.plugin_data.wire.get_bindings()
 * 临时连线状态：easel.plugin_data.wire._wire_state
 */

import type { Easel } from '@/runtime/easel';
import type { State, Port } from '@/core/types';
import { vec2_sub, vec2_scale } from '@/core/math';
import { frame_effect } from '@/runtime/frame_effect';

// ── 本地类型定义（GraphNode 已从 core/types 移除）─────────────────

type WidgetValue = string | number | boolean;
type WidgetOption = { readonly label: string; readonly value: string };
type Widget = {
  readonly id: string;
  readonly type: string;
  readonly label: string;
  readonly value: WidgetValue;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly options?: readonly string[] | readonly WidgetOption[];
  readonly value_type?: string;
  readonly accepts?: readonly string[];
  readonly required?: boolean;
};

type GraphNode = {
  readonly id: string;
  readonly type: string;
  readonly position: import('@/core/math').Vec2;
  readonly size: import('@/core/math').Vec2;
  readonly title: string;
  readonly inputs: readonly Port[];
  readonly outputs: readonly Port[];
  readonly widgets?: readonly Widget[];
  readonly style_mode?: 'default' | 'borderless';
  readonly resizable?: boolean;
  readonly collapsed?: boolean;
  readonly custom_data: Record<string, unknown>;
};

// Layout constants matching CSS defaults for DefaultNode / SubgraphNode
const LAYOUT = {
  default: {
    header_h: 36,
    body_pad_left: 12,
    body_pad_right: 12,
    port_row_h: 16,
    port_dot: 8,
    port_gap: 0,
  },
  subgraph: {
    header_h: 36,
    body_pad_left: 12,
    body_pad_right: 12,
    port_row_h: 16,
    port_dot: 8,
    port_gap: 0,
  },
  subgraph_input: {
    header_h: 0,
    body_pad_left: 6,
    body_pad_right: 12,
    port_row_h: 22,
    port_dot: 8,
    port_gap: 6,
  },
  subgraph_output: {
    header_h: 0,
    body_pad_left: 12,
    body_pad_right: 6,
    port_row_h: 22,
    port_dot: 8,
    port_gap: 6,
  },
};
const LAYOUT_DEFAULT = LAYOUT.default;

const WIDGET_BODY_GAP = 8;
const WIDGET_CONTAINER_MARGIN_TOP = 2;
const WIDGET_CONTAINER_PADDING_TOP = 8;
const WIDGET_ROW_H = 24;
const WIDGET_GAP = 8;

/** 计算端口圆点中心相对节点位置的偏移（无 DOM 读取）。 */
function calc_rel_pos(
  node: GraphNode,
  port_id: string,
  type: 'input' | 'output',
): { x: number; y: number } | undefined {
  const inputs = node.inputs || [];
  const outputs = node.outputs || [];
  const widgets = node.widgets || [];
  const no = LAYOUT[node.type as keyof typeof LAYOUT] || LAYOUT_DEFAULT;

  if (node.collapsed) {
    const mid_y = no.header_h > 0 ? no.header_h / 2 : 8;
    return {
      x: type === 'input' ? 0 : Math.max(0, node.size.x),
      y: mid_y,
    };
  }

  if (node.type === 'subgraph_input') {
    const idx = outputs.findIndex((p: Port) => p.id === port_id);
    if (idx === -1) return undefined;
    const x = Math.max(0, node.size.x - 22);
    const y = 10 + idx * no.port_row_h + 8;
    return { x, y };
  }

  if (node.type === 'subgraph_output') {
    const idx = inputs.findIndex((p: Port) => p.id === port_id);
    if (idx === -1) return undefined;
    const x = no.body_pad_left + no.port_dot / 2;
    const y = 10 + idx * no.port_row_h + 8;
    return { x, y };
  }

  if (type === 'input') {
    const idx = inputs.findIndex((p: Port) => p.id === port_id);
    if (idx !== -1) {
      const x = no.body_pad_left + no.port_dot / 2;
      const y = no.header_h + idx * (no.port_row_h + no.port_gap) + no.port_row_h / 2;
      return { x, y };
    }

    const w_idx = widgets.findIndex((w: Widget) => w.id === port_id);
    if (w_idx !== -1) {
      const x = no.body_pad_left + no.port_dot / 2;
      const port_rows_h = (inputs.length + outputs.length) * no.port_row_h;
      const widgets_y =
        no.header_h +
        port_rows_h +
        WIDGET_BODY_GAP +
        WIDGET_CONTAINER_MARGIN_TOP +
        WIDGET_CONTAINER_PADDING_TOP;
      const y = widgets_y + w_idx * (WIDGET_ROW_H + WIDGET_GAP) + WIDGET_ROW_H / 2;
      return { x, y };
    }

    return undefined;
  }

  if (type === 'output') {
    const idx = outputs.findIndex((p: Port) => p.id === port_id);
    if (idx === -1) return undefined;
    const x = Math.max(0, node.size.x - no.body_pad_right - no.port_dot / 2);
    const y =
      no.header_h + (inputs.length + idx) * (no.port_row_h + no.port_gap) + no.port_row_h / 2;
    return { x, y };
  }

  return undefined;
}

export const render_wires = (easel: Easel): void => {
  const container = easel.container;
  const store = easel.store;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('wires-container');
  container.appendChild(svg);

  const active_wire_path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  active_wire_path.classList.add('wire-active');
  svg.appendChild(active_wire_path);

  const wire_elements = new Map<string, SVGPathElement>();
  const last_wire_pos = new Map<string, string>();
  const port_rel_positions = new Map<string, Map<string, { x: number; y: number }>>();
  const node_layout_versions = new Map<string, string>();

  const get_port_position = (
    node_id: string,
    port_id: string,
    type: 'input' | 'output',
    state: State,
  ): { x: number; y: number } | undefined => {
    const node = state.nodes[node_id];
    if (!node) return undefined;

    const layout_key = `${node_id}_${node.type}_${node.size.x.toFixed(1)}_${node.size.y.toFixed(1)}_${node.inputs.length}_${node.outputs.length}_${!!node.collapsed}`;
    const cached_version = node_layout_versions.get(node_id);
    if (cached_version !== layout_key) {
      port_rel_positions.delete(node_id);
      node_layout_versions.set(node_id, layout_key);
    }

    const node_cache = port_rel_positions.get(node_id);
    if (node_cache) {
      const rel = node_cache.get(port_id);
      if (rel) {
        return { x: node.position.x + rel.x, y: node.position.y + rel.y };
      }
    }

    const rel = calc_rel_pos(node, port_id, type);
    if (rel) {
      if (!port_rel_positions.has(node_id)) {
        port_rel_positions.set(node_id, new Map());
      }
      port_rel_positions.get(node_id)!.set(port_id, rel);
      return { x: node.position.x + rel.x, y: node.position.y + rel.y };
    }

    const no = LAYOUT[node.type as keyof typeof LAYOUT] || LAYOUT_DEFAULT;
    const fx = no.body_pad_left + no.port_dot / 2;
    const fy = no.header_h + Math.min(node.size.y * 0.4, 80);
    return {
      x: node.position.x + fx,
      y: node.position.y + fy,
    };
  };

  const draw_bezier = (x1: number, y1: number, x2: number, y2: number) => {
    const dist = Math.abs(x2 - x1) * 0.5;
    const cp1x = x1 + Math.max(dist, 50);
    const cp2x = x2 - Math.max(dist, 50);
    return `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`;
  };

  frame_effect(() => {
    const state = store.state.value;

    svg.style.transform = `translate(${state.camera.position.x}px, ${state.camera.position.y}px) scale(${state.camera.zoom})`;
    svg.style.strokeWidth = `${2 / state.camera.zoom}px`;

    // --- 读取插件 bindings（DataFlowBinding[]，不含 group-child 等）---
    const bindings = easel.plugin_data.wire?.get_bindings() ?? [];
    const current_ids = new Set(bindings.map(b => b.id));

    // 清理已删除的连线元素
    Array.from(wire_elements.entries()).forEach(([id, el]) => {
      if (!current_ids.has(id)) {
        svg.removeChild(el);
        wire_elements.delete(id);
      }
    });

    // 更新/创建连线路径
    for (const conn of bindings) {
      const { id, source_id, source_handle, target_id, target_handle } = conn;
      if (!current_ids.has(id)) continue;

      let el = wire_elements.get(id);
      if (!el) {
        el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        el.classList.add('wire');
        svg.appendChild(el);
        wire_elements.set(id, el);
        last_wire_pos.delete(id);
      }

      const source_node = store.nodes.get(source_id);
      const source_port = source_node?.outputs.find((p: Port) => p.id === source_handle);
      const vtype = source_port?.value_type;

      if (vtype) {
        el.dataset.valueType = vtype;
      } else {
        delete el.dataset.valueType;
      }

      const p1 = get_port_position(source_id, source_handle, 'output', state);
      const p2 = get_port_position(target_id, target_handle, 'input', state);

      if (p1 && p2) {
        const pos_key = `${p1.x.toFixed(1)},${p1.y.toFixed(1)},${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
        if (last_wire_pos.get(id) === pos_key) continue;
        last_wire_pos.set(id, pos_key);
        el.setAttribute('d', draw_bezier(p1.x, p1.y, p2.x, p2.y));
      } else {
        if (last_wire_pos.has(id)) last_wire_pos.delete(id);
        el.setAttribute('d', '');
      }
    }

    // --- Active wire（正在拖的临时连线）---
    const ws = (easel.plugin_data.wire as any)?._wire_state;
    if (ws && ws.is_wiring) {
      active_wire_path.style.display = 'block';
      const p1 = get_port_position(ws.source_node_id, ws.source_port_id, 'output', state);

      if (p1) {
        const screen_delta = vec2_sub(ws.target_pos, state.camera.position);
        const world_target = vec2_scale(screen_delta, 1 / state.camera.zoom);

        active_wire_path.setAttribute('d', draw_bezier(p1.x, p1.y, world_target.x, world_target.y));
      } else {
        active_wire_path.setAttribute('d', '');
      }
    } else {
      active_wire_path.style.display = 'none';
    }
  });
};
