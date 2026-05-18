import type { State, Modifiers, Interaction } from './types';
import type { Vec2 } from './math';
import { vec2_sub, vec2_add, vec2_scale, vec2_create, aabb_intersect } from './math';
import { move_nodes } from './node_ops';

import { add_binding, remove_binding, find_binding_by_target } from './binding_ops';
import { create_data_flow_binding } from './types';
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

const start_wiring = (
  state: State,
  source_node_id: string,
  source_port_id: string,
  event: PointerEventParams,
): State => ({
  ...state,
  interaction: {
    mode: 'wiring',
    source_node_id,
    source_port_id,
    target_pos: event.screen_position,
  },
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

const try_grab_wire = (state: State, event: PointerEventParams) =>
  pipe(
    O.Do,
    O.bind('node_id', () => event.target_node_id),
    O.bind('port_id', () => event.target_port_id),
    O.bind('port_type', () => event.target_port_type),
    O.chain(({ node_id, port_id, port_type }) => {
      if (port_type === 'input') {
        const b = find_binding_by_target(state, node_id, port_id);
        if (b) {
          return O.some(start_wiring(remove_binding(state, b.id), b.source_id, b.source_handle, event));
        }
      } else if (port_type === 'output') {
        return O.some(start_wiring(state, node_id, port_id, event));
      }
      return O.none;
    }),
  );

export const pointer_down = (state: State, event: PointerEventParams): State =>
  pipe(
    try_grab_wire(state, event),
    O.alt(() =>
      pipe(
        event.target_action,
        O.filter(action => action === 'resize'),
        O.chain(() => event.target_node_id),
        O.map(target_id => start_resizing(state, target_id, event)),
      ),
    ),
    O.alt(() =>
      pipe(
        event.target_node_id,
        O.map(target_id => start_dragging(state, target_id, event)),
      ),
    ),
    O.getOrElse(() => start_selection_or_pan(state, event)),
  );

const handlers_move: Record<
  Interaction['mode'],
  (state: State, i: any, event: PointerEventParams) => State
> = {
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
    const restored_state = { ...state, nodes: { ...state.nodes } };

    const to_move = new Set<string>();
    const collect = (id: string) => {
      if (to_move.has(id)) return;
      to_move.add(id);
      const children = Object.values(state.bindings)
        .filter(b => b.type === 'group-child' && b.source_id === id)
        .map(b => b.target_id);
      children.forEach(collect);
    };
    i.node_ids.forEach(collect);

    for (const id of to_move) {
      if (restored_state.nodes[id] && i.original_nodes[id]) {
        restored_state.nodes[id] = i.original_nodes[id]!;
      }
    }

    return {
      ...move_nodes(restored_state, i.node_ids, total_delta),
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
  wiring: (state, i, event) => ({
    ...state,
    interaction: { ...i, target_pos: event.screen_position },
  }),
  box_selecting: (state, i, event) => ({
    ...state,
    interaction: { ...i, current_pos: event.screen_position },
  }),
};

export const pointer_move = (state: State, event: PointerEventParams): State =>
  handlers_move[state.interaction.mode](state, state.interaction, event);

const try_connect_wire = (
  state: State,
  source_node_id: string,
  source_port_id: string,
  event: PointerEventParams,
): State =>
  pipe(
    event.target_node_id,
    O.chain(target_node_id => {
      if (target_node_id === source_node_id) return O.none;
      const source_port = state.nodes[source_node_id]?.outputs.find(p => p.id === source_port_id);
      const target_node = state.nodes[target_node_id];
      if (!source_port || !target_node) return O.none;

      const source_type = source_port.value_type || 'any';
      let target_port_id: string | undefined;
      let target_accepts: readonly string[] = ['any'];

      if (
        O.isSome(event.target_port_id) &&
        O.isSome(event.target_port_type) &&
        event.target_port_type.value === 'input'
      ) {
        target_port_id = event.target_port_id.value;
        const target_port = target_node.inputs.find(p => p.id === target_port_id);
        const target_widget = target_node.widgets?.find(w => w.id === target_port_id);
        if (!target_port && !target_widget) return O.none;

        if (target_port) {
          target_accepts = target_port.accepts || [target_port.value_type || 'any'];
        } else if (target_widget) {
          target_accepts = target_widget.accepts || [target_widget.value_type || 'any'];
        }
      } else {
        const is_port_free = (id: string) => !find_binding_by_target(state, target_node_id, id);

        const compatible_input = target_node.inputs.find(p => {
          if (!is_port_free(p.id)) return false;
          const accepts = p.accepts || [p.value_type || 'any'];
          return accepts.includes('any') || source_type === 'any' || accepts.includes(source_type);
        });

        if (compatible_input) {
          target_port_id = compatible_input.id;
          target_accepts = compatible_input.accepts || [compatible_input.value_type || 'any'];
        } else {
          const compatible_widget = target_node.widgets?.find(w => {
            if (!is_port_free(w.id)) return false;
            const accepts = w.accepts || [w.value_type || 'any'];
            return (
              accepts.includes('any') || source_type === 'any' || accepts.includes(source_type)
            );
          });
          if (compatible_widget) {
            target_port_id = compatible_widget.id;
            target_accepts = compatible_widget.accepts || [compatible_widget.value_type || 'any'];
          }
        }
      }

      if (!target_port_id) return O.none;

      if (
        target_accepts.includes('any') ||
        source_type === 'any' ||
        target_accepts.includes(source_type)
      ) {
        const existing = find_binding_by_target(state, target_node_id, target_port_id);
        const clean_state = existing ? remove_binding(state, existing.id) : state;

        const binding = create_data_flow_binding(source_node_id, source_port_id, target_node_id, target_port_id);
        return O.some(add_binding(clean_state, binding));
      }
      return O.none;
    }),
    O.getOrElse(() => state),
  );

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
    if (i.mode === 'wiring' && event)
      return try_connect_wire(state, i.source_node_id, i.source_port_id, event);
    if (i.mode === 'box_selecting' && event) return finish_box_selection(state, i, event);
    return state;
  });
  return { ...next_state, interaction: { mode: 'idle' } };
};

export const wheel_zoom = (state: State, event: WheelEventParams): State => {
  if (event.modifiers.ctrl || event.modifiers.meta) {
    const zoom_factor = event.delta_y > 0 ? 0.9 : 1.1;
    const zoom = Math.max(0.1, Math.min(10, state.camera.zoom * zoom_factor));

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
