import type { State, GraphNode, Binding } from '@/core/types';
import { vec2_sub, vec2_scale } from '@/core/math';
import { frame_effect } from './frame_effect';
import type { Store } from './store';

// Layout constants matching CSS defaults for DefaultNode / SubgraphNode
const LAYOUT = {
  default: {
    header_h: 36, // 10px padding-top + ~20px content + 6px padding-bottom
    body_pad_left: 12,
    body_pad_right: 12,
    port_row_h: 16, // min-height of .port-row
    port_dot: 8,
    port_gap: 0, // .port-rows are block elements, no gap
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
    header_h: 0, // no header
    body_pad_left: 6, // padding 10px 12px 10px 6px
    body_pad_right: 12,
    port_row_h: 22, // port ~16px + body gap 6px (ports are direct flex children with gap)
    port_dot: 8,
    port_gap: 6,
  },
  subgraph_output: {
    header_h: 0,
    body_pad_left: 12, // padding 10px 6px 10px 12px
    body_pad_right: 6,
    port_row_h: 22,
    port_dot: 8,
    port_gap: 6,
  },
};
const LAYOUT_DEFAULT = LAYOUT.default;

// Widget-area layout constants (default node only)
const WIDGET_BODY_GAP = 8; // node-body gap between ports-container and widgets-container
const WIDGET_CONTAINER_MARGIN_TOP = 2;
const WIDGET_CONTAINER_PADDING_TOP = 8;
const WIDGET_ROW_H = 24; // approximate widget row height (input ~22px + alignment)
const WIDGET_GAP = 8; // widgets-container gap between rows

