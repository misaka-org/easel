import { describe, it, expect } from 'vitest';
import { auto_layout } from '@/runtime/auto_layout';
import { vec2_create } from '@/core/math';
import type { GraphNode, Binding } from '@/core/types';

const node = (id: string, x: number, y: number, w = 100, h = 80): GraphNode => ({
  id,
  type: 'default',
  position: vec2_create(x, y),
  size: vec2_create(w, h),
  title: id,
  inputs: [],
  outputs: [],
  widgets: [],
  custom_data: {},
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
    const r = auto_layout({ a: node('a', 0, 0), b: node('b', 0, 0) }, {}, 800, 600);
    expect(Object.keys(r.positions).length).toBe(2);
    expect(r.positions['a']).toBeDefined();
    expect(r.positions['b']).toBeDefined();
  });

  it('positions connected nodes in left-to-right layout', () => {
    const bindings: Record<string, Binding> = {
      b1: {
        id: 'b1',
        type: 'data-flow',
        source_id: 'a',
        source_handle: 'out',
        target_id: 'b',
        target_handle: 'in',
      },
    };
    const r = auto_layout({ a: node('a', 0, 0), b: node('b', 0, 0) }, bindings, 800, 600);
    // 'a' should be left of 'b' because 'a' is source
    expect(r.positions['a']!.x).toBeLessThan(r.positions['b']!.x);
  });

  it('positions chain of 3 nodes', () => {
    const bindings: Record<string, Binding> = {
      b1: {
        id: 'b1',
        type: 'data-flow',
        source_id: 'a',
        source_handle: 'out',
        target_id: 'b',
        target_handle: 'in',
      },
      b2: {
        id: 'b2',
        type: 'data-flow',
        source_id: 'b',
        source_handle: 'out',
        target_id: 'c',
        target_handle: 'in',
      },
    };
    const r = auto_layout(
      { a: node('a', 0, 0), b: node('b', 0, 0), c: node('c', 0, 0) },
      bindings,
      800,
      600,
    );
    expect(r.positions['a']!.x).toBeLessThan(r.positions['b']!.x);
    expect(r.positions['b']!.x).toBeLessThan(r.positions['c']!.x);
    // Should zoom to fit
    expect(r.zoom).toBeGreaterThan(0);
    expect(r.zoom).toBeLessThanOrEqual(2);
  });

  it('handles disconnected groups independently', () => {
    const bindings: Record<string, Binding> = {
      b1: {
        id: 'b1',
        type: 'data-flow',
        source_id: 'a',
        source_handle: 'out',
        target_id: 'b',
        target_handle: 'in',
      },
    };
    const r = auto_layout(
      { a: node('a', 0, 0), b: node('b', 0, 0), c: node('c', 0, 0) },
      bindings,
      800,
      600,
    );
    expect(Object.keys(r.positions).length).toBe(3);
  });

  it('handles single node with large viewport', () => {
    const r = auto_layout({ a: node('a', 0, 0, 50, 30) }, {}, 1920, 1080);
    expect(r.positions['a']).toBeDefined();
    expect(r.zoom).toBeGreaterThan(0);
  });

  it('preserves node positions as Vec2 objects', () => {
    const r = auto_layout({ a: node('a', 0, 0) }, {}, 800, 600);
    expect(typeof r.positions['a']!.x).toBe('number');
    expect(typeof r.positions['a']!.y).toBe('number');
  });
  it('computes reasonable zoom', () => {
    const r = auto_layout({ a: node('a', 0, 0) }, {}, 800, 600);
    expect(r.zoom).toBeGreaterThan(0);
    expect(r.zoom).toBeLessThanOrEqual(2);
  });
});
