import type { State, GraphNode, Wire } from './types';
import type { Vec2 } from './math';
import { vec2_add, vec2_create } from './math';
import * as O from 'fp-ts/Option';
import { pipe } from 'fp-ts/function';

export const get_node = (state: State, node_id: string): O.Option<GraphNode> => {
  return O.fromNullable(state.nodes[node_id]);
};

export const add_node = (state: State, node: GraphNode): State => ({
  ...state,
  nodes: { ...state.nodes, [node.id]: node }
});

export const move_node = (state: State, node_id: string, delta: Vec2, visited = new Set<string>()): State => {
  if (visited.has(node_id)) return state;
  visited.add(node_id);

  return pipe(
    get_node(state, node_id),
    O.map((node) => {
      let next_state = {
        ...state,
        nodes: {
          ...state.nodes,
          [node_id]: {
            ...node,
            position: vec2_add(node.position, delta)
          }
        }
      };

      const children = node.custom_data?.['children'] as string[] | undefined;
      if (children && Array.isArray(children)) {
        for (const child_id of children) {
          next_state = move_node(next_state, child_id, delta, visited);
        }
      }
      return next_state;
    }),
    O.getOrElse(() => state)
  );
};

export const move_nodes = (state: State, node_ids: readonly string[], delta: Vec2): State => {
  const visited = new Set<string>();
  return node_ids.reduce((acc, id) => move_node(acc, id, delta, visited), state);
};

export const update_node_data = (state: State, node_id: string, updater: (node: GraphNode) => GraphNode): State => {
  return pipe(
    get_node(state, node_id),
    O.map((node) => ({
      ...state,
      nodes: {
        ...state.nodes,
        [node_id]: updater(node)
      }
    })),
    O.getOrElse(() => state)
  );
};

export const update_widget_value = (state: State, node_id: string, widget_id: string, value: string | number | boolean): State => {
  return update_node_data(state, node_id, (node) => {
    if (!node.widgets) return node;
    const widgets = node.widgets.map(w => w.id === widget_id ? { ...w, value } : w);
    return { ...node, widgets };
  });
};

export const remove_node = (state: State, node_id: string): State => {
  const { [node_id]: _, ...rest_nodes } = state.nodes;
  
  const wires = Object.fromEntries(
    Object.entries(state.wires).filter(
      ([_, wire]) => wire.source_node_id !== node_id && wire.target_node_id !== node_id
    )
  );

  return {
    ...state,
    nodes: rest_nodes,
    wires,
    selected_node_ids: state.selected_node_ids.filter(id => id !== node_id)
  };
};