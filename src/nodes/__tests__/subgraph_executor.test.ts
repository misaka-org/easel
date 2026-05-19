// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { execute_subgraph } from '@/nodes/subgraph_executor';
import { register_node_type } from '@/runtime/registry';
import type { GraphNode, Binding, Port } from '@/core/types';
import type { ExecuteContext } from '@/runtime/registry';
import { vec2_create } from '@/core/math';

// helper: minimal subgraph node
function mk_node(id: string, type: string, overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    type,
    position: vec2_create(0, 0),
    size: vec2_create(100, 80),
    title: id,
    inputs: [],
    outputs: [],
    custom_data: {},
    ...overrides,
  } as GraphNode;
}

function mk_input_stub(id: string, count: number): GraphNode {
  const outputs: Port[] = [];
  for (let i = 0; i < count; i++) outputs.push({ id: 'sgi_out_' + i, label: 'In ' + i, type: 'output', value_type: 'any' });
  return mk_node(id, 'subgraph_input', { outputs, size: vec2_create(20, 20) });
}

function mk_output_stub(id: string, count: number): GraphNode {
  const inputs: Port[] = [];
  for (let i = 0; i < count; i++) inputs.push({ id: 'sgo_in_' + i, label: 'Out ' + i, type: 'input', value_type: 'any' });
  return mk_node(id, 'subgraph_output', { inputs, size: vec2_create(20, 20) });
}

function binding(src_id: string, src_port: string, tgt_id: string, tgt_port: string): Binding {
  return {
    id: 'b_' + src_id + '_' + tgt_id,
    type: 'data-flow',
    source_id: src_id,
    source_handle: src_port,
    target_id: tgt_id,
    target_handle: tgt_port,
  };
}

function mk_ctx(node: GraphNode, inputs: Record<string, unknown> = {}, signal?: AbortSignal): ExecuteContext {
  return {
    node,
    inputs,
    report_progress: () => {},
    signal,
  };
}

function register_mock(type: string, exec_fn?: (ctx: ExecuteContext) => Promise<Record<string, unknown>>) {
  const default_exec = async () => ({});
  class M {
    execute: (ctx: ExecuteContext) => Promise<Record<string, unknown>>;
    constructor(_el: HTMLElement, _dispatch: any, _id: string, _ctx: any) {
      this.execute = exec_fn ?? default_exec;
    }
  }
  register_node_type(type, M as any);
}

