import { describe, it, expect } from 'vitest';
import { auto_layout } from '@/runtime/auto_layout';
import { vec2_create } from '@/core/math';
import type { GraphNode, Wire } from '@/core/types';

const node = (id: string, x: number, y: number, w = 100, h = 80): GraphNode => ({
  id, type: 'default', position: vec2_create(x, y), size: vec2_create(w, h),
  title: id, inputs: [], outputs: [], widgets: [], custom_data: {},
});

describe('auto_layout', () => {
  it('returns empty for no nodes', () => {
    const r = auto_layout({}, {}, 800, 600);
    expect(Object.keys(r.positions).length).toBe(0);
  });

  it('positions a single node', () => {
    const r = auto_layout({ a: node('a', 0, 0) }, {}, 800, 600);
    expect(r.positions['a']).toBeDefined();
  });

  it('positions two disconnected nodes', () => {
    const r = auto_layout(
      { a: node('a', 0, 0), b: node('b', 0, 0) },
      {}, 800, 600,
    );
    expect(Object.keys(r.positions).length).toBe(2);
    expect(r.positions['a']).toBeDefined();
    expect(r.positions['b']).toBeDefined();
  });

  it('positions connected nodes in left-to-right layout', () => {
    const wires: Record<string, Wire> = {
      w1: { id: 'w1', source_node_id: 'a', source_port_id: 'out', target_node_id: 'b', target_port_id: 'in' },
    };
    const r = auto_layout(
      { a: node('a', 0, 0), b: node('b', 0, 0) },
      wires, 800, 600,
    );
    // 'a' should be left of 'b' because 'a' is source
    expect(r.positions['a']!.x).toBeLessThan(r.positions['b']!.x);
  });

  it('positions chain of 3 nodes', () => {
    const wires: Record<string, Wire> = {
      w1: { id: 'w1', source_node_id: 'a', source_port_id: 'out', target_node_id: 'b', target_port_id: 'in' },
      w2: { id: 'w2', source_node_id: 'b', source_port_id: 'out', target_node_id: 'c', target_port_id: 'in' },
    };
    const r = auto_layout(
      { a: node('a', 0, 0), b: node('b', 0, 0), c: node('c', 0, 0) },
      wires, 800, 600,
    );
    expect(r.positions['a']!.x).toBeLessThan(r.positions['b']!.x);
    expect(r.positions['b']!.x).toBeLessThan(r.positions['c']!.x);
    // Should zoom to fit
    expect(r.zoom).toBeGreaterThan(0);
    expect(r.zoom).toBeLessThanOrEqual(2);
  });

  it('handles disconnected groups independently', () => {
    const wires: Record<string, Wire> = {
      w1: { id: 'w1', source_node_id: 'a', source_port_id: 'out', target_node_id: 'b', target_port_id: 'in' },
    };
    const r = auto_layout(
      { a: node('a', 0, 0), b: node('b', 0, 0), c: node('c', 0, 0) },
      wires, 800, 600,
    );
    expect(Object.keys(r.positions).length).toBe(3);
  });

  it('computes reasonable zoom', () => {
    const r = auto_layout({ a: node('a', 0, 0) }, {}, 800, 600);
    expect(r.zoom).toBeGreaterThan(0);
    expect(r.zoom).toBeLessThanOrEqual(2);
  });
});