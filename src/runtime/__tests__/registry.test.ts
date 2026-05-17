import { describe, it, expect } from 'vitest';
import { EaselNode, register_node_type, get_node_constructor, get_registered_types, register_node_ns, get_node_ns, register_node_spec, resolve_node_spec, create_node_data } from '@/runtime/registry';
import { vec2_create } from '@/core/math';

// Minimal EaselNode stub for testing
class TestNode extends EaselNode {
  mount() {}
  update() {}
  unmount() {}
}

describe('registry', () => {
  it('registers and retrieves a node type', () => {
    register_node_type('test_reg_a', TestNode);
    expect(get_node_constructor('test_reg_a')).toBe(TestNode);
    expect(get_registered_types()).toContain('test_reg_a');
  });

  it('returns undefined for unknown type', () => {
    expect(get_node_constructor('nonexistent')).toBeUndefined();
  });

  it('registers namespace for a node type', () => {
    register_node_type('test_ns_a', TestNode);
    register_node_ns('test_ns_a', ['Category', 'Sub']);
    expect(get_node_ns('test_ns_a')).toEqual(['Category', 'Sub']);
  });

  it('register_node_ns stores namespace', () => {
    register_node_type('test_ns_b', TestNode);
    register_node_ns('test_ns_b', ['Math']);
    expect(get_node_ns('test_ns_b')).toEqual(['Math']);
  });

  it('returns undefined ns for unregistered type', () => {
    expect(get_node_ns('no_ns')).toBeUndefined();
  });

  it('resolves node spec from register_node_type spec param', () => {
    register_node_type('test_spec_a', TestNode, {
      inputs: [{ id: 'x', label: 'X', type: 'input' }],
      size: vec2_create(200, 100),
    });
    const spec = resolve_node_spec('test_spec_a');
    expect(spec?.inputs?.length).toBe(1);
    expect(spec?.inputs?.[0]?.id).toBe('x');
    expect(spec?.size).toEqual(vec2_create(200, 100));
  });

  it('resolves node spec from register_node_spec', () => {
    register_node_type('test_spec_b', TestNode);
    register_node_spec('test_spec_b', {
      outputs: [{ id: 'y', label: 'Y', type: 'output' }],
    });
    const spec = resolve_node_spec('test_spec_b');
    expect(spec?.outputs?.[0]?.id).toBe('y');
  });

  it('resolve_node_spec returns undefined for unknown type', () => {
    expect(resolve_node_spec('unknown_type')).toBeUndefined();
  });

  it('create_node_data builds a GraphNode with spec defaults', () => {
    register_node_type('test_create_a', TestNode, {
      inputs: [{ id: 'in', label: 'In', type: 'input' }],
      outputs: [{ id: 'out', label: 'Out', type: 'output' }],
      widgets: [{ id: 'w', type: 'number', label: 'W', value: 0 }],
      size: vec2_create(180, 120),
      title: 'Custom Title',
    });
    const n = create_node_data('test_create_a', { position: vec2_create(50, 50) });
    expect(n.type).toBe('test_create_a');
    expect(n.title).toBe('Custom Title');
    expect(n.size).toEqual(vec2_create(180, 120));
    expect(n.inputs.length).toBe(1);
    expect(n.outputs.length).toBe(1);
    expect(n.position).toEqual(vec2_create(50, 50));
  });

  it('create_node_data auto-generates title from type', () => {
    register_node_type('test_create_b', TestNode);
    const n = create_node_data('test_create_b');
    expect(n.title).toBe('Test Create B');
  });

  it('create_node_data generates id with type prefix', () => {
    register_node_type('test_create_c', TestNode);
    const n1 = create_node_data('test_create_c');
    create_node_data('test_create_c');
    expect(n1.id).toMatch(/^test_create_c_/);
  });
});
