import type { State, GraphNode, Binding } from './types';
import type { Vec2 } from './math';
import { vec2_add } from './math';
import * as O from 'fp-ts/Option';
import { pipe } from 'fp-ts/function';

export const get_node = (state: State, node_id: string): O.Option<GraphNode> => {
  return O.fromNullable(state.nodes[node_id]);
};

export const add_node = (state: State, node: GraphNode): State => ({
  ...state,
  nodes: { ...state.nodes, [node.id]: node },
});

/** 从 bindings 中获取 node_id 的所有 group-child 子节点 ID。 */
export const get_children_ids = (
  bindings: Record<string, Binding>,
  node_id: string,
): string[] =>
  Object.values(bindings)
    .filter(b => b.type === 'group-child' && b.source_id === node_id)
    .map(b => b.target_id);

/**
 * 检查 parent_id 是否是 child_id 在组层次结构中的祖先。
 * 用于防止循环嵌套（A -> B -> A）。
 */
export const is_ancestor = (
  nodes: Record<string, GraphNode>,
  bindings: Record<string, Binding>,
  parent_id: string,
  child_id: string,
  visited = new Set<string>(),
): boolean => {
  if (visited.has(child_id)) return false;
  visited.add(child_id);
  const child = nodes[child_id];
  if (!child) return false;
  const children = get_children_ids(bindings, child_id);
  if (children.length === 0) return false;
  if (children.includes(parent_id)) return true;
  return children.some(c => is_ancestor(nodes, bindings, parent_id, c, visited));
};

export const move_node = (
  state: State,
  node_id: string,
  delta: Vec2,
  visited = new Set<string>(),
): State => {
  if (visited.has(node_id)) return state;
  visited.add(node_id);

  return pipe(
    get_node(state, node_id),
    O.map(node => {
      let next_state = {
        ...state,
        nodes: {
          ...state.nodes,
          [node_id]: {
            ...node,
            position: vec2_add(node.position, delta),
          },
        },
      };

      const children = get_children_ids(state.bindings, node_id);
      for (const child_id of children) {
        // 跳过会导致循环引用的 child（parent 是 child 的祖先）
        if (!is_ancestor(state.nodes, state.bindings, node_id, child_id)) {
          next_state = move_node(next_state, child_id, delta, visited);
        }
      }
      return next_state;
    }),
    O.getOrElse(() => state),
  );
};

export const move_nodes = (state: State, node_ids: readonly string[], delta: Vec2): State => {
  const visited = new Set<string>();
  return node_ids.reduce((acc, id) => move_node(acc, id, delta, visited), state);
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

  const wires = Object.fromEntries(
    Object.entries(state.wires).filter(
      ([_, wire]) => wire.source_node_id !== node_id && wire.target_node_id !== node_id,
    ),
  );

  const bindings = Object.fromEntries(
    Object.entries(state.bindings).filter(
      ([_, b]) => b.source_id !== node_id && b.target_id !== node_id,
    ),
  );

  return {
    ...state,
    nodes: rest_nodes,
    wires,
    bindings,
    selected_node_ids: state.selected_node_ids.filter(id => id !== node_id),
  };
};