describe('execute_subgraph', () => {
  it('returns empty for missing graph', async () => {
    const node = mk_node('sg', 'subgraph');
    const r = await execute_subgraph(mk_ctx(node));
    expect(r).toEqual({});
  });

  it('returns empty for empty internal nodes', async () => {
    const node = mk_node('sg', 'subgraph', {
      custom_data: { graph: { nodes: {}, bindings: {} } },
    });
    const r = await execute_subgraph(mk_ctx(node));
    expect(r).toEqual({});
  });

  it('passthrough: single input → stub_in → stub_out → output', async () => {
    const stub_in = mk_input_stub('si', 1);
    const stub_out = mk_output_stub('so', 1);
    const b = binding('si', 'sgi_out_0', 'so', 'sgo_in_0');
    const node = mk_node('sg', 'subgraph', {
      custom_data: {
        graph: {
          nodes: { si: stub_in, so: stub_out },
          bindings: { [b.id]: b },
        },
      },
    });
    const r = await execute_subgraph(mk_ctx(node, { sg_in_0: 'hello' }));
    expect(r).toEqual({ sg_out_0: 'hello' });
  });

  it('chain: input → process → output with registered node type', async () => {
    register_mock('uppercase', async (ctx) => ({ out: String(ctx.inputs['in']).toUpperCase() }));

    const stub_in = mk_input_stub('si', 1);
    const stub_out = mk_output_stub('so', 1);
    const proc = mk_node('p', 'uppercase', {
      inputs: [{ id: 'in', label: 'In', type: 'input', value_type: 'text' }],
      outputs: [{ id: 'out', label: 'Out', type: 'output', value_type: 'text' }],
    });

    const b1 = binding('si', 'sgi_out_0', 'p', 'in');
    const b2 = binding('p', 'out', 'so', 'sgo_in_0');
    const node = mk_node('sg', 'subgraph', {
      custom_data: {
        graph: {
          nodes: { si: stub_in, p: proc, so: stub_out },
          bindings: { [b1.id]: b1, [b2.id]: b2 },
        },
      },
    });

    const r = await execute_subgraph(mk_ctx(node, { sg_in_0: 'world' }));
    expect(r).toEqual({ sg_out_0: 'WORLD' });
  });

  it('widget values flow into internal nodes', async () => {
    register_mock('multiply', async (ctx) => {
      const factor = Number(ctx.inputs['factor']);
      const val = Number(ctx.inputs['val']);
      return { out: factor * val };
    });

    const stub_in = mk_input_stub('si', 1);
    const stub_out = mk_output_stub('so', 1);
    const proc = mk_node('m', 'multiply', {
      inputs: [
        { id: 'val', label: 'Value', type: 'input', value_type: 'number' },
      ],
      outputs: [{ id: 'out', label: 'Result', type: 'output', value_type: 'number' }],
      widgets: [{ id: 'factor', label: 'Factor', type: 'number', value: 10 }],
    });

    const b1 = binding('si', 'sgi_out_0', 'm', 'val');
    const b2 = binding('m', 'out', 'so', 'sgo_in_0');
    const node = mk_node('sg', 'subgraph', {
      custom_data: {
        graph: {
          nodes: { si: stub_in, m: proc, so: stub_out },
          bindings: { [b1.id]: b1, [b2.id]: b2 },
        },
      },
    });

    const r = await execute_subgraph(mk_ctx(node, { sg_in_0: 5 }));
    expect(r).toEqual({ sg_out_0: 50 });
  });

  it('unknown node type is skipped gracefully', async () => {
    const stub_in = mk_input_stub('si', 1);
    const stub_out = mk_output_stub('so', 1);
    const unknown = mk_node('u', 'nonexistent', {
      inputs: [{ id: 'in', label: 'In', type: 'input' }],
      outputs: [{ id: 'out', label: 'Out', type: 'output' }],
    });

    const b1 = binding('si', 'sgi_out_0', 'u', 'in');
    const b2 = binding('u', 'out', 'so', 'sgo_in_0');
    const node = mk_node('sg', 'subgraph', {
      custom_data: {
        graph: {
          nodes: { si: stub_in, u: unknown, so: stub_out },
          bindings: { [b1.id]: b1, [b2.id]: b2 },
        },
      },
    });

    const r = await execute_subgraph(mk_ctx(node, { sg_in_0: 'data' }));
    // unknown node produces {}, so no value reaches output
    expect(r).toEqual({});
  });

  it('nested subgraph executes recursively', async () => {
    // inner: stub_in → add1 → stub_out
    register_mock('add1', async (ctx) => ({ out: Number(ctx.inputs['in']) + 1 }));

    const inner_si = mk_input_stub('inner_si', 1);
    const inner_so = mk_output_stub('inner_so', 1);
    const inner_proc = mk_node('add', 'add1', {
      inputs: [{ id: 'in', label: 'In', type: 'input', value_type: 'number' }],
      outputs: [{ id: 'out', label: 'Out', type: 'output', value_type: 'number' }],
    });
    const inner_b1 = binding('inner_si', 'sgi_out_0', 'add', 'in');
    const inner_b2 = binding('add', 'out', 'inner_so', 'sgo_in_0');

    // register subgraph type that uses execute_subgraph
    register_mock('subgraph', async (ctx) => execute_subgraph(ctx));

    // outer: stub_in → inner_subgraph → stub_out
    const outer_si = mk_input_stub('outer_si', 1);
    const outer_so = mk_output_stub('outer_so', 1);
    const inner_sg = mk_node('inner_sg', 'subgraph', {
      inputs: [{ id: 'sg_in_0', label: 'In', type: 'input' }],
      outputs: [{ id: 'sg_out_0', label: 'Out', type: 'output' }],
      custom_data: {
        graph: {
          nodes: { inner_si, add: inner_proc, inner_so },
          bindings: { [inner_b1.id]: inner_b1, [inner_b2.id]: inner_b2 },
        },
      },
    });

    const ob1 = binding('outer_si', 'sgi_out_0', 'inner_sg', 'sg_in_0');
    const ob2 = binding('inner_sg', 'sg_out_0', 'outer_so', 'sgo_in_0');
    const node = mk_node('outer_sg', 'subgraph', {
      custom_data: {
        graph: {
          nodes: { outer_si, inner_sg, outer_so },
          bindings: { [ob1.id]: ob1, [ob2.id]: ob2 },
        },
      },
    });

    const r = await execute_subgraph(mk_ctx(node, { sg_in_0: 41 }));
    expect(r).toEqual({ sg_out_0: 42 });
  });

  it('aborts on signal', async () => {
    register_mock('slow', async (ctx) => {
      // check signal before work
      if (ctx.signal?.aborted) return {};
      return { out: 'done' };
    });

    const stub_in = mk_input_stub('si', 1);
    const stub_out = mk_output_stub('so', 1);
    const proc = mk_node('s', 'slow', {
      inputs: [{ id: 'in', label: 'In', type: 'input' }],
      outputs: [{ id: 'out', label: 'Out', type: 'output' }],
    });
    const b1 = binding('si', 'sgi_out_0', 's', 'in');
    const b2 = binding('s', 'out', 'so', 'sgo_in_0');
    const node = mk_node('sg', 'subgraph', {
      custom_data: {
        graph: {
          nodes: { si: stub_in, s: proc, so: stub_out },
          bindings: { [b1.id]: b1, [b2.id]: b2 },
        },
      },
    });

    const controller = new AbortController();
    controller.abort(); // pre-aborted
    const r = await execute_subgraph(mk_ctx(node, { sg_in_0: 'x' }, controller.signal));
    expect(r).toEqual({});
  });

  it('error in one node does not block unrelated parallel branches', async () => {
    register_mock('throws', async () => { throw new Error('boom'); });
    register_mock('ok', async (ctx) => ({ out: 'ok-' + ctx.inputs['in'] }));

    const stub_in = mk_input_stub('si', 1);
    // single output stub with 2 ports: bad→port0, good→port1
    const stub_out = mk_output_stub('so', 2);

    const bad = mk_node('bad', 'throws', {
      inputs: [{ id: 'in', label: 'In', type: 'input' }],
      outputs: [{ id: 'out', label: 'Out', type: 'output' }],
    });
    const good = mk_node('good', 'ok', {
      inputs: [{ id: 'in', label: 'In', type: 'input' }],
      outputs: [{ id: 'out', label: 'Out', type: 'output' }],
    });

    const b1 = binding('si', 'sgi_out_0', 'bad', 'in');
    const b2 = binding('si', 'sgi_out_0', 'good', 'in');
    const b3 = binding('bad', 'out', 'so', 'sgo_in_0'); // throws → no output
    const b4 = binding('good', 'out', 'so', 'sgo_in_1');

    const node = mk_node('sg', 'subgraph', {
      inputs: [{ id: 'sg_in_0', label: 'In', type: 'input' }],
      outputs: [
        { id: 'sg_out_0', label: 'Out 1', type: 'output' },
        { id: 'sg_out_1', label: 'Out 2', type: 'output' },
      ],
      custom_data: {
        graph: {
          nodes: { si: stub_in, bad, good, so: stub_out },
          bindings: { [b1.id]: b1, [b2.id]: b2, [b3.id]: b3, [b4.id]: b4 },
        },
      },
    });

    const r = await execute_subgraph(mk_ctx(node, { sg_in_0: 'x' }));
    expect(r).toEqual({ sg_out_0: undefined, sg_out_1: 'ok-x' });
  });
});
