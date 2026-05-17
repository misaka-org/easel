import { describe, it, expect } from 'vitest';
import { create_initial_state } from '@/core/state';
import { add_node, move_node, remove_node } from '@/core/node_ops';
import { vec2_create } from '@/core/math';

describe('node_ops', () => {
  const node_a = {
    id: 'a',
    type: 'default',
    position: vec2_create(0, 0),
    size: vec2_create(100, 100),
    title: 'Node A',
    inputs: [],
    outputs: [],
    widgets: [],
    custom_data: {}
  };

  it('should add a node', () => {
    const state = create_initial_state();
    const new_state = add_node(state, node_a);
    expect(new_state.nodes['a']).toEqual(node_a);
  });

  it('should move a node', () => {
    const state = add_node(create_initial_state(), node_a);
    const new_state = move_node(state, 'a', vec2_create(10, 20));
    expect(new_state.nodes['a']?.position).toEqual(vec2_create(10, 20));
  });

  it('should remove a node', () => {
    const state = add_node(create_initial_state(), node_a);
    const new_state = remove_node(state, 'a');
    expect(new_state.nodes['a']).toBeUndefined();
  });
});