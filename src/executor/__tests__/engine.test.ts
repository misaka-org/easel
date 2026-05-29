import { describe, it, expect, vi } from 'vitest';
import { GraphExecutor } from '@/executor/engine';
import { create_initial_state } from '@/core/state';
import { vec2_create } from '@/core/math';
import { Store } from '@/runtime/store';
import { CameraController } from '@/runtime/camera';
import * as E from 'fp-ts/Either';
import type { Easel } from '@/runtime/easel';


function mockEasel(nodeOverrides: Record<string, any> = {}, bindingOverrides: Record<string, any> = {}) {
  const base = create_initial_state();
  const nodes = { ...base.nodes, ...nodeOverrides };
  const store = new Store({ initial_state: { ...base, nodes } });
  const camera = new CameraController(() => store.state.value, store.dispatch);
  const mock_bindings = Object.values(bindingOverrides);
  return {
    state: store.state,
    store,
    camera,
    dispatch: store.dispatch,
    get_node_instance: () => undefined,
    app_events: { on() {}, emit() {}, off() {} },
    node_events: new Map(),
    container: undefined,
    plugin_data: {
      wire: {
        get_bindings: () => mock_bindings,
      },
    },
    register: { add_node() {}, add_node_spec() {}, add_node_ns() {}, add_widget() {} },
    node_instances: new Map(),
    set_theme: () => {},
    keybindings: {
      register() {
        return () => {};
      },
    },
    theme: {},
  } as unknown as Easel;
}

function node(id: string, opts: { inputs?: any[]; outputs?: any[]; widgets?: any[] } = {}) {
  return {
    id,
    type: 'default',
    position: vec2_create(0, 0),
    size: vec2_create(100, 80),
    title: id,
    inputs: opts.inputs || [],
    outputs: opts.outputs || [],
    widgets: opts.widgets || [],
    custom_data: {},
    style_mode: 'default' as const,
    resizable: true,
  };
}

