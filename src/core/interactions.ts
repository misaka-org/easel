import type { State, Modifiers, Interaction } from './types';
import type { Vec2 } from './math';
import { vec2_sub, vec2_add, vec2_scale, vec2_create, aabb_intersect } from './math';
import { move_nodes } from './node_ops';
import * as O from 'fp-ts/Option';
import { pipe } from 'fp-ts/function';

export type PointerEventParams = {
  readonly screen_position: Vec2;
  readonly target_node_id: O.Option<string>;
  readonly target_port_id: O.Option<string>;
  readonly target_port_type: O.Option<'input' | 'output'>;
  readonly target_action: O.Option<string>;
  readonly modifiers: Modifiers;
};

export type WheelEventParams = {
  readonly screen_position: Vec2;
  readonly delta_x: number;
  readonly delta_y: number;
  readonly modifiers: Modifiers;
};

export const update_modifiers = (state: State, modifiers: Modifiers): State => ({
  ...state,
  modifiers,
});


const start_resizing = (state: State, target_id: string, event: PointerEventParams): State => ({
  ...state,
  interaction: {
    mode: 'resizing',
    node_id: target_id,
    start_pos: event.screen_position,
    start_size: state.nodes[target_id]?.size || vec2_create(0, 0),
  },
});

const start_dragging = (state: State, target_id: string, event: PointerEventParams): State => {
  const is_selected = state.selected_node_ids.includes(target_id);
  const selected_node_ids = event.modifiers.shift
    ? is_selected
      ? state.selected_node_ids.filter(id => id !== target_id)
      : [...state.selected_node_ids, target_id]
    : is_selected
      ? state.selected_node_ids
      : [target_id];

  return {
    ...state,
    selected_node_ids,
    interaction: {
      mode: 'dragging',
      node_ids: selected_node_ids,
      start_pos: event.screen_position,
      original_nodes: state.nodes,
    },
  };
};

const start_selection_or_pan = (state: State, event: PointerEventParams): State => ({
  ...state,
  selected_node_ids: event.modifiers.shift ? state.selected_node_ids : [],
  interaction:
    event.modifiers.ctrl || event.modifiers.meta
      ? {
          mode: 'panning',
          start_pos: event.screen_position,
          original_camera: state.camera.position,
        }
      : {
          mode: 'box_selecting',
          start_pos: event.screen_position,
          current_pos: event.screen_position,
        },
});

export const pointer_down = (state: State, event: PointerEventParams): State =>
  pipe(
    event.target_action,
    O.filter(action => action === 'resize'),
    O.chain(() => event.target_node_id),
    O.map(target_id => start_resizing(state, target_id, event)),
    O.alt(() =>
      pipe(
        event.target_node_id,
        O.map(target_id => start_dragging(state, target_id, event)),
      ),
    ),
    O.getOrElse(() => start_selection_or_pan(state, event)),
  );

const handlers_move: {
  [K in Interaction['mode']]: (
    state: State,
    i: Extract<Interaction, { mode: K }>,
    event: PointerEventParams,
  ) => State;
} = {
  idle: state => state,
  resizing: (state, i, event) => {
    const delta = vec2_scale(vec2_sub(event.screen_position, i.start_pos), 1 / state.camera.zoom);
    const new_size = vec2_create(
      Math.max(50, i.start_size.x + delta.x),
      Math.max(30, i.start_size.y + delta.y),
    );
    return {
      ...state,
      nodes: { ...state.nodes, [i.node_id]: { ...state.nodes[i.node_id]!, size: new_size } },
      interaction: i,
    };
  },
  dragging: (state, i, event) => {
    const total_delta = vec2_scale(
      vec2_sub(event.screen_position, i.start_pos),
      1 / state.camera.zoom,
    );
    const restored = { ...state, nodes: { ...state.nodes } };
    for (const id of i.node_ids) {
      if (restored.nodes[id] && i.original_nodes[id]) {
        restored.nodes[id] = i.original_nodes[id]!;
      }
    }
    return {
      ...move_nodes(restored, i.node_ids, total_delta),
      interaction: i,
    };
  },
  panning: (state, i, event) => ({
    ...state,
    camera: {
      ...state.camera,
      position: vec2_add(i.original_camera, vec2_sub(event.screen_position, i.start_pos)),
    },
  }),

  box_selecting: (state, i, event) => ({
    ...state,
    interaction: { ...i, current_pos: event.screen_position },
  }),
};

export const pointer_move = (state: State, event: PointerEventParams): State => {
  const interaction = state.interaction;
  switch (interaction.mode) {
    case 'idle': return handlers_move.idle(state, interaction, event);
    case 'dragging': return handlers_move.dragging(state, interaction, event);
    case 'resizing': return handlers_move.resizing(state, interaction, event);
    case 'panning': return handlers_move.panning(state, interaction, event);
    case 'box_selecting': return handlers_move.box_selecting(state, interaction, event);
  }
};

const finish_box_selection = (
  state: State,
  i: Extract<Interaction, { mode: 'box_selecting' }>,
  event: PointerEventParams,
): State => {
  const min_x = Math.min(i.start_pos.x, i.current_pos.x);
  const max_x = Math.max(i.start_pos.x, i.current_pos.x);
  const min_y = Math.min(i.start_pos.y, i.current_pos.y);
  const max_y = Math.max(i.start_pos.y, i.current_pos.y);

  const start_world = vec2_create(
    (min_x - state.camera.position.x) / state.camera.zoom,
    (min_y - state.camera.position.y) / state.camera.zoom,
  );
  const size_world = vec2_create(
    (max_x - min_x) / state.camera.zoom,
    (max_y - min_y) / state.camera.zoom,
  );

  const selected = Object.values(state.nodes)
    .filter(n => aabb_intersect(n.position, n.size, start_world, size_world))
    .map(n => n.id);

  return {
    ...state,
    selected_node_ids: Array.from(
      new Set([...(event.modifiers.shift ? state.selected_node_ids : []), ...selected]),
    ),
  };
};

export const pointer_up = (state: State, event?: PointerEventParams): State => {
  const next_state = pipe(state.interaction, i => {
    if (i.mode === 'box_selecting' && event) return finish_box_selection(state, i, event);
    return state;
  });
  return { ...next_state, interaction: { mode: 'idle' } };
};

export const wheel_zoom = (state: State, event: WheelEventParams): State => {
  if (event.modifiers.ctrl || event.modifiers.meta) {
    const zoom = Math.max(0.1, Math.min(10, state.camera.zoom * Math.exp(-event.delta_y / 200)));

    const mouse_x = event.screen_position.x;
    const mouse_y = event.screen_position.y;

    const old_cam = state.camera.position;
    const old_zoom = state.camera.zoom;

    const x = mouse_x - (mouse_x - old_cam.x) * (zoom / old_zoom);
    const y = mouse_y - (mouse_y - old_cam.y) * (zoom / old_zoom);

    return { ...state, camera: { position: vec2_create(x, y), zoom } };
  } else {
    return {
      ...state,
      camera: {
        ...state.camera,
        position: vec2_create(
          state.camera.position.x - event.delta_x,
          state.camera.position.y - event.delta_y,
        ),
      },
    };
  }
};
