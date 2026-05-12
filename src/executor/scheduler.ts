import * as E from 'fp-ts/Either';
import type { GraphNode, Wire } from '../core/types';

export const build_adjacency_list = (wires: Record<string, Wire>): Record<string, string[]> => {
  const adj: Record<string, string[]> = {};
  for (const wire of Object.values(wires)) {
    if (!adj[wire.source_node_id]) {
      adj[wire.source_node_id] = [];
    }
    adj[wire.source_node_id].push(wire.target_node_id);
  }
  return adj;
};

export const topological_sort = (nodes: Record<string, GraphNode>, wires: Record<string, Wire>): E.Either<Error, string[]> => {
  const adj = build_adjacency_list(wires);
  const in_degree: Record<string, number> = {};
  const node_ids = Object.keys(nodes);

  for (const id of node_ids) {
    in_degree[id] = 0;
  }

  for (const wire of Object.values(wires)) {
    if (in_degree[wire.target_node_id] !== undefined) {
      in_degree[wire.target_node_id]++;
    }
  }

  const queue: string[] = [];
  for (const id of node_ids) {
    if (in_degree[id] === 0) {
      queue.push(id);
    }
  }

  const result: string[] = [];
  while (queue.length > 0) {
    const u = queue.shift()!;
    result.push(u);

    const neighbors = adj[u] || [];
    for (const v of neighbors) {
      if (in_degree[v] !== undefined) {
        in_degree[v]--;
        if (in_degree[v] === 0) {
          queue.push(v);
        }
      }
    }
  }

  if (result.length !== node_ids.length) {
    return E.left(new Error('Graph contains cycles or unresolved dependencies'));
  }

  return E.right(result);
};