/** Calculate port dot center relative to node position (no DOM reads). */
function calc_rel_pos(
  node: GraphNode,
  port_id: string,
  type: 'input' | 'output',
): { x: number; y: number } | undefined {
  const inputs = node.inputs || [];
  const outputs = node.outputs || [];
  const widgets = node.widgets || [];
  const no = LAYOUT[node.type as keyof typeof LAYOUT] || LAYOUT_DEFAULT;

  // Collapsed: ports at header vertical center, left/right edge
  if (node.collapsed) {
    const mid_y = no.header_h > 0 ? no.header_h / 2 : 8;
    return {
      x: type === 'input' ? 0 : Math.max(0, node.size.x),
      y: mid_y,
    };
  }

  // Subgraph input stub: ports are outputs on the RIGHT edge
  if (node.type === 'subgraph_input') {
    const idx = outputs.findIndex(p => p.id === port_id);
    if (idx === -1) return undefined;
    const x = Math.max(0, node.size.x - 22);
    const y = 10 + idx * no.port_row_h + 8;
    return { x, y };
  }

  // Subgraph output stub: ports are inputs on the LEFT edge
  if (node.type === 'subgraph_output') {
    const idx = inputs.findIndex(p => p.id === port_id);
    if (idx === -1) return undefined;
    const x = no.body_pad_left + no.port_dot / 2;
    const y = 10 + idx * no.port_row_h + 8;
    return { x, y };
  }

  // Standard nodes (default, subgraph, group, custom)
  if (type === 'input') {
    const idx = inputs.findIndex(p => p.id === port_id);
    if (idx !== -1) {
      const x = no.body_pad_left + no.port_dot / 2;
      const y = no.header_h + idx * (no.port_row_h + no.port_gap) + no.port_row_h / 2;
      return { x, y };
    }

    // Not in inputs — might be a widget port (rendered in widgets-container)
    const w_idx = widgets.findIndex(w => w.id === port_id);
    if (w_idx !== -1) {
      const x = no.body_pad_left + no.port_dot / 2; // same X as input ports
      // Y: after all port rows + widgets-container overhead + widget row offset
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
    const idx = outputs.findIndex(p => p.id === port_id);
    if (idx === -1) return undefined;
    const x = Math.max(0, node.size.x - no.body_pad_right - no.port_dot / 2);
    const y =
      no.header_h + (inputs.length + idx) * (no.port_row_h + no.port_gap) + no.port_row_h / 2;
    return { x, y };
  }

  return undefined;
}


/** Yield all connections (wires + data-flow bindings) as a uniform iterable. */
function* all_connections(store: Store) {
  for (const wire of store.wires.list()) {
    yield wire;
  }
  for (const b of store.bindings.list()) {
    if (b.type === 'data-flow') {
      yield {
        id: b.id,
        source_node_id: b.source_id,
        source_port_id: b.source_handle,
        target_node_id: b.target_id,
        target_port_id: b.target_handle,
      };
    }
  }
}

export const render_wires = (container: HTMLElement, store: Store): void => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('wires-container');
  container.appendChild(svg);

  const active_wire_path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  active_wire_path.classList.add('wire-active');
  svg.appendChild(active_wire_path);

  const wire_elements = new Map<string, SVGPathElement>();

  // Track last-drawn wire positions so we can skip unchanged wires.
  const last_wire_pos = new Map<string, string>();

  // Port position cache: relative offsets from node position.
  // Populated via calc_rel_pos() which avoids DOM reads entirely.
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

    // Invalidate cache when layout-relevant properties change
    const layout_key = `${node_id}_${node.type}_${node.size.x.toFixed(1)}_${node.size.y.toFixed(1)}_${node.inputs.length}_${node.outputs.length}_${!!node.collapsed}`;
    const cached_version = node_layout_versions.get(node_id);
    if (cached_version !== layout_key) {
      port_rel_positions.delete(node_id);
      node_layout_versions.set(node_id, layout_key);
    }

    // Check cache
    const node_cache = port_rel_positions.get(node_id);
    if (node_cache) {
      const rel = node_cache.get(port_id);
      if (rel) {
        return { x: node.position.x + rel.x, y: node.position.y + rel.y };
      }
    }

    // Calculate relative position from layout constants (no DOM read)
    const rel = calc_rel_pos(node, port_id, type);
    if (rel) {
      if (!port_rel_positions.has(node_id)) {
        port_rel_positions.set(node_id, new Map());
      }
      port_rel_positions.get(node_id)!.set(port_id, rel);
      return { x: node.position.x + rel.x, y: node.position.y + rel.y };
    }

    // Fallback: position within the node body (not at edge)
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

    const wire_ids = new Set(store.wires.keys());
    const binding_ids = new Set(
      store.bindings.list().filter(b => b.type === 'data-flow').map(b => b.id)
    );
    const current_ids = new Set([...wire_ids, ...binding_ids]);

    Array.from(wire_elements.entries()).forEach(([id, el]) => {
      if (!current_ids.has(id)) {
        svg.removeChild(el);
        wire_elements.delete(id);
      }
    });

    for (const conn of all_connections(store)) {
      const { id, source_node_id, source_port_id, target_node_id, target_port_id } = conn;
      if (!current_ids.has(id)) continue;

      let el = wire_elements.get(id);
      if (!el) {
        el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        el.classList.add('wire');
        svg.appendChild(el);
        wire_elements.set(id, el);
      }

      const source_node = store.nodes.get(source_node_id);
      const source_port = source_node?.outputs.find(p => p.id === source_port_id);
      const type = source_port?.value_type;

      if (type) {
        el.dataset.valueType = type;
      } else {
        delete el.dataset.valueType;
      }

      const p1 = get_port_position(source_node_id, source_port_id, 'output', state);
      const p2 = get_port_position(target_node_id, target_port_id, 'input', state);

      if (p1 && p2) {
        // Skip draw_bezier + setAttribute when neither endpoint moved
        const pos_key = `${p1.x.toFixed(1)},${p1.y.toFixed(1)},${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
        if (last_wire_pos.get(id) === pos_key) continue;
        last_wire_pos.set(id, pos_key);
        el.setAttribute('d', draw_bezier(p1.x, p1.y, p2.x, p2.y));
      } else {
        if (last_wire_pos.has(id)) last_wire_pos.delete(id);
        el.setAttribute('d', '');
      }

  }
    if (state.interaction.mode === 'wiring') {
      active_wire_path.style.display = 'block';
      const p1 = get_port_position(
        state.interaction.source_node_id,
        state.interaction.source_port_id,
        'output',
        state,
      );

      if (p1) {
        const screen_delta = vec2_sub(state.interaction.target_pos, state.camera.position);
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
