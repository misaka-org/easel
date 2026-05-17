import { describe, it, expect } from 'vitest';
import { create_initial_state } from '@/core/state';
import { serialize_state, deserialize_state } from '@/core/serialization';
import { add_node, remove_node } from '@/core/node_ops';
import { add_wire } from '@/core/wire_ops';
import { vec2_create } from '@/core/math';

describe('serialization', () => {
  it('serializes and deserializes empty state', () => {
    const s = create_initial_state();
    const json = serialize_state(s);
    const restored = deserialize_state(json);
    expect(Object.keys(restored.nodes)).toEqual(Object.keys(s.nodes));
    expect(Object.keys(restored.wires)).toEqual(Object.keys(s.wires));
    expect(restored.interaction.mode).toBe('idle');
  });

  it('roundtrips nodes and wires', () => {
    let s = add_node(create_initial_state(), {
      id: 'n1', type: 'default', position: vec2_create(100, 100), size: vec2_create(200, 150),
      title: 'Test', inputs: [{ id: 'in', label: 'In', type: 'input' }],
      outputs: [{ id: 'out', label: 'Out', type: 'output' }],
      widgets: [{ id: 'w1', type: 'number', label: 'Num', value: 42 }],
      custom_data: { foo: 'bar' }
    });
    s = add_wire(s, { id: 'wire1', source_node_id: 'n1', source_port_id: 'out', target_node_id: 'n1', target_port_id: 'in' });

    const json = serialize_state(s);
    const restored = deserialize_state(json);

    expect(restored.nodes['n1']?.title).toBe('Test');
    expect(restored.nodes['n1']?.position).toEqual(vec2_create(100, 100));
    expect(restored.nodes['n1']?.widgets?.[0]?.value).toBe(42);
    expect(restored.wires['wire1']?.source_node_id).toBe('n1');
  });

  it('returns initial state on invalid JSON', () => {
    const restored = deserialize_state('{{{invalid');
    expect(restored.interaction.mode).toBe('idle');
  });
});