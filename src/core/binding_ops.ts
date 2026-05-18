/**
 * Pure functions for binding operations on State.
 * Designed as drop-in replacement for wire_ops in new code.
 */

import type { State, Binding } from './types';

export const add_binding = (state: State, binding: Binding): State => ({
  ...state,
  bindings: { ...state.bindings, [binding.id]: binding },
});

export const remove_binding = (state: State, binding_id: string): State => {
  const { [binding_id]: _, ...rest } = state.bindings;
  return { ...state, bindings: rest };
};

/** Find a data-flow binding connected to the given node+port (for lookups). */
export const find_binding_by_target = (
  state: State,
  target_node_id: string,
  target_port_id: string,
): Binding | undefined => {
  return Object.values(state.bindings).find(
    b => b.type === 'data-flow' && b.target_id === target_node_id && b.target_handle === target_port_id,
  );
};

export const find_binding_by_source = (
  state: State,
  source_node_id: string,
  source_port_id: string,
): Binding | undefined => {
  return Object.values(state.bindings).find(
    b => b.type === 'data-flow' && b.source_id === source_node_id && b.source_handle === source_port_id,
  );
};

/** 检查 port 是否有连线（含 data-flow binding 和旧 wire）。 */
export const is_port_connected = (state: State, node_id: string, port_id: string, port_type: 'input' | 'output'): boolean => {
  if (port_type === 'input') {
    if (Object.values(state.wires).some(w => w.target_node_id === node_id && w.target_port_id === port_id)) return true;
    if (find_binding_by_target(state, node_id, port_id)) return true;
  } else {
    if (Object.values(state.wires).some(w => w.source_node_id === node_id && w.source_port_id === port_id)) return true;
    if (find_binding_by_source(state, node_id, port_id)) return true;
  }
  return false;
};

/** 查找连接到 (node_id, port_id) 的任何连线，优先 binding。 */
export const find_connection = (
  state: State,
  node_id: string,
  port_id: string,
  port_type: 'input' | 'output',
): Binding | (typeof state.wires)[string] | undefined => {
  if (port_type === 'input') {
    const b = find_binding_by_target(state, node_id, port_id);
    if (b) return b;
    return Object.values(state.wires).find(w => w.target_node_id === node_id && w.target_port_id === port_id);
  }
  const b = find_binding_by_source(state, node_id, port_id);
  if (b) return b;
  return Object.values(state.wires).find(w => w.source_node_id === node_id && w.source_port_id === port_id);
};