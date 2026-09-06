import { describe, expect, it } from 'vitest';
import type { Port } from '@/core/types';
import type {
  GraphBindingRecord,
  GraphBoundaryBinding,
  GraphDocument,
  GraphNodeRecord,
  GraphScope,
  GraphSlot,
} from '@/core/graph/types';
import {
  add_binding,
  add_graph,
  add_node,
  create_empty_graph_document,
  move_node_to_graph,
  remove_node,
  update_node,
  type GraphDocumentError,
} from '@/core/graph/document';
import { pack_nodes } from '@/core/graph/subgraph';
import {
  validate_graph_document,
  type GraphValidationIssue,
} from '@/core/graph/validation';
import * as E from 'fp-ts/Either';

const port = (id: string, kind: 'input' | 'output'): Port => {
  return { id, label: id, type: kind };
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

const make_scope = (
  id: string,
  parent_graph_id = 'root',
  input_slots: readonly GraphSlot[] = [],
  output_slots: readonly GraphSlot[] = [],
): GraphScope => {
  return {
    id,
    kind: 'subgraph',
    parent_graph_id,
    title: id,
    input_slots,
    output_slots,
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

const unwrap_document = (
  result: E.Either<GraphDocumentError, GraphDocument>,
): GraphDocument => {
  if (E.isLeft(result)) {
    throw new Error(`unexpected error: ${result.left.type}`);
  }
  return result.right;
};

const unwrap_error = (
  result: E.Either<GraphDocumentError, GraphDocument>,
): GraphDocumentError => {
  if (E.isRight(result)) {
    throw new Error('expected an error');
  }
  return result.left;
};

const expect_valid = (document: GraphDocument): void => {
  expect(E.isRight(validate_graph_document(document))).toBe(true);
};

const get_issue_paths = (document: GraphDocument): readonly string[] => {
  const result = validate_graph_document(document);
  if (E.isRight(result)) {
    throw new Error('expected validation failure');
  }
  return result.left.map((issue: GraphValidationIssue) => issue.path);
};

const make_bound_nodes_document = (): GraphDocument => {
  const source = make_node('source', 'root', [], [port('out', 'output')]);
  const target = make_node('target', 'root', [port('in', 'input')], []);
  let document = unwrap_document(add_node(create_empty_graph_document(), source));
  document = unwrap_document(add_node(document, target));
  return unwrap_document(
    add_binding(document, make_binding('binding', 'root', 'source', 'out', 'target', 'in')),
  );
};

const make_packed_document = (): GraphDocument => {
  const external_source = make_node('external_source', 'root', [], [port('out', 'output')]);
  const internal_target = make_node('internal', 'root', [port('in', 'input')], []);
  let document = unwrap_document(add_node(create_empty_graph_document(), external_source));
  document = unwrap_document(add_node(document, internal_target));
  document = unwrap_document(
    add_binding(
      document,
      make_binding('crossing', 'root', 'external_source', 'out', 'internal', 'in'),
    ),
  );
  return unwrap_document(
    pack_nodes(document, {
      source_graph_id: 'root',
      node_ids: ['internal'],
      graph_id: 'child',
      host_node_id: 'host',
    }),
  );
};

describe('update_node invariants', () => {
  it('updates node metadata and keeps the resulting document valid', () => {
    const document = make_bound_nodes_document();
    const snapshot = JSON.stringify(document);

    const result = update_node(document, 'target', node => {
      return {
        ...node,
        position: { x: 120, y: 240 },
        size: { x: 320, y: 200 },
        title: 'Renamed target',
        inputs: node.inputs.map(current_port => {
          if (current_port.id === 'in') {
            return { ...current_port, label: 'Input', value_type: 'number', required: true };
          }
          return current_port;
        }),
        custom_data: { ...node.custom_data, edited: true },
      };
    });

    const updated = unwrap_document(result);
    expect(updated.nodes['target']?.position).toEqual({ x: 120, y: 240 });
    expect(updated.nodes['target']?.title).toBe('Renamed target');
    expect(updated.nodes['target']?.inputs[0]).toMatchObject({
      id: 'in',
      label: 'Input',
      value_type: 'number',
      required: true,
    });
    expect(updated.nodes['target']?.custom_data).toEqual({ edited: true });
    expect(updated.bindings['binding']).toEqual(document.bindings['binding']);
    expect_valid(updated);
    expect(JSON.stringify(document)).toBe(snapshot);
  });

  it('rejects missing nodes and updater identity changes', () => {
    const document = create_empty_graph_document();
    const missing_result = update_node(document, 'missing', node => node);
    expect(unwrap_error(missing_result).type).toBe('node_not_found');

    const with_node = unwrap_document(add_node(document, make_node('node', 'root')));

    const id_result = update_node(with_node, 'node', node => ({ ...node, id: 'other' }));
    const id_error = unwrap_error(id_result);
    expect(id_error.type).toBe('updated_node_id_changed');
    if (id_error.type === 'updated_node_id_changed') {
      expect(id_error.updated_node_id).toBe('other');
    }

    const graph_result = update_node(with_node, 'node', node => ({
      ...node,
      graph_id: 'other_graph',
    }));
    const graph_error = unwrap_error(graph_result);
    expect(graph_error.type).toBe('updated_node_graph_changed');
    if (graph_error.type === 'updated_node_graph_changed') {
      expect(graph_error.updated_graph_id).toBe('other_graph');
    }
  });

  it('refuses to remove source or target ports used by a binding', () => {
    const document = make_bound_nodes_document();
    const snapshot = JSON.stringify(document);

    const source_result = update_node(document, 'source', node => ({ ...node, outputs: [] }));
    const source_error = unwrap_error(source_result);
    expect(source_error.type).toBe('binding_invalidated_by_node_update');
    if (source_error.type === 'binding_invalidated_by_node_update') {
      expect(source_error.binding_id).toBe('binding');
      expect(source_error.handle).toBe('out');
    }

    const target_result = update_node(document, 'target', node => ({ ...node, inputs: [] }));
    const target_error = unwrap_error(target_result);
    expect(target_error.type).toBe('binding_invalidated_by_node_update');
    if (target_error.type === 'binding_invalidated_by_node_update') {
      expect(target_error.binding_id).toBe('binding');
      expect(target_error.handle).toBe('in');
    }

    expect(JSON.stringify(document)).toBe(snapshot);
  });

  it('rejects host port changes that break scope alignment', () => {
    let document = unwrap_document(
      add_graph(
        create_empty_graph_document(),
        make_scope('child', 'root', [{ id: 'in', label: 'In' }]),
      ),
    );
    const host = make_node('host', 'root', [port('in', 'input')], [], 'child');
    document = unwrap_document(add_node(document, host));
    expect_valid(document);
    const snapshot = JSON.stringify(document);

    const result = update_node(document, 'host', node => ({ ...node, inputs: [] }));
    const error = unwrap_error(result);
    expect(error.type).toBe('host_ports_scope_mismatch');
    if (error.type === 'host_ports_scope_mismatch') {
      expect(error.direction).toBe('input');
    }
    expect(JSON.stringify(document)).toBe(snapshot);
  });

  it('validates a nested_graph_id introduced or changed by updater', () => {
    let document = unwrap_document(
      add_graph(
        create_empty_graph_document(),
        make_scope('child', 'root', [{ id: 'in', label: 'In' }]),
      ),
    );
    document = unwrap_document(
      add_node(document, make_node('plain', 'root', [port('in', 'input')])),
    );

    const attached = unwrap_document(
      update_node(document, 'plain', node => ({ ...node, nested_graph_id: 'child' })),
    );
    expect(attached.nodes['plain']?.nested_graph_id).toBe('child');
    expect_valid(attached);

    document = unwrap_document(add_graph(attached, make_scope('sub')));
    document = unwrap_document(
      add_graph(
        document,
        make_scope('wrong', 'sub', [{ id: 'in', label: 'In' }]),
      ),
    );
    const wrong_result = update_node(document, 'plain', node => ({
      ...node,
      nested_graph_id: 'wrong',
    }));
    const wrong_error = unwrap_error(wrong_result);
    expect(wrong_error.type).toBe('host_graph_parent_mismatch');
    if (wrong_error.type === 'host_graph_parent_mismatch') {
      expect(wrong_error.nested_parent_graph_id).toBe('sub');
    }
  });
});

describe('add_node host invariants', () => {
  it('rejects host nodes that point to the root graph', () => {
    const document = create_empty_graph_document();
    const result = add_node(
      document,
      make_node('host_root', 'root', [], [], 'root'),
    );
    const error = unwrap_error(result);
    expect(error.type).toBe('host_graph_is_root');
    if (error.type === 'host_graph_is_root') {
      expect(error.nested_graph_id).toBe('root');
    }
  });

  it('rejects missing, invalid-kind, and parent-mismatched nested scopes', () => {
    let document = create_empty_graph_document();
    document = unwrap_document(add_graph(document, make_scope('child')));

    const missing_result = add_node(
      document,
      make_node('host_missing', 'root', [], [], 'missing'),
    );
    expect(unwrap_error(missing_result).type).toBe('nested_graph_not_found');

    const invalid_kind_scope: GraphScope = {
      ...make_scope('invalid_kind'),
      kind: 'invalid' as unknown as GraphScope['kind'],
    };
    document = unwrap_document(add_graph(document, invalid_kind_scope));
    const kind_result = add_node(
      document,
      make_node('host_kind', 'root', [], [], 'invalid_kind'),
    );
    const kind_error = unwrap_error(kind_result);
    expect(kind_error.type).toBe('host_graph_kind_invalid');
    if (kind_error.type === 'host_graph_kind_invalid') {
      expect(kind_error.nested_kind).toBe('invalid');
    }

    document = unwrap_document(add_graph(document, make_scope('sub')));
    document = unwrap_document(
      add_graph(document, make_scope('other', 'sub')),
    );
    const parent_result = add_node(
      document,
      make_node('host_parent', 'root', [], [], 'other'),
    );
    const parent_error = unwrap_error(parent_result);
    expect(parent_error.type).toBe('host_graph_parent_mismatch');
    if (parent_error.type === 'host_graph_parent_mismatch') {
      expect(parent_error.nested_graph_id).toBe('other');
      expect(parent_error.node_graph_id).toBe('root');
      expect(parent_error.nested_parent_graph_id).toBe('sub');
    }
  });

  it('rejects host ports that do not align with scope slots', () => {
    const document = unwrap_document(
      add_graph(
        create_empty_graph_document(),
        make_scope(
          'child',
          'root',
          [{ id: 'in', label: 'In' }],
          [{ id: 'out', label: 'Out' }],
        ),
      ),
    );

    const missing_input = add_node(
      document,
      make_node('bad_input', 'root', [], [port('out', 'output')], 'child'),
    );
    const input_error = unwrap_error(missing_input);
    expect(input_error.type).toBe('host_ports_scope_mismatch');
    if (input_error.type === 'host_ports_scope_mismatch') {
      expect(input_error.direction).toBe('input');
    }

    const missing_output = add_node(
      document,
      make_node('bad_output', 'root', [port('in', 'input')], [], 'child'),
    );
    const output_error = unwrap_error(missing_output);
    expect(output_error.type).toBe('host_ports_scope_mismatch');
    if (output_error.type === 'host_ports_scope_mismatch') {
      expect(output_error.direction).toBe('output');
    }
  });
});

describe('host move and boundary usage invariants', () => {
  it('refuses to move a host node', () => {
    let document = unwrap_document(add_graph(create_empty_graph_document(), make_scope('scope')));
    document = unwrap_document(add_graph(document, make_scope('target')));
    document = unwrap_document(
      add_node(document, make_node('host', 'root', [], [], 'scope')),
    );
    const snapshot = JSON.stringify(document);

    const result = move_node_to_graph(document, 'host', 'target');
    const error = unwrap_error(result);
    expect(error.type).toBe('cannot_move_host_node');
    if (error.type === 'cannot_move_host_node') {
      expect(error.nested_graph_id).toBe('scope');
    }
    expect(JSON.stringify(document)).toBe(snapshot);
  });

  it('rejects removing or moving internal nodes referenced by a boundary mapping', () => {
    const document = make_packed_document();
    const boundary = Object.values(document.boundary_bindings).find(item => {
      return item.direction === 'input' && item.node_id === 'internal';
    });
    expect(boundary).toBeDefined();
    const snapshot = JSON.stringify(document);

    const remove_result = remove_node(document, 'internal');
    const remove_error = unwrap_error(remove_result);
    expect(remove_error.type).toBe('node_used_by_boundary');
    if (remove_error.type === 'node_used_by_boundary') {
      expect(remove_error.boundary_ids).toContain(boundary?.id);
    }

    const with_target = unwrap_document(add_graph(document, make_scope('other')));
    const move_result = move_node_to_graph(with_target, 'internal', 'other');
    const move_error = unwrap_error(move_result);
    expect(move_error.type).toBe('node_used_by_boundary');
    if (move_error.type === 'node_used_by_boundary') {
      expect(move_error.boundary_ids).toContain(boundary?.id);
    }

    expect(JSON.stringify(document)).toBe(snapshot);
  });

  it('removes host instances but keeps their scope definitions', () => {
    let document = unwrap_document(add_graph(create_empty_graph_document(), make_scope('child')));
    document = unwrap_document(
      add_node(document, make_node('host_1', 'root', [], [], 'child')),
    );
    document = unwrap_document(
      add_node(document, make_node('host_2', 'root', [], [], 'child')),
    );
    document = unwrap_document(add_node(document, make_node('inside', 'child')));

    const after_first_removal = unwrap_document(remove_node(document, 'host_1'));
    expect(after_first_removal.nodes['host_1']).toBeUndefined();
    expect(after_first_removal.nodes['host_2']?.nested_graph_id).toBe('child');
    expect(after_first_removal.nodes['inside']?.graph_id).toBe('child');
    expect(after_first_removal.graphs['child']).toBeDefined();
    expect_valid(after_first_removal);

    const after_last_removal = unwrap_document(remove_node(after_first_removal, 'host_2'));
    expect(after_last_removal.nodes['host_2']).toBeUndefined();
    expect(after_last_removal.nodes['inside']).toBeDefined();
    expect(after_last_removal.graphs['child']).toBeDefined();
    expect_valid(after_last_removal);
  });
});

describe('validation invariants', () => {
  it('reports duplicate input and output slot ids', () => {
    const duplicate_slots_scope: GraphScope = {
      id: 'child',
      kind: 'subgraph',
      parent_graph_id: 'root',
      title: 'child',
      input_slots: [
        { id: 'dup', label: 'Input A' },
        { id: 'dup', label: 'Input B' },
      ],
      output_slots: [
        { id: 'repeat', label: 'Output A' },
        { id: 'repeat', label: 'Output B' },
      ],
    };
    const document = unwrap_document(
      add_graph(create_empty_graph_document(), duplicate_slots_scope),
    );

    const paths = get_issue_paths(document);
    expect(paths).toContain('graphs.child.input_slots.1.id');
    expect(paths).toContain('graphs.child.output_slots.1.id');
  });

  it('reports duplicate boundary mappings for the same graph direction and slot', () => {
    const document = make_packed_document();
    const input_boundary = Object.values(document.boundary_bindings).find(item => {
      return item.direction === 'input';
    });
    if (input_boundary == null) {
      throw new Error('expected an input boundary');
    }
    const duplicate_boundary: GraphBoundaryBinding = {
      ...input_boundary,
      id: 'duplicate_boundary',
    };
    const duplicate_document: GraphDocument = {
      ...document,
      boundary_bindings: {
        ...document.boundary_bindings,
        [duplicate_boundary.id]: duplicate_boundary,
      },
    };

    const paths = get_issue_paths(duplicate_document);
    expect(paths).toContain('boundary_bindings.duplicate_boundary.slot_id');
  });

  it('reports host parent, root, and kind relationship violations', () => {
    const packed = make_packed_document();
    const host = packed.nodes['host'];
    if (host == null) {
      throw new Error('expected a host node');
    }
    const child = packed.graphs['child'];
    if (child == null) {
      throw new Error('expected a child graph');
    }

    const with_other = unwrap_document(add_graph(packed, make_scope('other')));
    const parent_mismatch: GraphDocument = {
      ...with_other,
      graphs: {
        ...with_other.graphs,
        child: { ...child, parent_graph_id: 'other' },
      },
    };
    expect(get_issue_paths(parent_mismatch)).toContain('nodes.host.nested_graph_id');

    const points_to_root: GraphDocument = {
      ...packed,
      nodes: { ...packed.nodes, host: { ...host, nested_graph_id: 'root' } },
    };
    expect(get_issue_paths(points_to_root)).toContain('nodes.host.nested_graph_id');

    const invalid_kind: GraphDocument = {
      ...packed,
      graphs: {
        ...packed.graphs,
        child: { ...child, kind: 'invalid' as unknown as GraphScope['kind'] },
      },
    };
    expect(get_issue_paths(invalid_kind)).toContain('nodes.host.nested_graph_id');
  });
});