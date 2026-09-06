import { describe, expect, it } from 'vitest';
import type { Port } from '@/core/types';
import type { GraphBindingRecord, GraphDocument, GraphNodeRecord } from '@/core/graph/types';
import {
  add_binding,
  add_graph,
  add_node,
  create_empty_graph_document,
} from '@/core/graph/document';
import { add_graph_boundary } from '@/core/graph/boundary';
import { pack_nodes } from '@/core/graph/subgraph';
import { validate_graph_document } from '@/core/graph/validation';
import {
  flatten_graph_document,
  type FlattenedGraph,
  type GraphFlattenError,
} from '@/core/graph/flatten';
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

const unwrap_right = <Left, Right>(result: E.Either<Left, Right>): Right => {
  if (E.isLeft(result)) {
    throw new Error(`unexpected error: ${JSON.stringify(result.left)}`);
  }
  return result.right;
};

const add_nodes = (document: GraphDocument, nodes: readonly GraphNodeRecord[]): GraphDocument => {
  return nodes.reduce((acc, node) => unwrap_right(add_node(acc, node)), document);
};

const add_bindings = (
  document: GraphDocument,
  bindings: readonly GraphBindingRecord[],
): GraphDocument => {
  return bindings.reduce((acc, binding) => unwrap_right(add_binding(acc, binding)), document);
};

const add_graph_scope = (
  document: GraphDocument,
  graph_id: string,
  parent_graph_id: string,
  input_slots: readonly { id: string; label: string; value_type?: string }[] = [],
): GraphDocument => {
  return unwrap_right(
    add_graph(document, {
      id: graph_id,
      kind: 'subgraph',
      parent_graph_id,
      title: graph_id,
      input_slots,
      output_slots: [],
    }),
  );
};

const add_input_boundary = (
  document: GraphDocument,
  graph_id: string,
  slot_id: string,
  node_id: string,
  port_id: string,
): GraphDocument => {
  return unwrap_right(
    add_graph_boundary(document, {
      graph_id,
      direction: 'input',
      slot: { id: slot_id, label: slot_id, value_type: 'text' },
      mapping: { node_id, port_id },
    }),
  );
};

const ensure_valid = (document: GraphDocument): GraphDocument => {
  const result = validate_graph_document(document);
  if (E.isLeft(result)) {
    throw new Error(`validation failed: ${JSON.stringify(result.left)}`);
  }
  return document;
};

const flatten_right = (document: GraphDocument): FlattenedGraph => {
  return unwrap_right(flatten_graph_document(document));
};

const flatten_left = (
  result: E.Either<GraphFlattenError, FlattenedGraph>,
): GraphFlattenError => {
  if (E.isRight(result)) {
    throw new Error('expected flatten error');
  }
  return result.left;
};

