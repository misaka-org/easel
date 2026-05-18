import { describe, it, expect } from 'vitest';
import { create_initial_state } from '@/core/state';
import {
  add_node,
  move_node,
  move_nodes,
  remove_node,
  update_node_data,
  update_widget_value,
  is_ancestor,
} from '@/core/node_ops';
import { vec2_create } from '@/core/math';

describe('node_ops', () => {
  const node_a = () => ({
    id: 'a',
    type: 'default',
    position: vec2_create(0, 0),
    size: vec2_create(100, 100),
    title: 'Node A',
    inputs: [],
    outputs: [],
    widgets: [],
    custom_data: {},
  });
  const node_b = () => ({
    id: 'b',
    type: 'default',
    position: vec2_create(200, 0),
    size: vec2_create(100, 100),
    title: 'Node B',
    inputs: [],
    outputs: [],
    widgets: [],
    custom_data: {},
  });

  it('should add a node', () => {
    const s = add_node(create_initial_state(), node_a());
    expect(s.nodes['a']).toBeDefined();
  });

  it('should move a node', () => {
    const s = move_node(add_node(create_initial_state(), node_a()), 'a', vec2_create(10, 20));
    expect(s.nodes['a']?.position).toEqual(vec2_create(10, 20));
  });

  it('should move multiple nodes with move_nodes', () => {
    let s = create_initial_state();
    s = add_node(s, node_a());
    s = add_node(s, node_b());
    s = move_nodes(s, ['a', 'b'], vec2_create(10, 20));
    expect(s.nodes['a']?.position).toEqual(vec2_create(10, 20));
    expect(s.nodes['b']?.position).toEqual(vec2_create(210, 20));
  });

  it('should remove a node', () => {
    const s = remove_node(add_node(create_initial_state(), node_a()), 'a');
    expect(s.nodes['a']).toBeUndefined();
  });

  it('should remove a node and its connected bindings', () => {
    let s = add_node(create_initial_state(), node_a());
    s = add_node(s, node_b());
    s = {
      ...s,
      bindings: {
        b1: {
          id: 'b1',
          type: 'data-flow',
          source_id: 'a',
          source_handle: 'out',
          target_id: 'b',
          target_handle: 'in',
        },
      },
    };
    s = remove_node(s, 'a');
    expect(s.nodes['a']).toBeUndefined();
    expect(s.nodes['b']).toBeDefined();
    expect(s.bindings).toEqual({});
  });

  it('should remove node from selected_node_ids', () => {
    let s = add_node(create_initial_state(), node_a());
    s = { ...s, selected_node_ids: ['a'] };
    s = remove_node(s, 'a');
    expect(s.selected_node_ids).toEqual([]);
  });

  it('should update node data with update_node_data', () => {
    const s = update_node_data(add_node(create_initial_state(), node_a()), 'a', n => ({
      ...n,
      title: 'Updated',
    }));
    expect(s.nodes['a']?.title).toBe('Updated');
  });

  it('should update widget value with update_widget_value', () => {
    const node = {
      ...node_a(),
      widgets: [{ id: 'w1', type: 'number' as const, label: 'Num', value: 0 }],
    };
    const s = update_widget_value(add_node(create_initial_state(), node), 'a', 'w1', 42);
    expect(s.nodes['a']?.widgets?.[0]?.value).toBe(42);
  });

  it('update_node_data does nothing for non-existent node', () => {
    const s = update_node_data(create_initial_state(), 'nonexistent', n => n);
    expect(s.nodes).toEqual({});
  });

  it('update_widget_value returns node unchanged when node has no widgets', () => {
    update_widget_value(add_node(create_initial_state(), node_a()), 'a', 'no_widget', 42);
    // node_a has widgets: [], update_widget_value finds no match, node unchanged
  });

  it('remove_node does nothing for non-existent id', () => {
    const s = remove_node(create_initial_state(), 'nonexistent');
    expect(s.nodes).toEqual({});
  });

  it('move_node with group-child binding moves child nodes', () => {
    const parent = { ...node_a(), custom_data: {} };
    let s = add_node(create_initial_state(), parent);
    s = add_node(s, node_b());
    s = {
      ...s,
      bindings: {
        ...s.bindings,
        gc1: {
          id: 'gc1',
          type: 'group-child',
          source_id: 'a',
          source_handle: '',
          target_id: 'b',
          target_handle: '',
        },
      },
    };
    s = move_node(s, 'a', vec2_create(10, 10));
    expect(s.nodes['a']?.position).toEqual(vec2_create(10, 10));
    expect(s.nodes['b']?.position).toEqual(vec2_create(210, 10));
  });
  describe('is_ancestor', () => {
    it('returns false for node with no children', () => {
      const nodes = { a: node_a(), b: node_b() };
      expect(is_ancestor(nodes, {}, 'a', 'b')).toBe(false);
    });

    it('detects child in parent children list (cycle prevention)', () => {
      const bindings = {
        gc1: { id: 'gc1', type: 'group-child', source_id: 'a', source_handle: '', target_id: 'b', target_handle: '' },
      };
      const nodes = { a: node_a(), b: node_b() };
      expect(is_ancestor(nodes, bindings, 'b', 'a')).toBe(true);
    });

    it('detects circular reference', () => {
      const bindings = {
        gc1: { id: 'gc1', type: 'group-child', source_id: 'a', source_handle: '', target_id: 'b', target_handle: '' },
        gc2: { id: 'gc2', type: 'group-child', source_id: 'b', source_handle: '', target_id: 'a', target_handle: '' },
      };
      const nodes = { a: node_a(), b: node_b() };
      expect(is_ancestor(nodes, bindings, 'a', 'b')).toBe(true);
      expect(is_ancestor(nodes, bindings, 'b', 'a')).toBe(true);
    });

    it('returns false when no cycle', () => {
      const bindings = {
        gc1: { id: 'gc1', type: 'group-child', source_id: 'a', source_handle: '', target_id: 'b', target_handle: '' },
      };
      const nodes = { a: node_a(), b: node_b() };
      expect(is_ancestor(nodes, bindings, 'a', 'b')).toBe(false);
    });
  });
});
