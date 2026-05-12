import { describe, it, expect } from 'vitest';
import { init_execution, step_execution } from '../engine';
import { register_execute_fn } from '../registry';
import * as E from 'fp-ts/Either';
import { vec2_create } from '../../core/math';
import type { GraphNode, Wire } from '../../core/types';

describe('engine', () => {
  it('should execute a node and gather outputs', async () => {
    register_execute_fn('add', async ({ inputs }) => {
      return { result: (inputs['a'] as number) + (inputs['b'] as number) };
    });

    const nodes: Record<string, GraphNode> = {
      'n1': { id: 'n1', type: 'add', position: vec2_create(0, 0), size: vec2_create(0, 0), title: '', inputs: [], outputs: [], widgets: [{ id: 'a', type: 'number', label: 'a', value: 2 }, { id: 'b', type: 'number', label: 'b', value: 3 }], custom_data: {} },
    };
    const wires: Record<string, Wire> = {};

    const exec_state_either = init_execution(nodes, wires);
    expect(E.isRight(exec_state_either)).toBe(true);
    if (E.isRight(exec_state_either)) {
      let current = exec_state_either.right;
      const step = step_execution(current, nodes, wires, (s) => { current = s; });
      await step();
      
      expect(current.status).toBe('completed');
      expect(current.node_states['n1']?.outputs['result']).toBe(5);
    }
  });
});