import { describe, expect, it } from 'vitest';
import type { Port } from '@/core/types';
import type { GraphBindingRecord, GraphDocument, GraphNodeRecord } from '@/core/graph/types';
import {
  add_binding,
  add_graph,
  add_node,
  create_empty_graph_document,
} from '@/core/graph/document';
import {
  add_graph_boundary,
  remove_graph_boundary,
  set_graph_boundary_mapping,
  update_graph_boundary_slot,
  type GraphBoundaryError,
} from '@/core/graph/boundary';
import { deserialize_graph_document, serialize_graph_document } from '@/core/graph/serialization';
import { validate_graph_document } from '@/core/graph/validation';
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

const unwrap_document = <L, A>(result: E.Either<L, A>): A => {
  if (E.isLeft(result)) {
    throw new Error(`unexpected error: ${JSON.stringify(result.left)}`);
  }
  return result.right;
};

const expect_boundary_error = <A>(result: E.Either<GraphBoundaryError, A>): GraphBoundaryError => {
  if (E.isRight(result)) {
    throw new Error('expected GraphBoundaryError');
  }
  return result.left;
};

const make_base_document = (): GraphDocument => {
  let document = create_empty_graph_document();
  document = unwrap_document(
    add_graph(document, {
      id: 'child',
      kind: 'subgraph',
      parent_graph_id: 'root',
      title: 'Child',
      input_slots: [],
      output_slots: [],
    }),
  );
  document = unwrap_document(
    add_node(
      document,
      make_node(
        'internal',
        'child',
        [port('in', 'input', 'text')],
        [port('out', 'output', 'text')],
      ),
    ),
  );
  document = unwrap_document(add_node(document, make_node('host', 'root', [], [], 'child')));
  document = unwrap_document(add_node(document, make_node('host2', 'root', [], [], 'child')));
  return document;
};

const add_input_boundary = (
  document: GraphDocument,
): E.Either<GraphBoundaryError, GraphDocument> => {
  return add_graph_boundary(document, {
    graph_id: 'child',
    direction: 'input',
    slot: {
      id: 'request',
      label: 'Request',
      value_type: 'text',
      accepts: ['text'],
      required: true,
    },
    mapping: { node_id: 'internal', port_id: 'in' },
  });
};

const add_output_boundary = (
  document: GraphDocument,
): E.Either<GraphBoundaryError, GraphDocument> => {
  return add_graph_boundary(document, {
    graph_id: 'child',
    direction: 'output',
    slot: {
      id: 'response',
      label: 'Response',
      value_type: 'text',
      accepts: ['text'],
      required: false,
    },
    mapping: { node_id: 'internal', port_id: 'out' },
  });
};

const expect_valid = (document: GraphDocument): void => {
  const result = validate_graph_document(document);
  if (E.isLeft(result)) {
    throw new Error(`expected valid document: ${JSON.stringify(result.left)}`);
  }
  expect(result.right).toBe(true);
};

