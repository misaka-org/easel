import { describe, expect, it } from 'vitest';
import type { Port } from '@/core/types';
import type { GraphBindingRecord, GraphDocument, GraphNodeRecord } from '@/core/graph/types';
import {
  add_binding,
  add_graph,
  add_node,
  create_empty_graph_document,
  remove_graph,
  type GraphDocumentError,
} from '@/core/graph/document';
import { pack_nodes, unpack_subgraph, type PackNodesOptions } from '@/core/graph/subgraph';
import * as E from 'fp-ts/Either';

const port = (id: string, kind: 'input' | 'output', value_type = 'text'): Port => {
  return { id, label: id, type: kind, value_type };
};

const make_node = (
  id: string,
  graph_id: string,
  inputs: readonly Port[] = [],
  outputs: readonly Port[] = [],
  nested_graph_id?: string,
): GraphNodeRecord => {
  return {
    id,
    graph_id,
    nested_graph_id,
    type: 'default',
    position: { x: 0, y: 0 },
    size: { x: 100, y: 100 },
    title: id,
    inputs,
    outputs,
    custom_data: {},
  };
};

const make_binding = (
  id: string,
  graph_id: string,
  source_id: string,
  source_handle: string,
  target_id: string,
  target_handle: string,
): GraphBindingRecord => {
  return {
    id,
    graph_id,
    source_id,
    source_handle,
    target_id,
    target_handle,
  };
};

const unwrap_document = (result: E.Either<GraphDocumentError, GraphDocument>): GraphDocument => {
  if (E.isLeft(result)) {
    throw new Error(`unexpected error: ${result.left.type}`);
  }
  return result.right;
};

const unwrap_error = (result: E.Either<GraphDocumentError, GraphDocument>): GraphDocumentError => {
  if (E.isRight(result)) {
    throw new Error('expected an error');
  }
  return result.left;
};

const add_nodes = (document: GraphDocument, nodes: readonly GraphNodeRecord[]): GraphDocument => {
  return nodes.reduce((acc, node) => unwrap_document(add_node(acc, node)), document);
};

const add_bindings = (
  document: GraphDocument,
  bindings: readonly GraphBindingRecord[],
): GraphDocument => {
  return bindings.reduce((acc, binding) => unwrap_document(add_binding(acc, binding)), document);
};

