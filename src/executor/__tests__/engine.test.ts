import { describe, it, expect, beforeEach } from 'vitest';
import { ref, shallowRef } from '@vue/reactivity';
import { GraphExecutor, create_initial_execution_state } from '@/executor/engine';
import { create_initial_state } from '@/core/state';
import { add_node } from '@/core/node_ops';
import { add_wire } from '@/core/wire_ops';
import { vec2_create } from '@/core/math';
import type { State, GraphNode } from '@/core/types';

/** Minimal Easel mock that satisfies compile()'s needs. */
function mockEasel(overrides: Partial<State> = {}) {
  const base = { ...create_initial_state(), ...overrides };
  const stateRef = shallowRef(base);
  return {
    state: stateRef,
    get_node_instance: () => undefined,
    dispatch: (fn: (s: State) => State) => { stateRef.value = fn(stateRef.value); },
    app_events: { on() {}, emit() {}, off() {} },
    node_events: new Map(),
    // no DOM needed for compile tests
    plugin_data: {},
    register: { add_node() {}, add_node_spec() {}, add_node_ns() {}, add_widget() {} },
    node_instances: new Map(),
    keybindings: { register() { return () => {} } },
    theme: {},
  } as any;
}

function node(id: string, opts: { req?: boolean; inputs?: any[]; outputs?: any[] } = {}): GraphNode {
  return {
    id, type: 'default', position: vec2_create(0, 0), size: vec2_create(100, 80),
    title: id,
    inputs: opts.inputs || [],
    outputs: opts.outputs || [],
    widgets: [],
    custom_data: {},
    style_mode: 'default',
    resizable: true,
  };
}

describe('create_initial_execution_state', () => {
  it('returns correct default values', () => {
    const s = create_initial_execution_state();
    expect(s.status).toBe('idle');
    expect(s.node_states).toEqual({});
    expect(s.ready_queue).toEqual([]);
    expect(s.running_nodes).toEqual([]);
    expect(s.in_degrees).toEqual({});
    expect(s.adj).toEqual({});
  });
});

describe('GraphExecutor.compile', () => {
  it('compiles empty graph', () => {
    const exec = new GraphExecutor(mockEasel());
    exec.compile();
    const s = exec.state.value;
    expect(s.status).toBe('idle');
    expect(s.node_states).toEqual({});
    expect(s.in_degrees).toEqual({});
  });

  it('compiles single node', () => {
    const nodes = { n1: node('n1') };
    const exec = new GraphExecutor(mockEasel({ nodes }));
    exec.compile();
    const s = exec.state.value;
    expect(s.node_states['n1']?.status).toBe('idle');
    expect(s.ready_queue).toContain('n1');
    expect(s.in_degrees['n1']).toBe(0);
  });

  it('compiles two nodes with wire (a -> b)', () => {
    const n1 = node('n1', { outputs: [{ id: 'out', label: 'Out', type: 'output' }] });
    const n2 = node('n2', { inputs: [{ id: 'in', label: 'In', type: 'input' }] });
    const nodes = { n1, n2 };
    const wires = { w1: { id: 'w1', source_node_id: 'n1', source_port_id: 'out', target_node_id: 'n2', target_port_id: 'in' } };
    const exec = new GraphExecutor(mockEasel({ nodes, wires }));
    exec.compile();
    const s = exec.state.value;
    expect(s.node_states['n1']?.status).toBe('idle');
    expect(s.node_states['n2']?.status).toBe('idle');
    // n1 has in_degree 0 (source), n2 has in_degree 1 (target)
    expect(s.in_degrees['n1']).toBe(0);
    expect(s.in_degrees['n2']).toBe(1);
    expect(s.ready_queue).toContain('n1');
    expect(s.ready_queue).not.toContain('n2');
    expect(s.adj['n1']).toContain('n2');
  });

  it('compiles chain a -> b -> c with correct topology', () => {
    const a = node('a', { outputs: [{ id: 'out', label: 'Out', type: 'output' }] });
    const b = node('b', { inputs: [{ id: 'in', label: 'In', type: 'input' }], outputs: [{ id: 'out', label: 'Out', type: 'output' }] });
    const c = node('c', { inputs: [{ id: 'in', label: 'In', type: 'input' }] });
    const nodes = { a, b, c };
    const wires = {
      w1: { id: 'w1', source_node_id: 'a', source_port_id: 'out', target_node_id: 'b', target_port_id: 'in' },
      w2: { id: 'w2', source_node_id: 'b', source_port_id: 'out', target_node_id: 'c', target_port_id: 'in' },
    };
    const exec = new GraphExecutor(mockEasel({ nodes, wires }));
    exec.compile();
    const s = exec.state.value;
    expect(s.in_degrees['a']).toBe(0);
    expect(s.in_degrees['b']).toBe(1);
    expect(s.in_degrees['c']).toBe(1);
    expect(s.adj['a']).toEqual(['b']);
    expect(s.adj['b']).toEqual(['c']);
    expect(s.ready_queue).toEqual(['a']);
  });

  it('handles disconnected nodes (no wires)', () => {
    const nodes = { a: node('a'), b: node('b'), c: node('c') };
    const exec = new GraphExecutor(mockEasel({ nodes }));
    exec.compile();
    const s = exec.state.value;
    expect(s.in_degrees['a']).toBe(0);
    expect(s.in_degrees['b']).toBe(0);
    expect(s.in_degrees['c']).toBe(0);
    expect(s.ready_queue).toContain('a');
    expect(s.ready_queue).toContain('b');
    expect(s.ready_queue).toContain('c');
  });

  it('marks node with missing required input as error', () => {
    const n = node('n', { inputs: [{ id: 'req', label: 'Required', type: 'input', required: true }] });
    const exec = new GraphExecutor(mockEasel({ nodes: { n } }));
    exec.compile();
    const s = exec.state.value;
    expect(s.node_states['n']?.status).toBe('error');
    expect(s.node_states['n']?.error).toContain('Required');
  });

  it('marks node with required input satisfied as idle', () => {
    const a = node('a', { outputs: [{ id: 'out', label: 'Out', type: 'output' }] });
    const b = node('b', { inputs: [{ id: 'req', label: 'Required', type: 'input', required: true }] });
    const wires = { w1: { id: 'w1', source_node_id: 'a', source_port_id: 'out', target_node_id: 'b', target_port_id: 'req' } };
    const exec = new GraphExecutor(mockEasel({ nodes: { a, b }, wires }));
    exec.compile();
    const s = exec.state.value;
    expect(s.node_states['b']?.status).toBe('idle');
    expect(s.node_states['b']?.error).toBeUndefined();
  });

  it('clear_cache resets cache', () => {
    const exec = new GraphExecutor(mockEasel());
    // Access private input_cache via loose typing
    (exec as any).input_cache.set('n1', { fingerprint: 'x', outputs: {} });
    expect((exec as any).input_cache.size).toBe(1);
    exec.clear_cache();
    expect((exec as any).input_cache.size).toBe(0);
  });
});