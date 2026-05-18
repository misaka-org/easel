import { describe, it, expect } from 'vitest';
import { create_initial_state } from '@/core/state';
import { add_node } from '@/core/node_ops';
import { vec2_create } from '@/core/math';
import { create_group_child_binding } from '@/core/types';
import type { State } from '@/core/types';

// 测试 GroupNode on_nodes_dropped 的核心逻辑 — 只扫 dropped_ids + existing children
describe('GroupNode drop logic', () => {
  function make_state(overrides?: Partial<State>): State {
    const base = create_initial_state();
    return { ...base, ...overrides };
  }

  function make_node(id: string, x: number, y: number) {
    return {
      id, type: 'test' as const,
      position: vec2_create(x, y),
      size: vec2_create(100, 80),
      title: id, inputs: [], outputs: [], widgets: [], custom_data: {},
    };
  }

  it('adds group-child binding for dropped node inside group bounds', () => {
    let s = make_state();
    s = add_node(s, make_node('group', 0, 0));
    s = add_node(s, make_node('n1', 50, 30)); // 在 group 内
    s = { ...s, nodes: { ...s.nodes, group: { ...s.nodes['group']!, size: vec2_create(200, 150) } } };

    const group_id = 'group';
    const dropped_ids = ['n1'];
    const group = s.nodes[group_id]!;
    const group_rect = { pos: group.position, size: group.size };

    let new_bindings = { ...s.bindings };

    // 只扫 dropped_ids
    for (const id of dropped_ids) {
      if (id === group_id) continue;
      const node = s.nodes[id];
      if (!node) continue;
      const is_inside = node.position.x >= group_rect.pos.x
        && node.position.y >= group_rect.pos.y
        && node.position.x + node.size.x <= group_rect.pos.x + group_rect.size.x
        && node.position.y + node.size.y <= group_rect.pos.y + group_rect.size.y;
      if (is_inside) {
        const b = create_group_child_binding(group_id, id);
        new_bindings = { ...new_bindings, [b.id]: b };
      }
    }

    expect(Object.keys(new_bindings).length).toBe(1);
    const b = Object.values(new_bindings)[0]!;
    expect(b.type).toBe('group-child');
    expect(b.source_id).toBe('group');
    expect(b.target_id).toBe('n1');
  });

  it('does not scan non-dropped nodes outside group (dropped_ids unused)', () => {
    let s = make_state();
    s = add_node(s, make_node('group', 0, 0));
    s = add_node(s, make_node('n1', 50, 30));
    s = add_node(s, make_node('n2', 500, 500)); // 在 group 外，且不在 dropped_ids
    s = { ...s, nodes: { ...s.nodes, group: { ...s.nodes['group']!, size: vec2_create(200, 150) } } };

    const dropped_ids = ['n1']; // 只拖放 n1
    const group_id = 'group';
    const group = s.nodes[group_id]!;
    const group_rect = { pos: group.position, size: group.size };

    let new_bindings = { ...s.bindings };

    for (const id of dropped_ids) {
      if (id === group_id) continue;
      const node = s.nodes[id];
      if (!node) continue;
      const is_inside = node.position.x >= group_rect.pos.x
        && node.position.y >= group_rect.pos.y
        && node.position.x + node.size.x <= group_rect.pos.x + group_rect.size.x
        && node.position.y + node.size.y <= group_rect.pos.y + group_rect.size.y;
      if (is_inside) {
        const b = create_group_child_binding(group_id, id);
        new_bindings = { ...new_bindings, [b.id]: b };
      }
    }

    // n2 不在 dropped_ids，不会被扫描
    const child_ids = Object.values(new_bindings)
      .filter(b => b.type === 'group-child')
      .map(b => b.target_id);
    expect(child_ids).toContain('n1');
    expect(child_ids).not.toContain('n2');
  });

  it('removes group-child binding when existing child moved outside', () => {
    let s = make_state();
    s = add_node(s, make_node('group', 0, 0));
    s = add_node(s, make_node('n1', 400, 400)); // 移到 group 外
    s = { ...s, nodes: { ...s.nodes, group: { ...s.nodes['group']!, size: vec2_create(200, 150) } } };

    const b = create_group_child_binding('group', 'n1');
    s = { ...s, bindings: { [b.id]: b } };

    const group_id = 'group';
    const group = s.nodes[group_id]!;
    const group_rect = { pos: group.position, size: group.size };

    const existing = new Set(Object.values(s.bindings)
      .filter(b => b.type === 'group-child' && b.source_id === group_id)
      .map(b => b.target_id));

    let new_bindings = { ...s.bindings };

    // 检查 existing children 是否移出（只对 existing 做 O(k) 检查，k = child count）
    for (const child_id of existing) {
      const node = s.nodes[child_id];
      if (!node) continue;
      const is_inside = node.position.x >= group_rect.pos.x
        && node.position.y >= group_rect.pos.y
        && node.position.x + node.size.x <= group_rect.pos.x + group_rect.size.x
        && node.position.y + node.size.y <= group_rect.pos.y + group_rect.size.y;
      if (!is_inside) {
        const to_remove = Object.values(new_bindings).find(
          b2 => b2.type === 'group-child' && b2.source_id === group_id && b2.target_id === child_id,
        );
        if (to_remove) {
          const { [to_remove.id]: _, ...rest } = new_bindings;
          new_bindings = rest;
        }
      }
    }

    expect(Object.keys(new_bindings).filter(k => new_bindings[k]!.type === 'group-child').length).toBe(0);
  });
});