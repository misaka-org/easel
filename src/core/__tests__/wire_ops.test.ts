import { describe, it, expect } from 'vitest';
import { create_initial_state } from '@/core/state';
import { add_wire, remove_wire } from '@/core/wire_ops';

describe('wire_ops', () => {
  const wire_a = {
    id: 'w1',
    source_node_id: 'n1',
    source_port_id: 'p1',
    target_node_id: 'n2',
    target_port_id: 'p2'
  };

  it('should add a wire', () => {
    const state = create_initial_state();
    const new_state = add_wire(state, wire_a);
    expect(new_state.wires['w1']).toEqual(wire_a);
  });

  it('should remove a wire', () => {
    const state = add_wire(create_initial_state(), wire_a);
    const new_state = remove_wire(state, 'w1');
    expect(new_state.wires['w1']).toBeUndefined();
  });
});