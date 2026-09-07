import { describe, expect, it } from 'vitest';
import type { GraphNode } from '@/core/types';
import { get_locked_binding_ids, is_binding_locked } from '../lock';

const make_node = (id: string, locked = false): GraphNode => ({
  id,
  type: 'default',
  position: { x: 0, y: 0 },
  size: { x: 100, y: 80 },
  title: id,
  inputs: [],
  outputs: [],
  custom_data: {},
  ...(locked ? { locked: true } : {}),
});

describe('wire binding lock helpers', () => {
  it('locks a binding when its source node is locked', () => {
    const nodes = {
      source: make_node('source', true),
      target: make_node('target'),
    };
    expect(is_binding_locked(nodes, { source_id: 'source', target_id: 'target' })).toBe(true);
  });

  it('locks a binding when its target node is locked', () => {
    const nodes = {
      source: make_node('source'),
      target: make_node('target', true),
    };
    expect(is_binding_locked(nodes, { source_id: 'source', target_id: 'target' })).toBe(true);
  });

  it('does not lock an unlocked binding or missing nodes', () => {
    const nodes = {
      source: make_node('source'),
      target: make_node('target'),
    };
    expect(is_binding_locked(nodes, { source_id: 'source', target_id: 'target' })).toBe(false);
    expect(is_binding_locked(nodes, { source_id: 'missing', target_id: 'target' })).toBe(false);
  });

  it('returns only locked binding ids from a binding list', () => {
    const nodes = {
      source: make_node('source', true),
      target: make_node('target'),
      other: make_node('other'),
    };
    const bindings = [
      { id: 'locked', source_id: 'source', target_id: 'target' },
      { id: 'unlocked', source_id: 'target', target_id: 'other' },
      { id: 'missing', source_id: 'missing', target_id: 'target' },
    ];

    expect(get_locked_binding_ids(nodes, bindings)).toEqual(new Set(['locked']));
  });
});
