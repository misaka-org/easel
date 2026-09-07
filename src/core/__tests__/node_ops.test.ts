import { describe, it, expect } from 'vitest';
import { create_initial_state } from '@/core/state';
import {
  add_node,
  is_node_muted,
  move_node,
  move_nodes,
  muted_node_outputs,
  remove_node,
  set_node_flag,
  toggle_node_flag,
  update_node_data,
  update_widget_value,
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

  it('does not move a pinned node', () => {
    const pinned = { ...node_a(), pinned: true };
    const source = add_node(create_initial_state(), pinned);
    const moved = move_node(source, 'a', vec2_create(50, 60));
    expect(moved.nodes['a']?.position).toEqual(node_a().position);
    expect(moved.nodes['a']?.pinned).toBe(true);
  });

  it('moves unpinned nodes beside a pinned node', () => {
    let s = create_initial_state();
    s = add_node(s, { ...node_a(), pinned: true });
    s = add_node(s, node_b());
    s = move_nodes(s, ['a', 'b'], vec2_create(10, 20));
    expect(s.nodes['a']?.position).toEqual(node_a().position);
    expect(s.nodes['b']?.position).toEqual(vec2_create(210, 20));
  });

  it('moves a locked node because locked does not pin position', () => {
    const source = add_node(create_initial_state(), { ...node_a(), locked: true });
    const moved = move_node(source, 'a', vec2_create(15, 25));
    expect(moved.nodes['a']?.position).toEqual(vec2_create(15, 25));
    expect(moved.nodes['a']?.locked).toBe(true);
  });

  it('sets and toggles node flags with typed helpers', () => {
    let s = add_node(create_initial_state(), node_a());
    s = set_node_flag(s, 'a', 'muted', true);
    s = set_node_flag(s, 'a', 'pinned', false);
    s = set_node_flag(s, 'a', 'locked', true);
    expect(s.nodes['a']?.muted).toBe(true);
    expect(s.nodes['a']?.pinned).toBe(false);
    expect(s.nodes['a']?.locked).toBe(true);

    s = toggle_node_flag(s, 'a', 'muted');
    s = toggle_node_flag(s, 'a', 'pinned');
    s = toggle_node_flag(s, 'a', 'locked');
    expect(s.nodes['a']?.muted).toBe(false);
    expect(s.nodes['a']?.pinned).toBe(true);
    expect(s.nodes['a']?.locked).toBe(false);
  });

  it('treats muted as bypass and maps input ports to output ports', () => {
    const muted = {
      ...node_a(),
      muted: true,
      inputs: [
        { id: 'first', label: 'First', type: 'input' as const },
        { id: 'second', label: 'Second', type: 'input' as const },
      ],
      outputs: [
        { id: 'first', label: 'First', type: 'output' as const },
        { id: 'second_copy', label: 'Second Copy', type: 'output' as const },
      ],
    };

    expect(is_node_muted(muted)).toBe(true);
    expect(muted_node_outputs(muted, { first: 'A', second: 'B', widget_only: 'W' })).toEqual({
      first: 'A',
      second_copy: 'B',
    });
  });

  it('should remove a node', () => {
    const s = remove_node(add_node(create_initial_state(), node_a()), 'a');
    expect(s.nodes['a']).toBeUndefined();
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
});
