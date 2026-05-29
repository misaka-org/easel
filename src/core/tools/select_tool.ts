/**
 * SelectTool — 默认工具：选择/拖动/调整大小/框选。
 */

import type { State, Interaction } from '@/core/types';
import type { Tool, ToolResult } from '@/core/tool';
import type { PointerEventParams } from '@/core/interactions';
import * as O from 'fp-ts/Option';
import { vec2_sub, vec2_scale, vec2_create, aabb_intersect } from '@/core/math';
import { move_nodes } from '@/core/node_ops';

// ── Pure helpers ────────────────────────────────────────────────

const start_dragging = (state: State, target_id: string, event: PointerEventParams): State => {
  const is_selected = state.selected_node_ids.includes(target_id);
  const ids = event.modifiers.shift
    ? is_selected
      ? state.selected_node_ids.filter(id => id !== target_id)
      : [...state.selected_node_ids, target_id]
    : is_selected
      ? state.selected_node_ids
      : [target_id];
  return {
    ...state,
    selected_node_ids: ids,
    interaction: {
      mode: 'dragging',
      node_ids: ids,
      start_pos: event.screen_position,
      original_nodes: state.nodes,
    },
  };
};

const start_resizing = (state: State, target_id: string, event: PointerEventParams): State => ({
  ...state,
  interaction: {
    mode: 'resizing',
    node_id: target_id,
    start_pos: event.screen_position,
    start_size: state.nodes[target_id]?.size || vec2_create(0, 0),
  },
});

const start_selection_or_pan = (state: State, event: PointerEventParams): State => ({
  ...state,
  selected_node_ids: event.modifiers.shift ? state.selected_node_ids : [],
  interaction: event.modifiers.ctrl || event.modifiers.meta
    ? { mode: 'panning', start_pos: event.screen_position, original_camera: state.camera.position }
    : { mode: 'box_selecting', start_pos: event.screen_position, current_pos: event.screen_position },
});

// ── Handler helpers (pure) ──────────────────────────────────────

const handle_dragging = (state: State, i: Extract<Interaction, { mode: 'dragging' }>, event: PointerEventParams): State => {
  const delta = vec2_scale(vec2_sub(event.screen_position, i.start_pos), 1 / state.camera.zoom);
  const restored = { ...state, nodes: { ...state.nodes } };
  for (const id of i.node_ids) {
    if (restored.nodes[id] && i.original_nodes[id]) restored.nodes[id] = i.original_nodes[id]!;
  }
  return { ...move_nodes(restored, i.node_ids, delta), interaction: i };
};

const handle_resizing = (state: State, i: Extract<Interaction, { mode: 'resizing' }>, event: PointerEventParams): State => {
  const delta = vec2_scale(vec2_sub(event.screen_position, i.start_pos), 1 / state.camera.zoom);
  const size = vec2_create(Math.max(50, i.start_size.x + delta.x), Math.max(30, i.start_size.y + delta.y));
  return {
    ...state,
    nodes: { ...state.nodes, [i.node_id]: { ...state.nodes[i.node_id]!, size } },
    interaction: i,
  };
};

const handle_box_selecting = (state: State, i: Extract<Interaction, { mode: 'box_selecting' }>, event: PointerEventParams): State => ({
  ...state,
  interaction: { ...i, current_pos: event.screen_position },
});

const finish_box_selection = (state: State, i: Extract<Interaction, { mode: 'box_selecting' }>, event: PointerEventParams): State => {
  const min_x = Math.min(i.start_pos.x, i.current_pos.x);
  const max_x = Math.max(i.start_pos.x, i.current_pos.x);
  const min_y = Math.min(i.start_pos.y, i.current_pos.y);
  const max_y = Math.max(i.start_pos.y, i.current_pos.y);
  const start_world = vec2_create(
    (min_x - state.camera.position.x) / state.camera.zoom,
    (min_y - state.camera.position.y) / state.camera.zoom,
  );
  const size_world = vec2_create((max_x - min_x) / state.camera.zoom, (max_y - min_y) / state.camera.zoom);
  const selected = Object.values(state.nodes).filter(n => aabb_intersect(n.position, n.size, start_world, size_world)).map(n => n.id);
  return {
    ...state,
    selected_node_ids: [...new Set([...(event.modifiers.shift ? state.selected_node_ids : []), ...selected])],
  };
};

// ── Tool definition ─────────────────────────────────────────────

export const select_tool: Tool = {
  id: 'select',
  label: 'Select',
  cursor: 'default',

  on_pointer_down: (state, _interaction, event): ToolResult => {
    // 1) resize
    if (O.isSome(event.target_action) && event.target_action.value === 'resize' && O.isSome(event.target_node_id)) {
      return { state: start_resizing(state, event.target_node_id.value, event) };
    }
    // 3) drag
    if (O.isSome(event.target_node_id)) {
      return { state: start_dragging(state, event.target_node_id.value, event) };
    }
    // 4) box select / pan
    return { state: start_selection_or_pan(state, event) };
  },

  on_pointer_move: (state, interaction, event): ToolResult => {
    switch (interaction.mode) {
      case 'dragging':
        return { state: handle_dragging(state, interaction as any, event) };
      case 'resizing':
        return { state: handle_resizing(state, interaction as any, event) };
      case 'box_selecting':
        return { state: handle_box_selecting(state, interaction as any, event) };
      default:
        return { state };
    }
  },

  on_pointer_up: (state, interaction, event): ToolResult => {
    let next = state;
    if (interaction.mode === 'box_selecting' && event) {
      next = finish_box_selection(state, interaction as any, event);
    }
    return { state: { ...next, interaction: { mode: 'idle' } } };
  },

  /** wheel pan or pinch-to-zoom (trackpad ctrl/meta). */
  on_wheel: (state, event) => {
    if (event.modifiers.ctrl || event.modifiers.meta) {
      // exp 公式：小 delta → 微变，大 delta → 快变，连续顺滑
      const zoom = Math.max(0.1, Math.min(10, state.camera.zoom * Math.exp(-event.delta_y / 200)));
      const mx = event.screen_position.x;
      const my = event.screen_position.y;
      const oc = state.camera.position;
      const oz = state.camera.zoom;
      return {
        state: { ...state, camera: { position: { x: mx - (mx - oc.x) * (zoom / oz), y: my - (my - oc.y) * (zoom / oz) }, zoom } },
      };
    }
    return {
      state: {
        ...state,
        camera: { ...state.camera, position: { x: state.camera.position.x - event.delta_x, y: state.camera.position.y - event.delta_y } },
      },
    };
  },
};