describe('graph boundary edit operations', () => {
  it('adds input and output slots with boundary mappings and synchronized host ports', () => {
    let document = make_base_document();
    document = unwrap_document(add_input_boundary(document));
    document = unwrap_document(add_output_boundary(document));

    expect(document.graphs['child']?.input_slots).toHaveLength(1);
    expect(document.graphs['child']?.output_slots).toHaveLength(1);
    expect(document.nodes['host']?.inputs.map(item => item.id)).toEqual(['request']);
    expect(document.nodes['host']?.outputs.map(item => item.id)).toEqual(['response']);
    expect(document.nodes['host2']?.inputs.map(item => item.id)).toEqual(['request']);
    expect(document.nodes['host2']?.outputs.map(item => item.id)).toEqual(['response']);
    expect(document.nodes['host']?.inputs[0]).toEqual({
      id: 'request',
      label: 'Request',
      type: 'input',
      value_type: 'text',
      accepts: ['text'],
      required: true,
    });
    expect(document.nodes['host2']?.outputs[0]).toEqual({
      id: 'response',
      label: 'Response',
      type: 'output',
      value_type: 'text',
      accepts: ['text'],
      required: false,
    });

    const input_mapping = Object.values(document.boundary_bindings).find(
      boundary => boundary.graph_id === 'child' && boundary.direction === 'input',
    );
    expect(input_mapping).toEqual({
      id: 'child:input:request',
      graph_id: 'child',
      direction: 'input',
      slot_id: 'request',
      node_id: 'internal',
      port_id: 'in',
    });
    const output_mapping = Object.values(document.boundary_bindings).find(
      boundary => boundary.graph_id === 'child' && boundary.direction === 'output',
    );
    expect(output_mapping).toEqual({
      id: 'child:output:response',
      graph_id: 'child',
      direction: 'output',
      slot_id: 'response',
      node_id: 'internal',
      port_id: 'out',
    });
    expect_valid(document);
  });

  it('synchronizes all host nodes that reference the same scope', () => {
    let document = make_base_document();
    document = unwrap_document(add_input_boundary(document));

    expect(document.nodes['host']?.inputs).toHaveLength(1);
    expect(document.nodes['host2']?.inputs).toHaveLength(1);
    expect(Object.keys(document.nodes)).toContain('host');
    expect(Object.keys(document.nodes)).toContain('host2');
    expect_valid(document);
  });

  it('removes slot, mapping, and host ports while preserving other boundaries', () => {
    let document = make_base_document();
    document = unwrap_document(add_input_boundary(document));
    document = unwrap_document(add_output_boundary(document));

    document = unwrap_document(remove_graph_boundary(document, 'child', 'output', 'response'));
    expect(document.graphs['child']?.output_slots).toEqual([]);
    expect(document.nodes['host']?.outputs).toEqual([]);
    expect(document.nodes['host2']?.outputs).toEqual([]);
    expect(
      Object.values(document.boundary_bindings).some(boundary => boundary.direction === 'output'),
    ).toBe(false);
    expect(document.graphs['child']?.input_slots.map(slot => slot.id)).toEqual(['request']);
    expect_valid(document);

    document = unwrap_document(remove_graph_boundary(document, 'child', 'input', 'request'));
    expect(document.graphs['child']?.input_slots).toEqual([]);
    expect(document.nodes['host']?.inputs).toEqual([]);
    expect(document.nodes['host2']?.inputs).toEqual([]);
    expect(document.boundary_bindings).toEqual({});
    expect_valid(document);
  });

  it('refuses to remove a boundary whose host port is still used by a binding', () => {
    let document = make_base_document();
    document = unwrap_document(add_input_boundary(document));

    const external_source = make_node(
      'external_source',
      'root',
      [],
      [port('source_out', 'output', 'text')],
    );
    document = unwrap_document(add_node(document, external_source));
    const binding: GraphBindingRecord = {
      id: 'host_input_use',
      graph_id: 'root',
      source_id: 'external_source',
      source_handle: 'source_out',
      target_id: 'host',
      target_handle: 'request',
    };
    document = unwrap_document(add_binding(document, binding));
    const snapshot = JSON.stringify(document);

    const result = remove_graph_boundary(document, 'child', 'input', 'request');
    const error = expect_boundary_error(result);
    expect(error.type).toBe('host_port_in_use');
    if (error.type === 'host_port_in_use') {
      expect(error.binding_id).toBe('host_input_use');
      expect(error.host_node_id).toBe('host');
    }
    expect(JSON.stringify(document)).toBe(snapshot);
  });

  it('cascades host bindings when removing input/output boundary slots', () => {
    let document = make_base_document();
    document = unwrap_document(add_input_boundary(document));
    document = unwrap_document(add_output_boundary(document));

    const root_source = make_node(
      'root_source',
      'root',
      [],
      [port('source_out', 'output', 'text')],
    );
    const sink1 = make_node('sink1', 'root', [port('sink_in', 'input', 'text')], []);
    const sink2 = make_node('sink2', 'root', [port('sink_in', 'input', 'text')], []);
    const sink3 = make_node('sink3', 'root', [port('sink_in', 'input', 'text')], []);
    document = unwrap_document(add_node(document, root_source));
    document = unwrap_document(add_node(document, sink1));
    document = unwrap_document(add_node(document, sink2));
    document = unwrap_document(add_node(document, sink3));

    document = unwrap_document(
      add_binding(document, {
        id: 'input_host_use',
        graph_id: 'root',
        source_id: 'root_source',
        source_handle: 'source_out',
        target_id: 'host',
        target_handle: 'request',
      }),
    );
    document = unwrap_document(
      add_binding(document, {
        id: 'input_host2_use',
        graph_id: 'root',
        source_id: 'root_source',
        source_handle: 'source_out',
        target_id: 'host2',
        target_handle: 'request',
      }),
    );
    document = unwrap_document(
      add_binding(document, {
        id: 'output_host_use_1',
        graph_id: 'root',
        source_id: 'host',
        source_handle: 'response',
        target_id: 'sink1',
        target_handle: 'sink_in',
      }),
    );
    document = unwrap_document(
      add_binding(document, {
        id: 'output_host_use_2',
        graph_id: 'root',
        source_id: 'host',
        source_handle: 'response',
        target_id: 'sink2',
        target_handle: 'sink_in',
      }),
    );
    document = unwrap_document(
      add_binding(document, {
        id: 'output_host2_use',
        graph_id: 'root',
        source_id: 'host2',
        source_handle: 'response',
        target_id: 'sink3',
        target_handle: 'sink_in',
      }),
    );
    const snapshot = JSON.stringify(document);

    const refused = remove_graph_boundary(document, 'child', 'input', 'request', {
      cascade_host_bindings: false,
    });
    expect(expect_boundary_error(refused).type).toBe('host_port_in_use');

    const removed_input = unwrap_document(
      remove_graph_boundary(document, 'child', 'input', 'request', {
        cascade_host_bindings: true,
      }),
    );
    expect(removed_input).not.toBe(document);
    expect(JSON.stringify(document)).toBe(snapshot);
    expect(removed_input.graphs['child']?.input_slots).toEqual([]);
    expect(removed_input.nodes['host']?.inputs).toEqual([]);
    expect(removed_input.nodes['host2']?.inputs).toEqual([]);
    expect(removed_input.boundary_bindings['child:input:request']).toBeUndefined();
    expect(removed_input.bindings['input_host_use']).toBeUndefined();
    expect(removed_input.bindings['input_host2_use']).toBeUndefined();
    expect(removed_input.bindings['output_host_use_1']).toBeDefined();
    expect(removed_input.bindings['output_host_use_2']).toBeDefined();
    expect(removed_input.bindings['output_host2_use']).toBeDefined();
    expect_valid(removed_input);

    const removed_output = unwrap_document(
      remove_graph_boundary(removed_input, 'child', 'output', 'response', {
        cascade_host_bindings: true,
      }),
    );
    expect(removed_output).not.toBe(removed_input);
    expect(removed_output.graphs['child']?.output_slots).toEqual([]);
    expect(removed_output.nodes['host']?.outputs).toEqual([]);
    expect(removed_output.nodes['host2']?.outputs).toEqual([]);
    expect(removed_output.boundary_bindings['child:output:response']).toBeUndefined();
    expect(removed_output.bindings['output_host_use_1']).toBeUndefined();
    expect(removed_output.bindings['output_host_use_2']).toBeUndefined();
    expect(removed_output.bindings['output_host2_use']).toBeUndefined();
    expect(removed_output.bindings).toEqual({});
    expect_valid(removed_output);
  });

  it('updates slot metadata and all matching host ports without changing ids', () => {
    let document = make_base_document();
    document = unwrap_document(add_input_boundary(document));

    document = unwrap_document(
      update_graph_boundary_slot(document, 'child', 'input', 'request', {
        label: 'Renamed Request',
        value_type: 'number',
        accepts: ['number'],
        required: false,
      }),
    );

    expect(document.graphs['child']?.input_slots[0]).toEqual({
      id: 'request',
      label: 'Renamed Request',
      value_type: 'number',
      accepts: ['number'],
      required: false,
    });
    expect(document.nodes['host']?.inputs[0]?.id).toBe('request');
    expect(document.nodes['host']?.inputs[0]?.label).toBe('Renamed Request');
    expect(document.nodes['host2']?.inputs[0]?.label).toBe('Renamed Request');
    expect(document.nodes['host']?.inputs[0]?.value_type).toBe('number');
    expect_valid(document);
  });

  it('keeps all boundary edit operations immutable', () => {
    const document = make_base_document();
    const snapshot = JSON.stringify(document);

    const added = unwrap_document(add_input_boundary(document));
    const added_snapshot = JSON.stringify(added);
    const removed = unwrap_document(remove_graph_boundary(added, 'child', 'input', 'request'));
    const updated = unwrap_document(
      update_graph_boundary_slot(added, 'child', 'input', 'request', { label: 'New' }),
    );

    expect(added).not.toBe(document);
    expect(removed).not.toBe(added);
    expect(updated).not.toBe(added);
    expect(JSON.stringify(document)).toBe(snapshot);
    expect(JSON.stringify(added)).toBe(added_snapshot);
  });

  it('roundtrips a boundary-edited document through JSON serialization', () => {
    let document = make_base_document();
    document = unwrap_document(add_input_boundary(document));
    document = unwrap_document(add_output_boundary(document));

    const json = serialize_graph_document(document);
    const result = deserialize_graph_document(json);
    if (E.isLeft(result)) {
      throw new Error(`expected roundtrip success: ${JSON.stringify(result.left)}`);
    }
    expect(result.right).toEqual(document);
  });

  it('remaps an existing input slot mapping without changing slot metadata or host ports', () => {
    let document = make_base_document();
    document = unwrap_document(add_input_boundary(document));
    document = unwrap_document(
      add_node(
        document,
        make_node(
          'secondary',
          'child',
          [port('second_in', 'input', 'text')],
          [port('second_out', 'output', 'text')],
        ),
      ),
    );
    const host_ports_before = JSON.stringify(document.nodes['host']);

    document = unwrap_document(
      set_graph_boundary_mapping(document, 'child', 'input', 'request', {
        node_id: 'secondary',
        port_id: 'second_in',
      }),
    );

    expect(document.graphs['child']?.input_slots).toHaveLength(1);
    expect(document.graphs['child']?.input_slots[0]?.id).toBe('request');
    expect(document.graphs['child']?.input_slots[0]?.label).toBe('Request');
    expect(JSON.stringify(document.nodes['host'])).toBe(host_ports_before);
    expect(document.nodes['host']?.inputs.map(port => port.id)).toEqual(['request']);
    expect(document.boundary_bindings['child:input:request']).toEqual({
      id: 'child:input:request',
      graph_id: 'child',
      direction: 'input',
      slot_id: 'request',
      node_id: 'secondary',
      port_id: 'second_in',
    });
    expect_valid(document);
  });

  it('returns the original document when a remap is a no-op', () => {
    const document = unwrap_document(add_input_boundary(make_base_document()));
    const result = set_graph_boundary_mapping(document, 'child', 'input', 'request', {
      node_id: 'internal',
      port_id: 'in',
    });

    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right).toBe(document);
    }
  });

  it('keeps set_graph_boundary_mapping immutable and roundtrips through serialization', () => {
    let document = unwrap_document(add_input_boundary(make_base_document()));
    document = unwrap_document(
      add_node(document, make_node('secondary', 'child', [port('second_in', 'input', 'text')], [])),
    );
    const snapshot = JSON.stringify(document);

    const remapped = unwrap_document(
      set_graph_boundary_mapping(document, 'child', 'input', 'request', {
        node_id: 'secondary',
        port_id: 'second_in',
      }),
    );
    expect(remapped).not.toBe(document);
    expect(JSON.stringify(document)).toBe(snapshot);

    const json = serialize_graph_document(remapped);
    const result = deserialize_graph_document(json);
    if (E.isLeft(result)) {
      throw new Error(`expected roundtrip success: ${JSON.stringify(result.left)}`);
    }
    expect(result.right).toEqual(remapped);
  });

  it('returns set_graph_boundary_mapping lookup and invalid argument errors', () => {
    const document = unwrap_document(add_input_boundary(make_base_document()));

    const missing_graph = set_graph_boundary_mapping(document, 'missing', 'input', 'request', {
      node_id: 'internal',
      port_id: 'in',
    });
    expect(expect_boundary_error(missing_graph).type).toBe('graph_not_found');

    const missing_slot = set_graph_boundary_mapping(document, 'child', 'input', 'missing', {
      node_id: 'internal',
      port_id: 'in',
    });
    expect(expect_boundary_error(missing_slot).type).toBe('boundary_slot_not_found');

    const missing_node = set_graph_boundary_mapping(document, 'child', 'input', 'request', {
      node_id: 'missing',
      port_id: 'in',
    });
    expect(expect_boundary_error(missing_node).type).toBe('boundary_mapping_node_not_found');

    const outside_node = set_graph_boundary_mapping(document, 'child', 'input', 'request', {
      node_id: 'host',
      port_id: 'in',
    });
    expect(expect_boundary_error(outside_node).type).toBe('boundary_mapping_node_not_in_graph');

    const missing_port = set_graph_boundary_mapping(document, 'child', 'input', 'request', {
      node_id: 'internal',
      port_id: 'missing',
    });
    expect(expect_boundary_error(missing_port).type).toBe('boundary_mapping_port_not_found');
  });

  it('returns boundary parameter and lookup errors', () => {
    const document = make_base_document();
    const missing_graph = add_graph_boundary(document, {
      graph_id: 'missing',
      direction: 'input',
      slot: { id: 'x', label: 'X' },
      mapping: { node_id: 'internal', port_id: 'in' },
    });
    expect(expect_boundary_error(missing_graph).type).toBe('graph_not_found');

    const first = unwrap_document(add_input_boundary(document));
    const duplicate = add_input_boundary(first);
    expect(expect_boundary_error(duplicate).type).toBe('boundary_slot_already_exists');

    const missing_node = add_graph_boundary(first, {
      graph_id: 'child',
      direction: 'input',
      slot: { id: 'other', label: 'Other' },
      mapping: { node_id: 'missing', port_id: 'in' },
    });
    expect(expect_boundary_error(missing_node).type).toBe('boundary_mapping_node_not_found');

    const outside_node = add_graph_boundary(first, {
      graph_id: 'child',
      direction: 'input',
      slot: { id: 'other', label: 'Other' },
      mapping: { node_id: 'host', port_id: 'in' },
    });
    expect(expect_boundary_error(outside_node).type).toBe('boundary_mapping_node_not_in_graph');

    const missing_port = add_graph_boundary(first, {
      graph_id: 'child',
      direction: 'input',
      slot: { id: 'other', label: 'Other' },
      mapping: { node_id: 'internal', port_id: 'missing' },
    });
    expect(expect_boundary_error(missing_port).type).toBe('boundary_mapping_port_not_found');

    const duplicate_boundary_id = add_graph_boundary(first, {
      graph_id: 'child',
      direction: 'input',
      slot: { id: 'other', label: 'Other' },
      mapping: { node_id: 'internal', port_id: 'in' },
      boundary_id: 'child:input:request',
    });
    expect(expect_boundary_error(duplicate_boundary_id).type).toBe('boundary_id_already_exists');

    const missing_remove = remove_graph_boundary(first, 'child', 'input', 'missing');
    expect(expect_boundary_error(missing_remove).type).toBe('boundary_slot_not_found');

    const missing_update = update_graph_boundary_slot(first, 'child', 'input', 'missing', {
      label: 'X',
    });
    expect(expect_boundary_error(missing_update).type).toBe('boundary_slot_not_found');

    const id_change = update_graph_boundary_slot(first, 'child', 'input', 'request', {
      id: 'other',
      label: 'X',
    });
    expect(expect_boundary_error(id_change).type).toBe('invalid_arguments');
  });
});