describe('graph flatten execution view', () => {
  it('flattens a root-only document with equivalent nodes and bindings', () => {
    const source = make_node('source', 'root', [], [port('out', 'output')]);
    const target = make_node('target', 'root', [port('in', 'input')], []);
    const document = ensure_valid(
      add_bindings(add_nodes(create_empty_graph_document(), [source, target]), [
        make_binding('binding', 'root', 'source', 'out', 'target', 'in'),
      ]),
    );
    const snapshot = JSON.stringify(document);

    const flattened = flatten_right(document);

    expect(flattened.nodes['root:source']?.node_id).toBe('source');
    expect(flattened.nodes['root:target']?.node_id).toBe('target');
    expect(Object.keys(flattened.nodes)).toHaveLength(2);
    expect(flattened.bindings['binding']).toEqual({
      id: 'binding',
      source_instance_id: 'root:source',
      source_handle: 'out',
      target_instance_id: 'root:target',
      target_handle: 'in',
    });
    expect(JSON.stringify(document)).toBe(snapshot);
  });

  it('resolves one host layer and omits host nodes from the flat view', () => {
    const external_source = make_node(
      'external_source',
      'root',
      [],
      [port('external_out', 'output')],
    );
    const target = make_node('target', 'root', [port('target_in', 'input')], []);
    const source = make_node('source', 'root', [], [port('source_out', 'output')]);
    const external_target = make_node(
      'external_target',
      'root',
      [port('external_in', 'input')],
      [],
    );
    const base = add_bindings(
      add_nodes(create_empty_graph_document(), [
        external_source,
        target,
        source,
        external_target,
      ]),
      [
        make_binding(
          'external_input',
          'root',
          'external_source',
          'external_out',
          'target',
          'target_in',
        ),
        make_binding(
          'external_output',
          'root',
          'source',
          'source_out',
          'external_target',
          'external_in',
        ),
      ],
    );
    const packed = ensure_valid(
      unwrap_right(
        pack_nodes(base, {
          source_graph_id: 'root',
          node_ids: ['source', 'target'],
          graph_id: 'child',
          host_node_id: 'host',
        }),
      ),
    );

    const flattened = flatten_right(packed);

    expect(flattened.nodes['root:host:target']?.node_id).toBe('target');
    expect(flattened.nodes['root:host:source']?.node_id).toBe('source');
    expect(flattened.nodes['host']).toBeUndefined();
    expect(flattened.nodes['root:host']).toBeUndefined();
    expect(flattened.bindings['external_input']).toEqual({
      id: 'external_input',
      source_instance_id: 'root:external_source',
      source_handle: 'external_out',
      target_instance_id: 'root:host:target',
      target_handle: 'target_in',
    });
    expect(flattened.bindings['external_output']).toEqual({
      id: 'external_output',
      source_instance_id: 'root:host:source',
      source_handle: 'source_out',
      target_instance_id: 'root:external_target',
      target_handle: 'external_in',
    });
  });

  it('resolves through a nested host referenced by an inner binding', () => {
    let document = add_nodes(create_empty_graph_document(), [
      make_node('external_source', 'root', [], [port('out', 'output')]),
    ]);
    document = add_graph_scope(document, 'outer_graph', 'root');
    document = add_graph_scope(document, 'middle_graph', 'outer_graph');
    document = add_nodes(document, [
      make_node('outer_host', 'root', [], [], 'outer_graph'),
      make_node('middle_host', 'outer_graph', [], [], 'middle_graph'),
      make_node(
        'mid_source',
        'outer_graph',
        [port('source_in', 'input')],
        [port('source_out', 'output')],
      ),
      make_node('leaf', 'middle_graph', [port('leaf_in', 'input')], []),
    ]);
    document = add_input_boundary(document, 'middle_graph', 'middle_in', 'leaf', 'leaf_in');
    document = add_input_boundary(document, 'outer_graph', 'outer_in', 'mid_source', 'source_in');
    document = ensure_valid(
      add_bindings(document, [
        make_binding(
          'external_input',
          'root',
          'external_source',
          'out',
          'outer_host',
          'outer_in',
        ),
        make_binding(
          'inside',
          'outer_graph',
          'mid_source',
          'source_out',
          'middle_host',
          'middle_in',
        ),
      ]),
    );

    const flattened = flatten_right(document);

    expect(flattened.nodes['root:external_source']?.node_id).toBe('external_source');
    expect(flattened.nodes['root:outer_host:mid_source']?.node_id).toBe('mid_source');
    expect(flattened.nodes['root:outer_host:middle_host:leaf']?.node_id).toBe('leaf');
    expect(flattened.nodes['root:outer_host']).toBeUndefined();
    expect(flattened.nodes['root:outer_host:middle_host']).toBeUndefined();
    expect(flattened.bindings['external_input']).toEqual({
      id: 'external_input',
      source_instance_id: 'root:external_source',
      source_handle: 'out',
      target_instance_id: 'root:outer_host:mid_source',
      target_handle: 'source_in',
    });
    expect(flattened.bindings['root:outer_host:inside']).toEqual({
      id: 'root:outer_host:inside',
      source_instance_id: 'root:outer_host:mid_source',
      source_handle: 'source_out',
      target_instance_id: 'root:outer_host:middle_host:leaf',
      target_handle: 'leaf_in',
    });
  });

  it('expands a shared scope separately for each host instance', () => {
    const source = make_node('source', 'root', [], [port('out', 'output')]);
    const target = make_node('target', 'root', [port('in', 'input')], []);
    const base = add_bindings(add_nodes(create_empty_graph_document(), [source, target]), [
      make_binding('internal', 'root', 'source', 'out', 'target', 'in'),
    ]);
    const packed = ensure_valid(
      unwrap_right(
        pack_nodes(base, {
          source_graph_id: 'root',
          node_ids: ['source', 'target'],
          graph_id: 'shared',
          host_node_id: 'first_host',
        }),
      ),
    );
    const document = ensure_valid(
      add_nodes(packed, [make_node('second_host', 'root', [], [], 'shared')]),
    );

    const flattened = flatten_right(document);

    expect(Object.keys(flattened.nodes)).toHaveLength(4);
    expect(flattened.nodes['root:first_host:source']?.scope_steps).toEqual([
      { graph_id: 'root' },
      { graph_id: 'shared', host_node_id: 'first_host' },
    ]);
    expect(flattened.nodes['root:second_host:source']?.scope_steps).toEqual([
      { graph_id: 'root' },
      { graph_id: 'shared', host_node_id: 'second_host' },
    ]);
    expect(flattened.nodes['root:first_host:target']).toBeDefined();
    expect(flattened.nodes['root:second_host:target']).toBeDefined();
    expect(flattened.bindings['root:first_host:internal'].source_instance_id).toBe(
      'root:first_host:source',
    );
    expect(flattened.bindings['root:second_host:internal'].source_instance_id).toBe(
      'root:second_host:source',
    );
    expect(flattened.bindings['root:first_host:internal']).not.toEqual(
      flattened.bindings['root:second_host:internal'],
    );
  });

  it('returns a missing boundary mapping error without mutating the document', () => {
    let document = add_graph_scope(create_empty_graph_document(), 'child', 'root', [
      { id: 'in', label: 'in', value_type: 'text' },
    ]);
    document = add_nodes(document, [
      make_node('external_source', 'root', [], [port('out', 'output')]),
      make_node('host', 'root', [port('in', 'input')], [], 'child'),
    ]);
    document = ensure_valid(
      add_bindings(document, [
        make_binding('external_input', 'root', 'external_source', 'out', 'host', 'in'),
      ]),
    );
    const snapshot = JSON.stringify(document);

    const result = flatten_graph_document(document);
    const error = flatten_left(result);

    expect(error.type).toBe('host_binding_missing_boundary');
    if (error.type === 'host_binding_missing_boundary') {
      expect(error.binding_id).toBe('external_input');
      expect(error.host_node_id).toBe('host');
      expect(error.slot_id).toBe('in');
    }
    expect(JSON.stringify(document)).toBe(snapshot);
  });

  it('rejects duplicate boundary mappings for the same graph slot', () => {
    let document = add_graph_scope(create_empty_graph_document(), 'child', 'root', [
      { id: 'in', label: 'in', value_type: 'text' },
    ]);
    document = add_nodes(document, [
      make_node('external_source', 'root', [], [port('out', 'output')]),
      make_node('host', 'root', [port('in', 'input')], [], 'child'),
      make_node('target_a', 'child', [port('in', 'input')], []),
      make_node('target_b', 'child', [port('in', 'input')], []),
    ]);
    document = add_bindings(document, [
      make_binding('external_input', 'root', 'external_source', 'out', 'host', 'in'),
    ]);
    const duplicate_document: GraphDocument = {
      ...document,
      boundary_bindings: {
        duplicate_a: {
          id: 'duplicate_a',
          graph_id: 'child',
          direction: 'input',
          slot_id: 'in',
          node_id: 'target_a',
          port_id: 'in',
        },
        duplicate_b: {
          id: 'duplicate_b',
          graph_id: 'child',
          direction: 'input',
          slot_id: 'in',
          node_id: 'target_b',
          port_id: 'in',
        },
      },
    };
    const snapshot = JSON.stringify(duplicate_document);

    const result = flatten_graph_document(duplicate_document);
    const error = flatten_left(result);

    expect(error.type).toBe('duplicate_boundary_mapping');
    if (error.type === 'duplicate_boundary_mapping') {
      expect(error.graph_id).toBe('child');
      expect(error.direction).toBe('input');
      expect(error.slot_id).toBe('in');
      expect(error.boundary_ids).toEqual(['duplicate_a', 'duplicate_b']);
    }
    expect(JSON.stringify(duplicate_document)).toBe(snapshot);
  });
});