describe('executor', () => {
  describe('run', () => {
    it('completes a single node graph', async () => {
      const nodes = { a: node('a') };
      const exec = new GraphExecutor(mockEasel(nodes));
      exec.compile();
      expect(exec.state.value.status).toBe('idle');
      exec.run();
      await new Promise(r => setTimeout(r, 0));
      expect(exec.state.value.status).toBe('completed');
      expect(exec.state.value.node_states['a']?.status).toBe('completed');
    });

    it('completes a -> b chain', async () => {
      const a = node('a', { outputs: [{ id: 'out', label: 'Out', type: 'output' }] });
      const b = node('b', { inputs: [{ id: 'in', label: 'In', type: 'input' }] });
      const bindings_ab_2 = {
        b1: {
          id: 'b1',
          type: 'data-flow',
          source_id: 'a',
          source_handle: 'out',
          target_id: 'b',
          target_handle: 'in',
        },
      };
      const exec = new GraphExecutor(mockEasel({ a, b }, bindings_ab_2));
      exec.compile();
      exec.run();
      await new Promise(r => setTimeout(r, 0));
      expect(exec.state.value.status).toBe('completed');
      expect(exec.state.value.node_states['a']?.status).toBe('completed');
      expect(exec.state.value.node_states['b']?.status).toBe('completed');
    });

    it('sets error status for node with missing required input', async () => {
      const n = node('n', {
        inputs: [{ id: 'req', label: 'Required', type: 'input', required: true }],
      });
      const exec = new GraphExecutor(mockEasel({ n }));
      exec.compile();
      expect(exec.state.value.node_states['n']?.status).toBe('error');
      expect(exec.state.value.node_states['n']?.error).toContain('Required');
    });

    it('is no-op when already running', () => {
      const exec = new GraphExecutor(mockEasel({ a: node('a') }));
      exec.compile();
      exec.run();
      exec.run();
      expect(exec.state.value.status).toBe('running');
    });
  });

  describe('stop', () => {
    it('stops execution', () => {
      const exec = new GraphExecutor(mockEasel({ a: node('a') }));
      exec.compile();
      exec.run();
      exec.stop();
      expect(exec.state.value.status).toBe('stopped');
    });

    it('is safe to call when not running', () => {
      const exec = new GraphExecutor(mockEasel({ a: node('a') }));
      exec.stop();
      expect(exec.state.value.status).toBe('stopped');
    });
  });

  describe('step', () => {
    it('executes one node at a time in a -> b chain', async () => {
      const a = node('a', { outputs: [{ id: 'out', label: 'Out', type: 'output' }] });
      const b = node('b', { inputs: [{ id: 'in', label: 'In', type: 'input' }] });
      const bindings_ab = {
        b1: {
          id: 'b1',
          type: 'data-flow',
          source_id: 'a',
          source_handle: 'out',
          target_id: 'b',
          target_handle: 'in',
        },
      };
      const exec = new GraphExecutor(mockEasel({ a, b }, bindings_ab));
      exec.compile();
      expect(exec.state.value.ready_queue).toEqual(['a']);
      expect(exec.state.value.status).toBe('idle');
      await exec.step();
      expect(exec.state.value.node_states['a']?.status).toBe('completed');
      expect(exec.state.value.node_states['b']?.status).toBe('idle');
      expect(exec.state.value.ready_queue).toEqual(['b']);
      await exec.step();
      expect(exec.state.value.node_states['b']?.status).toBe('completed');
    });
  });

  describe('realtime', () => {
    it('start_realtime enables realtime mode', () => {
      const exec = new GraphExecutor(mockEasel({ a: node('a') }));
      expect(exec.realtime.value).toBe(false);
      exec.start_realtime();
      expect(exec.realtime.value).toBe(true);
    });

    it('stop_realtime disables realtime mode', () => {
      const exec = new GraphExecutor(mockEasel({ a: node('a') }));
      exec.start_realtime();
      expect(exec.realtime.value).toBe(true);
      exec.stop_realtime();
      expect(exec.realtime.value).toBe(false);
    });

    it('notify_input_change triggers re-execution in realtime mode', async () => {
      const exec = new GraphExecutor(mockEasel({ a: node('a') }));
      exec.start_realtime();
      await new Promise(r => setTimeout(r, 0));
      exec.notify_input_change('a');
      await new Promise(r => setTimeout(r, 100));
      expect(exec.state.value.status).toBe('completed');
    });

    it('notify_input_change does nothing when realtime is off', () => {
      const exec = new GraphExecutor(mockEasel({ a: node('a') }));
      exec.notify_input_change('a');
      expect(exec.state.value.status).toBe('idle');
    });

    it('realtime_execute_downstream re-executes connected nodes', async () => {
      const executeMock = vi.fn().mockResolvedValue({ out: 'val' });
      const inst = { execute: executeMock };

      const a = node('a', { outputs: [{ id: 'out', label: 'Out', type: 'output' }] });
      const b = node('b', { inputs: [{ id: 'in', label: 'In', type: 'input' }] });
      const bindings_ab = {
        b1: {
          id: 'b1',
          type: 'data-flow',
          source_id: 'a',
          source_handle: 'out',
          target_id: 'b',
          target_handle: 'in',
        },
      };
      const easel = mockEasel({ a, b }, bindings_ab);
      (easel as any).get_node_instance = () => inst;

      const exec = new GraphExecutor(easel);
      exec.compile();
      await exec['realtime_execute_downstream']('a');
      expect(exec.state.value.status).toBe('completed');
      expect(exec.state.value.node_states['a']?.status).toBe('completed');
      expect(exec.state.value.node_states['b']?.status).toBe('completed');
      expect(executeMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('inputs_fingerprint', () => {
    it('returns consistent hash for same inputs', () => {
      const exec = new GraphExecutor(mockEasel({ a: node('a') }));
      const fn = exec['inputs_fingerprint'].bind(exec);
      const a = fn({ x: 1, y: 'hello' });
      const b = fn({ y: 'hello', x: 1 });
      expect(a).toBe(b);
    });

    it('returns different hash for different values', () => {
      const exec = new GraphExecutor(mockEasel({ a: node('a') }));
      const fn = exec['inputs_fingerprint'].bind(exec);
      const a = fn({ x: 1 });
      const b = fn({ x: 2 });
      expect(a).not.toBe(b);
    });
  });

  describe('compile re-runs', () => {
    it('compile can be called multiple times', () => {
      const exec = new GraphExecutor(mockEasel({ a: node('a') }));
      const r1 = exec.compile();
      expect(E.isRight(r1)).toBe(true);
      const r2 = exec.compile();
      expect(E.isRight(r2)).toBe(true);
    });
  });

  describe('check_requirements', () => {
    it('flags missing required widget value', () => {
      const n = node('n', {
        widgets: [{ id: 'w1', label: 'Required Widget', type: 'widget', required: true }],
      });
      const exec = new GraphExecutor(mockEasel({ n }));
      exec.compile();
      expect(exec.state.value.node_states['n']?.status).toBe('error');
      expect(exec.state.value.node_states['n']?.error).toContain('Required Widget');
    });

    it('passes when required widget has value', () => {
      const n = node('n', {
        widgets: [{ id: 'w1', label: 'W', type: 'widget', required: true, value: 'ok' }],
      });
      const exec = new GraphExecutor(mockEasel({ n }));
      exec.compile();
      expect(exec.state.value.node_states['n']?.status).toBe('idle');
    });
  });

  describe('gather_inputs', () => {
    it('includes widget values and wire-connected inputs via run()', async () => {
      const executeMock = vi.fn().mockResolvedValue({ out: 'result' });
      const instA = { execute: vi.fn().mockResolvedValue({ out_a: 'from_a' }) };
      const instB = { execute: executeMock };

      const a = node('a', { outputs: [{ id: 'out_a', label: 'Out', type: 'output' }] });
      const b = node('b', {
        inputs: [{ id: 'in_b', label: 'In', type: 'input' }],
        widgets: [{ id: 'w1', label: 'Widget', type: 'widget', value: 'hello' }],
      });
      const bindings_ab = {
        b1: {
          id: 'b1',
          type: 'data-flow',
          source_id: 'a',
          source_handle: 'out_a',
          target_id: 'b',
          target_handle: 'in_b',
        },
      };
      const easel = mockEasel({ a, b }, bindings_ab);
      (easel as any).get_node_instance = (id: string) => (id === 'a' ? instA : instB);

      const exec = new GraphExecutor(easel);
      exec.compile();
      exec.run();
      await new Promise(r => setTimeout(r, 0));
      expect(executeMock).toHaveBeenCalled();
      const args = executeMock.mock.calls[0][0];
      expect(args.inputs).toHaveProperty('in_b', 'from_a');
      expect(args.inputs).toHaveProperty('w1', 'hello');
    });
  });

  describe('caching', () => {
    it('caches and reuses outputs across compilations', async () => {
      const executeMock = vi.fn().mockResolvedValue({ out: 'result' });
      const inst = { execute: executeMock };
      const a = node('a', { outputs: [{ id: 'out', label: 'Out', type: 'output' }] });
      const easel = { ...mockEasel({ a }), get_node_instance: () => inst } as any;
      const exec = new GraphExecutor(easel);
      exec.compile();
      exec.run();
      await new Promise(r => setTimeout(r, 0));
      expect(executeMock).toHaveBeenCalledTimes(1);
      exec.compile();
      exec.run();
      await new Promise(r => setTimeout(r, 0));
      expect(executeMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('handles execute rejection gracefully', async () => {
      const executeMock = vi.fn().mockRejectedValue(new Error('exec failed'));
      const inst = { execute: executeMock };
      const a = node('a', { outputs: [{ id: 'out', label: 'Out', type: 'output' }] });
      const easel = { ...mockEasel({ a }), get_node_instance: () => inst } as any;
      const exec = new GraphExecutor(easel);
      exec.compile();
      exec.run();
      await new Promise(r => setTimeout(r, 0));
      expect(exec.state.value.node_states['a']?.status).toBe('error');
      expect(exec.state.value.node_states['a']?.error).toBe('exec failed');
    });
  });
});
