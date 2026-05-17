import { describe, it, expect } from 'vitest';
import { create_initial_state } from '@/core/state';
import { add_wire, remove_wire, clear_wires } from '@/core/wire_ops';

describe('wire_ops', () => {
  it('should add a wire', () => {
    const s = add_wire(create_initial_state(), { id: 'w1', source_node_id: 'n1', source_port_id: 'p1', target_node_id: 'n2', target_port_id: 'p2' });
    expect(s.wires['w1']).toBeDefined();
  });

  it('should remove a wire', () => {
    const s = remove_wire(add_wire(create_initial_state(), { id: 'w1', source_node_id: 'n1', source_port_id: 'p1', target_node_id: 'n2', target_port_id: 'p2' }), 'w1');
    expect(s.wires['w1']).toBeUndefined();
  });

  it('should clear all wires with clear_wires', () => {
    let s = add_wire(create_initial_state(), { id: 'w1', source_node_id: 'n1', source_port_id: 'p1', target_node_id: 'n2', target_port_id: 'p2' });
    s = add_wire(s, { id: 'w2', source_node_id: 'n1', source_port_id: 'p3', target_node_id: 'n3', target_port_id: 'p4' });
    expect(Object.keys(s.wires).length).toBe(2);
    s = clear_wires(s);
    expect(s.wires).toEqual({});
  });

  it('should be idempotent on empty state', () => {
    const s = clear_wires(create_initial_state());
    expect(s.wires).toEqual({});
  });
});