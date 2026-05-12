import { describe, it, expect } from 'vitest';
import { topological_sort } from '../scheduler';
import * as E from 'fp-ts/Either';
import { vec2_create } from '../../core/math';
import type { GraphNode, Wire } from '../../core/types';

describe('scheduler', () => {
  it('should topologically sort a simple graph', () => {
    const nodes: Record<string, GraphNode> = {
      'a': { id: 'a', type: 'default', position: vec2_create(0, 0), size: vec2_create(0, 0), title: '', inputs: [], outputs: [], custom_data: {} },
      'b': { id: 'b', type: 'default', position: vec2_create(0, 0), size: vec2_create(0, 0), title: '', inputs: [], outputs: [], custom_data: {} },
      'c': { id: 'c', type: 'default', position: vec2_create(0, 0), size: vec2_create(0, 0), title: '', inputs: [], outputs: [], custom_data: {} },
    };
    const wires: Record<string, Wire> = {
      'w1': { id: 'w1', source_node_id: 'a', source_port_id: 'out', target_node_id: 'b', target_port_id: 'in' },
      'w2': { id: 'w2', source_node_id: 'b', source_port_id: 'out', target_node_id: 'c', target_port_id: 'in' },
    };

    const res = topological_sort(nodes, wires);
    expect(E.isRight(res)).toBe(true);
    if (E.isRight(res)) {
      expect(res.right).toEqual(['a', 'b', 'c']);
    }
  });

  it('should fail on cyclic graph', () => {
    const nodes: Record<string, GraphNode> = {
      'a': { id: 'a', type: 'default', position: vec2_create(0, 0), size: vec2_create(0, 0), title: '', inputs: [], outputs: [], custom_data: {} },
      'b': { id: 'b', type: 'default', position: vec2_create(0, 0), size: vec2_create(0, 0), title: '', inputs: [], outputs: [], custom_data: {} },
    };
    const wires: Record<string, Wire> = {
      'w1': { id: 'w1', source_node_id: 'a', source_port_id: 'out', target_node_id: 'b', target_port_id: 'in' },
      'w2': { id: 'w2', source_node_id: 'b', source_port_id: 'out', target_node_id: 'a', target_port_id: 'in' },
    };

    const res = topological_sort(nodes, wires);
    expect(E.isLeft(res)).toBe(true);
  });
});