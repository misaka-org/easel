import { is_node_locked } from '@/core/node_ops';
import type { GraphNode } from '@/core/types';

type BindingLike = {
  readonly id: string;
  readonly source_id: string;
  readonly target_id: string;
};

export const is_binding_locked = (
  nodes: Readonly<Record<string, GraphNode>>,
  binding: Readonly<Pick<BindingLike, 'source_id' | 'target_id'>>,
): boolean => {
  return is_node_locked(nodes[binding.source_id]) || is_node_locked(nodes[binding.target_id]);
};

export const get_locked_binding_ids = (
  nodes: Readonly<Record<string, GraphNode>>,
  bindings: ReadonlyArray<BindingLike>,
): Set<string> => {
  const ids = new Set<string>();
  for (const binding of bindings) {
    if (is_binding_locked(nodes, binding)) {
      ids.add(binding.id);
    }
  }
  return ids;
};