describe('graph subgraph pack/unpack', () => {
  it('packs internal nodes and bindings into a new scope without stubs', () => {
    const a = make_node('a', 'root', [], [port('out', 'output', 'text')]);
    const b = make_node('b', 'root', [port('in', 'input', 'text')], []);
    const document = add_bindings(add_nodes(create_empty_graph_document(), [a, b]), [
      make_binding('internal', 'root', 'a', 'out', 'b', 'in'),
    ]);

    const options: PackNodesOptions = {
      source_graph_id: 'root',
      node_ids: ['a', 'b'],
      graph_id: 'child',
      host_node_id: 'host',
    };
    const packed = unwrap_document(pack_nodes(document, options));

    expect(packed.nodes['a']?.graph_id).toBe('child');
    expect(packed.nodes['b']?.graph_id).toBe('child');
    expect(packed.nodes['host']?.graph_id).toBe('root');
    expect(packed.nodes['host']?.nested_graph_id).toBe('child');
    expect(packed.nodes['host']?.inputs).toEqual([]);
    expect(packed.nodes['host']?.outputs).toEqual([]);
    expect(packed.bindings['internal']).toEqual({
      ...document.bindings['internal'],
      graph_id: 'child',
    });
    expect(packed.graphs['child']?.kind).toBe('subgraph');
    expect(packed.graphs['child']?.parent_graph_id).toBe('root');
    expect(packed.graphs['child']?.input_slots).toEqual([]);
    expect(packed.graphs['child']?.output_slots).toEqual([]);
    expect(packed.boundary_bindings).toEqual({});
  });

  it('replaces crossing bindings with host ports and boundary bindings', () => {
    const external_source = make_node(
      'external_source',
      'root',
      [],
      [port('source_out', 'output', 'text')],
    );
    const internal_target = make_node('target', 'root', [port('target_in', 'input', 'text')], []);
    const internal_source = make_node(
      'source',
      'root',
      [],
      [port('source_out_number', 'output', 'number')],
    );
    const external_target = make_node(
      'external_target',
      'root',
      [port('target_in_number', 'input', 'number')],
      [],
    );
    const document = add_bindings(
      add_nodes(create_empty_graph_document(), [
        external_source,
        internal_target,
        internal_source,
        external_target,
      ]),
      [
        make_binding(
          'external_input',
          'root',
          'external_source',
          'source_out',
          'target',
          'target_in',
        ),
        make_binding(
          'external_output',
          'root',
          'source',
          'source_out_number',
          'external_target',
          'target_in_number',
        ),
      ],
    );

    const packed = unwrap_document(
      pack_nodes(document, {
        source_graph_id: 'root',
        node_ids: ['source', 'target'],
        graph_id: 'child',
        host_node_id: 'host',
        host_title: 'Packed',
      }),
    );

    const host = packed.nodes['host'];
    expect(host?.nested_graph_id).toBe('child');
    expect(host?.inputs.map(port => port.id)).toEqual(['input_0']);
    expect(host?.outputs.map(port => port.id)).toEqual(['output_0']);
    expect(host?.inputs[0]?.value_type).toBe('text');
    expect(host?.outputs[0]?.value_type).toBe('number');

    const child = packed.graphs['child'];
    expect(child?.input_slots[0]?.id).toBe('input_0');
    expect(child?.output_slots[0]?.id).toBe('output_0');
    expect(host?.inputs[0]?.id).toBe(child?.input_slots[0]?.id);
    expect(host?.outputs[0]?.id).toBe(child?.output_slots[0]?.id);

    const boundary_values = Object.values(packed.boundary_bindings);
    const input_boundary = boundary_values.find(boundary => boundary.direction === 'input');
    const output_boundary = boundary_values.find(boundary => boundary.direction === 'output');
    expect(input_boundary).toEqual({
      id: 'child:input:0',
      graph_id: 'child',
      direction: 'input',
      slot_id: 'input_0',
      node_id: 'target',
      port_id: 'target_in',
    });
    expect(output_boundary).toEqual({
      id: 'child:output:0',
      graph_id: 'child',
      direction: 'output',
      slot_id: 'output_0',
      node_id: 'source',
      port_id: 'source_out_number',
    });

    expect(packed.nodes['target']?.graph_id).toBe('child');
    expect(packed.nodes['source']?.graph_id).toBe('child');
    expect(packed.bindings['external_input']).toEqual({
      id: 'external_input',
      graph_id: 'root',
      source_id: 'external_source',
      source_handle: 'source_out',
      target_id: 'host',
      target_handle: 'input_0',
    });
    expect(packed.bindings['external_output']).toEqual({
      id: 'external_output',
      graph_id: 'root',
      source_id: 'host',
      source_handle: 'output_0',
      target_id: 'external_target',
      target_handle: 'target_in_number',
    });
    expect(Object.values(packed.nodes).some(node => node.type === 'subgraph_input')).toBe(false);
    expect(Object.values(packed.nodes).some(node => node.type === 'subgraph_output')).toBe(false);
  });

  it('restores the original graph through pack then unpack', () => {
    const external_source = make_node(
      'external_source',
      'root',
      [],
      [port('source_out', 'output', 'text')],
    );
    const internal_target = make_node('target', 'root', [port('target_in', 'input', 'text')], []);
    const internal_source = make_node(
      'source',
      'root',
      [],
      [port('source_out_number', 'output', 'number')],
    );
    const external_target = make_node(
      'external_target',
      'root',
      [port('target_in_number', 'input', 'number')],
      [],
    );
    const document = add_bindings(
      add_nodes(create_empty_graph_document(), [
        external_source,
        internal_target,
        internal_source,
        external_target,
      ]),
      [
        make_binding(
          'external_input',
          'root',
          'external_source',
          'source_out',
          'target',
          'target_in',
        ),
        make_binding(
          'external_output',
          'root',
          'source',
          'source_out_number',
          'external_target',
          'target_in_number',
        ),
      ],
    );

    const packed = unwrap_document(
      pack_nodes(document, {
        source_graph_id: 'root',
        node_ids: ['source', 'target'],
        graph_id: 'child',
        host_node_id: 'host',
      }),
    );
    const unpacked = unwrap_document(unpack_subgraph(packed, 'host'));

    expect(unpacked).toEqual(document);
    expect(unpacked.boundary_bindings).toEqual({});
  });

  it('validates pack arguments', () => {
    const with_other_graph = unwrap_document(
      add_graph(create_empty_graph_document(), {
        id: 'other',
        kind: 'subgraph',
        parent_graph_id: 'root',
        title: 'other',
        input_slots: [],
        output_slots: [],
      }),
    );
    const document = add_nodes(with_other_graph, [make_node('a', 'root'), make_node('b', 'other')]);

    const empty_result = pack_nodes(document, {
      source_graph_id: 'root',
      node_ids: [],
      graph_id: 'child',
      host_node_id: 'host',
    });
    expect(unwrap_error(empty_result).type).toBe('empty_node_selection');

    const missing_graph_result = pack_nodes(document, {
      source_graph_id: 'missing',
      node_ids: ['a'],
      graph_id: 'child',
      host_node_id: 'host',
    });
    expect(unwrap_error(missing_graph_result).type).toBe('graph_not_found');

    const cross_graph_result = pack_nodes(document, {
      source_graph_id: 'root',
      node_ids: ['a', 'b'],
      graph_id: 'child',
      host_node_id: 'host',
    });
    expect(unwrap_error(cross_graph_result).type).toBe('node_not_in_source_graph');

    const duplicate_host_result = pack_nodes(document, {
      source_graph_id: 'root',
      node_ids: ['a'],
      graph_id: 'child',
      host_node_id: 'a',
    });
    expect(unwrap_error(duplicate_host_result).type).toBe('host_node_in_selection');

    const with_subgraph = unwrap_document(
      add_graph(document, {
        id: 'existing_graph',
        kind: 'subgraph',
        parent_graph_id: 'root',
        title: 'existing',
        input_slots: [],
        output_slots: [],
      }),
    );
    const graph_conflict_result = pack_nodes(with_subgraph, {
      source_graph_id: 'root',
      node_ids: ['a'],
      graph_id: 'existing_graph',
      host_node_id: 'host',
    });
    expect(unwrap_error(graph_conflict_result).type).toBe('graph_already_exists');
  });

  it('packs and unpacks a nested host', () => {
    const a = make_node('a', 'root', [], [port('out', 'output', 'text')]);
    const b = make_node('b', 'root', [port('in', 'input', 'text')], []);
    const c = make_node('c', 'root', []);
    const base = add_nodes(create_empty_graph_document(), [a, b, c]);

    const inner_packed = unwrap_document(
      pack_nodes(base, {
        source_graph_id: 'root',
        node_ids: ['a', 'b'],
        graph_id: 'inner_graph',
        host_node_id: 'inner_host',
      }),
    );
    const outer_packed = unwrap_document(
      pack_nodes(inner_packed, {
        source_graph_id: 'root',
        node_ids: ['inner_host', 'c'],
        graph_id: 'outer_graph',
        host_node_id: 'outer_host',
      }),
    );

    expect(outer_packed.nodes['outer_host']?.nested_graph_id).toBe('outer_graph');
    expect(outer_packed.nodes['inner_host']?.graph_id).toBe('outer_graph');
    expect(outer_packed.nodes['inner_host']?.nested_graph_id).toBe('inner_graph');
    expect(inner_packed.graphs['inner_graph']?.parent_graph_id).toBe('root');
    expect(outer_packed.graphs['inner_graph']?.parent_graph_id).toBe('outer_graph');

    const outer_unpacked = unwrap_document(unpack_subgraph(outer_packed, 'outer_host'));
    expect(outer_unpacked).toEqual(inner_packed);
    expect(outer_unpacked.graphs['inner_graph']?.parent_graph_id).toBe('root');
    expect(outer_unpacked.graphs['outer_graph']).toBeUndefined();

    const fully_unpacked = unwrap_document(unpack_subgraph(outer_unpacked, 'inner_host'));
    expect(fully_unpacked).toEqual(base);
    expect(fully_unpacked.nodes['a']?.graph_id).toBe('root');
    expect(fully_unpacked.nodes['b']?.graph_id).toBe('root');
    expect(fully_unpacked.nodes['inner_host']).toBeUndefined();
    expect(fully_unpacked.graphs['inner_graph']).toBeUndefined();
    expect(fully_unpacked.boundary_bindings).toEqual({});
  });

  it('keeps pack and unpack operations immutable', () => {
    const a = make_node('a', 'root', [], [port('out', 'output', 'text')]);
    const b = make_node('b', 'root', [port('in', 'input', 'text')], []);
    const document = add_bindings(add_nodes(create_empty_graph_document(), [a, b]), [
      make_binding('binding', 'root', 'a', 'out', 'b', 'in'),
    ]);
    const snapshot = JSON.stringify(document);

    const packed = unwrap_document(
      pack_nodes(document, {
        source_graph_id: 'root',
        node_ids: ['a', 'b'],
        graph_id: 'child',
        host_node_id: 'host',
      }),
    );
    const packed_snapshot = JSON.stringify(packed);
    void unpack_subgraph(packed, 'host');

    expect(JSON.stringify(document)).toBe(snapshot);
    expect(JSON.stringify(packed)).toBe(packed_snapshot);
  });

  it('roundtrips boundary bindings through JSON', () => {
    const source = make_node('source', 'root', [], [port('out', 'output', 'text')]);
    const target = make_node('target', 'root', [port('in', 'input', 'text')], []);
    const document = add_bindings(add_nodes(create_empty_graph_document(), [source, target]), [
      make_binding('external_input', 'root', 'source', 'out', 'target', 'in'),
    ]);
    const packed = unwrap_document(
      pack_nodes(document, {
        source_graph_id: 'root',
        node_ids: ['target'],
        graph_id: 'child',
        host_node_id: 'host',
      }),
    );

    const round_tripped = JSON.parse(JSON.stringify(packed)) as GraphDocument;
    expect(round_tripped).toEqual(packed);
    expect(Object.keys(round_tripped.boundary_bindings)).toHaveLength(1);
    expect(round_tripped.boundary_bindings['child:input:0']?.graph_id).toBe('child');
  });

  it('refuses to remove a graph that is still referenced by a host', () => {
    const a = make_node('a', 'root');
    const document = add_nodes(create_empty_graph_document(), [a]);
    const packed = unwrap_document(
      pack_nodes(document, {
        source_graph_id: 'root',
        node_ids: ['a'],
        graph_id: 'child',
        host_node_id: 'host',
      }),
    );

    const result = remove_graph(packed, 'child');
    expect(unwrap_error(result).type).toBe('graph_has_hosts');
  });
});
