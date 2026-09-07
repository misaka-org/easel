import type { State, GraphNode } from './types';
import type { Vec2 } from './math';
import { vec2_add } from './math';
import * as O from 'fp-ts/Option';
import { pipe } from 'fp-ts/function';

export type NodeFlag = 'muted' | 'pinned' | 'locked';

export const is_node_muted = (
  node: GraphNode | undefined,
): node is GraphNode & { readonly muted: true } => node?.muted === true;

export const is_node_locked = (
  node: GraphNode | undefined,
): node is GraphNode & { readonly locked: true } => node?.locked === true;

export const muted_node_outputs = (
  node: GraphNode,
  inputs: Record<string, unknown>,
): Record<string, unknown> => {
  const outputs: Record<string, unknown> = {};
  for (let index = 0; index < node.outputs.length; index++) {
    const output = node.outputs[index]!;
    const matching_input =
      node.inputs.find(port => port.id === output.id) ??
      (index < node.inputs.length ? node.inputs[index] : undefined);
    if (
      matching_input !== undefined &&
      Object.prototype.hasOwnProperty.call(inputs, matching_input.id)
    ) {
      outputs[output.id] = inputs[matching_input.id];
    }
  }
  return outputs;
};

export const get_node = (state: State, node_id: string): O.Option<GraphNode> => {
  return O.fromNullable(state.nodes[node_id]);
};

export const add_node = (state: State, node: GraphNode): State => ({
  ...state,
  nodes: { ...state.nodes, [node.id]: node },
});

export const move_node = (state: State, node_id: string, delta: Vec2): State => {
  return pipe(
    get_node(state, node_id),
    O.map(node =>
      node.pinned === true
        ? state
        : {
            ...state,
            nodes: {
              ...state.nodes,
              [node_id]: {
                ...node,
                position: vec2_add(node.position, delta),
              },
            },
          },
    ),
    O.getOrElse(() => state),
  );
};

export const move_nodes = (state: State, node_ids: readonly string[], delta: Vec2): State => {
  return node_ids.reduce((acc, id) => move_node(acc, id, delta), state);
};

const node_has_flag = (node: GraphNode, flag: NodeFlag): boolean => {
  switch (flag) {
    case 'muted':
      return node.muted === true;
    case 'pinned':
      return node.pinned === true;
    case 'locked':
      return node.locked === true;
  }
};

const with_node_flag = (node: GraphNode, flag: NodeFlag, value: boolean): GraphNode => {
  switch (flag) {
    case 'muted':
      return { ...node, muted: value };
    case 'pinned':
      return { ...node, pinned: value };
    case 'locked':
      return { ...node, locked: value };
  }
};

export const set_node_flag = (
  state: State,
  node_id: string,
  flag: NodeFlag,
  value: boolean,
): State => {
  return update_node_data(state, node_id, node => with_node_flag(node, flag, value));
};

export const toggle_node_flag = (state: State, node_id: string, flag: NodeFlag): State => {
  return update_node_data(state, node_id, node =>
    with_node_flag(node, flag, !node_has_flag(node, flag)),
  );
};

export const update_node_data = (
  state: State,
  node_id: string,
  updater: (node: GraphNode) => GraphNode,
): State => {
  return pipe(
    get_node(state, node_id),
    O.map(node => ({
      ...state,
      nodes: {
        ...state.nodes,
        [node_id]: updater(node),
      },
    })),
    O.getOrElse(() => state),
  );
};

export const update_widget_value = (
  state: State,
  node_id: string,
  widget_id: string,
  value: string | number | boolean,
): State => {
  return update_node_data(state, node_id, node => {
    if (!node.widgets) return node;
    const widgets = node.widgets.map(w => (w.id === widget_id ? { ...w, value } : w));
    return { ...node, widgets };
  });
};

export const remove_node = (state: State, node_id: string): State => {
  const { [node_id]: _, ...rest_nodes } = state.nodes;
  return {
    ...state,
    nodes: rest_nodes,
    selected_node_ids: state.selected_node_ids.filter(id => id !== node_id),
  };
};

// TODO: moved to subgraph plugin
export const create_subgraph_from_selection = (state: State): State => {
  return state;
};

// TODO: moved to subgraph plugin
export const expand_subgraph = (state: State, _subgraph_id: string): State => {
  return state;
};
