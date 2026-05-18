import { describe, it, expect } from 'vitest';
import { create_initial_state } from '@/core/state';
import { create_subgraph_from_selection, add_node } from '@/core/node_ops';
import { vec2_create } from '@/core/math';
import type { GraphNode, Binding, Port } from '@/core/types';
import { create_data_flow_binding } from '@/core/types';

function mknode(id: string, opts?: { inputs?: Port[]; outputs?: Port[] }): GraphNode {
  return {
    id,
    type: 'default',
    position: vec2_create(100, 100),
    size: vec2_create(180, 100),
    title: id,
    inputs: opts?.inputs ?? [],
    outputs: opts?.outputs ?? [],
    widgets: [],
    custom_data: {},
  };
}

describe('create_subgraph_from_selection', () => {
  it('stores internal nodes and wires in custom_data.graph', () => {
    let s = create_initial_state();
    s = add_node(
      s,
      mknode('a', {
        outputs: [{ id: 'out', label: 'Out', type: 'output', value_type: 'number' }],
      }),
    );
    s = add_node(
      s,
      mknode('b', {
        inputs: [{ id: 'in', label: 'In', type: 'input', value_type: 'number' }],
      }),
    );

    const w1 = create_data_flow_binding('a', 'out', 'b', 'in');
    s = { ...s, bindings: { [w1.id]: w1 }, selected_node_ids: ['a', 'b'] };

    const result = create_subgraph_from_selection(s);
    expect(result.nodes['a']).toBeUndefined();
    expect(result.nodes['b']).toBeUndefined();

    const sg_id = Object.keys(result.nodes).find(k => k.startsWith('subgraph_'))!;
    const sg = result.nodes[sg_id];
    expect(sg.type).toBe('subgraph');

    const graph = sg.custom_data['graph'] as {
      nodes: Record<string, GraphNode>;
      bindings: Record<string, Binding>;
    };
    expect(graph.nodes['a']).toBeDefined();
    expect(graph.nodes['b']).toBeDefined();

    // Internal wire a→b preserved in graph.bindings
    const w = Object.values(graph.bindings).find(
      b => b.type === 'data-flow' && b.source_id === 'a' && b.target_id === 'b',
    );
    expect(w).toBeDefined();

    // Subgraph has stubs
    const stub_in = Object.values(graph.nodes).find(n => n.type === 'subgraph_input');
    const stub_out = Object.values(graph.nodes).find(n => n.type === 'subgraph_output');
    expect(stub_in).toBeDefined();
    expect(stub_out).toBeDefined();
  });

  it('routes external wire through subgraph port + stub', () => {
    let s = create_initial_state();
    s = add_node(
      s,
      mknode('a', {
        outputs: [{ id: 'out', label: 'Out', type: 'output', value_type: 'number' }],
      }),
    );
    s = add_node(
      s,
      mknode('c', {
        inputs: [{ id: 'data', label: 'Data', type: 'input', value_type: 'number' }],
      }),
    );

    const w1 = create_data_flow_binding('a', 'out', 'c', 'data');
    s = { ...s, bindings: { [w1.id]: w1 }, selected_node_ids: ['a'] };

    const result = create_subgraph_from_selection(s);
    const sg_id = Object.keys(result.nodes).find(k => k.startsWith('subgraph_'))!;
    const sg = result.nodes[sg_id];

    // External binding: subgraph → c
    const ext = Object.values(result.bindings).find(
      b => b.type === 'data-flow' && b.source_id === sg_id && b.target_id === 'c',
    );
    expect(ext).toBeDefined();
    expect(ext!.target_handle).toBe('data');

    const graph = sg.custom_data['graph'] as {
      nodes: Record<string, GraphNode>;
      bindings: Record<string, Binding>;
    };
    // Internal: a → stub_out
    const stub_out = Object.values(graph.nodes).find(n => n.type === 'subgraph_output')!;
    const internal = Object.values(graph.bindings).find(
      b => b.type === 'data-flow' && b.source_id === 'a' && b.target_id === stub_out.id,
    );
    expect(internal).toBeDefined();
  });

  it('entering subgraph produces state with correct wires', () => {
    let s = create_initial_state();
    s = add_node(
      s,
      mknode('a', {
        outputs: [{ id: 'out', label: 'Out', type: 'output', value_type: 'number' }],
      }),
    );
    s = add_node(
      s,
      mknode('b', {
        inputs: [{ id: 'in', label: 'In', type: 'input', value_type: 'number' }],
      }),
    );
    s = add_node(
      s,
      mknode('c', {
        inputs: [{ id: 'data', label: 'Data', type: 'input', value_type: 'number' }],
      }),
    );

    // a→b (internal), a→c (external)
    const w1 = create_data_flow_binding('a', 'out', 'b', 'in');
    const w2 = create_data_flow_binding('a', 'out', 'c', 'data');
    s = { ...s, bindings: { [w1.id]: w1, [w2.id]: w2 }, selected_node_ids: ['a', 'b'] };

    const result = create_subgraph_from_selection(s);
    const sg_id = Object.keys(result.nodes).find(k => k.startsWith('subgraph_'))!;
    const sg = result.nodes[sg_id];
    const graph = sg.custom_data['graph'] as {
      nodes: Record<string, GraphNode>;
      bindings: Record<string, Binding>;
    };

    // Simulate subgraph_plugin enter_subgraph
    const inner = { ...create_initial_state(), nodes: graph.nodes, bindings: graph.bindings };

    // Check internal wire a→b
    const wired = Object.values(inner.bindings).find(
      b => b.type === 'data-flow' && b.source_id === 'a' && b.target_id === 'b',
    );
    expect(wired).toBeDefined();

    // Check stub wire a→stub_out
    const stub_out = Object.values(inner.nodes).find(n => n.type === 'subgraph_output')!;
    const stub_wire = Object.values(inner.bindings).find(
      b => b.type === 'data-flow' && b.source_id === 'a' && b.target_id === stub_out.id,
    );
    expect(stub_wire).toBeDefined();
  });
});
