import { describe, expect, it } from 'vitest';
import type { GraphNode, Port } from '@/core/types';
import type { GraphDocument, GraphNodeRecord, GraphScope } from '@/core/graph/types';
import {
  add_binding,
  add_graph,
  add_node,
  create_empty_graph_document,
  type GraphDocumentError,
} from '@/core/graph/document';
import { pack_nodes, unpack_subgraph } from '@/core/graph/subgraph';
import { validate_graph_document } from '@/core/graph/validation';
import {
  create_graph_session,
  enter_subgraph,
  exit_subgraph,
  session_current_bindings,
  session_current_boundary_bindings,
  session_current_graph,
  session_current_nodes,
  session_set_document,
  type GraphSession,
  type GraphSessionError,
} from '@/core/graph/session';
import * as E from 'fp-ts/Either';
import * as O from 'fp-ts/Option';

const port = (id: string, kind: 'input' | 'output', value_type = 'text'): Port => {
  return { id, label: id, type: kind, value_type };
};

const make_graph_node = (
  id: string,
  inputs: readonly Port[] = [],
  outputs: readonly Port[] = [],
): GraphNode => {
  return {
    id,
    type: 'default',
    position: { x: 0, y: 0 },
    size: { x: 100, y: 100 },
    title: id,
    inputs,
    outputs,
    custom_data: {},
  };
};

const make_node_record = (
  id: string,
  graph_id: string,
  inputs: readonly Port[] = [],
  outputs: readonly Port[] = [],
  nested_graph_id?: string,
): GraphNodeRecord => {
  return {
    ...make_graph_node(id, inputs, outputs),
    graph_id,
    nested_graph_id,
  };
};

const make_subgraph = (id: string, parent_graph_id: string): GraphScope => {
  return {
    id,
    kind: 'subgraph',
    parent_graph_id,
    title: id,
    input_slots: [],
    output_slots: [],
  };
};

const unwrap_document = (result: E.Either<GraphDocumentError, GraphDocument>): GraphDocument => {
  if (E.isLeft(result)) {
    throw new Error(`unexpected document error: ${result.left.type}`);
  }
  return result.right;
};

const unwrap_session = (result: E.Either<GraphSessionError, GraphSession>): GraphSession => {
  if (E.isLeft(result)) {
    throw new Error(`unexpected session error: ${result.left.type}`);
  }
  return result.right;
};

const unwrap_session_error = (
  result: E.Either<GraphSessionError, GraphSession>,
): GraphSessionError => {
  if (E.isRight(result)) {
    throw new Error('expected a session error');
  }
  return result.left;
};

const current_graph_of = (session: GraphSession): GraphScope => {
  const current_graph = session_current_graph(session);
  if (O.isNone(current_graph)) {
    throw new Error('expected a current graph');
  }
  return current_graph.value;
};

describe('graph session', () => {
  it('creates a root session', () => {
    const document = create_empty_graph_document();
    const session = unwrap_session(create_graph_session(document));

    expect(session.document).toBe(document);
    expect(session.path).toEqual(['root']);
    expect(current_graph_of(session).id).toBe('root');
    expect(session_current_nodes(session)).toEqual({});
    expect(session_current_bindings(session)).toEqual({});
    expect(session_current_boundary_bindings(session)).toEqual({});
  });

  it('rejects a document whose root graph is missing', () => {
    const document = {
      ...create_empty_graph_document(),
      graphs: {},
    } as GraphDocument;
    const error = unwrap_session_error(create_graph_session(document));

    expect(error.type).toBe('root_graph_not_found');
  });

  it('enters and exits one and multiple subgraph levels', () => {
    let document = create_empty_graph_document();
    document = unwrap_document(add_graph(document, make_subgraph('child1', 'root')));
    document = unwrap_document(add_graph(document, make_subgraph('child2', 'child1')));
    document = unwrap_document(
      add_node(document, make_node_record('host1', 'root', [], [], 'child1')),
    );
    document = unwrap_document(
      add_node(document, make_node_record('host2', 'child1', [], [], 'child2')),
    );
    document = unwrap_document(add_node(document, make_node_record('inside_child2', 'child2')));

    const root_session = unwrap_session(create_graph_session(document));
    const first_level = unwrap_session(enter_subgraph(root_session, 'host1'));
    expect(first_level.path).toEqual(['root', 'child1']);
    expect(current_graph_of(first_level).id).toBe('child1');
    expect(Object.keys(session_current_nodes(first_level))).toEqual(['host2']);

    const second_level = unwrap_session(enter_subgraph(first_level, 'host2'));
    expect(second_level.path).toEqual(['root', 'child1', 'child2']);
    expect(current_graph_of(second_level).id).toBe('child2');
    expect(Object.keys(session_current_nodes(second_level))).toEqual(['inside_child2']);

    const back_to_child1 = unwrap_session(exit_subgraph(second_level));
    expect(back_to_child1.path).toEqual(['root', 'child1']);
    expect(current_graph_of(back_to_child1).id).toBe('child1');

    const back_to_root = unwrap_session(exit_subgraph(back_to_child1));
    expect(back_to_root.path).toEqual(['root']);
    expect(current_graph_of(back_to_root).id).toBe('root');
  });

  it('rejects invalid hosts and root exit', () => {
    let document = create_empty_graph_document();
    document = unwrap_document(add_graph(document, make_subgraph('child', 'root')));
    document = unwrap_document(add_graph(document, make_subgraph('other', 'child')));
    document = unwrap_document(
      add_node(document, make_node_record('host_valid', 'root', [], [], 'child')),
    );
    document = unwrap_document(
      add_node(document, make_node_record('host_in_child', 'child', [], [], 'other')),
    );
    document = unwrap_document(add_node(document, make_node_record('plain', 'root')));
    document = unwrap_document(
      add_node(document, make_node_record('host_missing_scope', 'root', [], [], 'missing')),
    );
    document = unwrap_document(
      add_node(document, make_node_record('host_wrong_parent', 'root', [], [], 'other')),
    );

    const root_session = unwrap_session(create_graph_session(document));

    const missing_host_error = unwrap_session_error(enter_subgraph(root_session, 'missing'));
    expect(missing_host_error.type).toBe('host_not_found');

    const plain_error = unwrap_session_error(enter_subgraph(root_session, 'plain'));
    expect(plain_error.type).toBe('nested_graph_required');

    const outside_error = unwrap_session_error(enter_subgraph(root_session, 'host_in_child'));
    expect(outside_error.type).toBe('host_not_in_current_graph');

    const missing_scope_error = unwrap_session_error(
      enter_subgraph(root_session, 'host_missing_scope'),
    );
    expect(missing_scope_error.type).toBe('nested_graph_not_found');
    if (missing_scope_error.type === 'nested_graph_not_found') {
      expect(missing_scope_error.nested_graph_id).toBe('missing');
    }

    const parent_error = unwrap_session_error(enter_subgraph(root_session, 'host_wrong_parent'));
    expect(parent_error.type).toBe('nested_graph_parent_mismatch');
    if (parent_error.type === 'nested_graph_parent_mismatch') {
      expect(parent_error.nested_graph_id).toBe('other');
    }

    const root_exit_error = unwrap_session_error(exit_subgraph(root_session));
    expect(root_exit_error.type).toBe('cannot_exit_root');
  });

  it('keeps child scope after document ops and set_document returns child data', () => {
    const source = make_node_record('source', 'root', [], [port('out', 'output', 'text')]);
    let packed_document = unwrap_document(add_node(create_empty_graph_document(), source));
    packed_document = unwrap_document(
      pack_nodes(packed_document, {
        source_graph_id: 'root',
        node_ids: ['source'],
        graph_id: 'child',
        host_node_id: 'host',
      }),
    );

    const root_session = unwrap_session(create_graph_session(packed_document));
    const child_session = unwrap_session(enter_subgraph(root_session, 'host'));
    expect(child_session.path).toEqual(['root', 'child']);

    let child_document = unwrap_document(
      add_node(
        packed_document,
        'child',
        make_graph_node('consumer', [port('in', 'input', 'text')], []),
      ),
    );
    child_document = unwrap_document(
      add_binding(child_document, {
        id: 'child_binding',
        graph_id: 'child',
        source_id: 'source',
        source_handle: 'out',
        target_id: 'consumer',
        target_handle: 'in',
      }),
    );

    const replaced = unwrap_session(session_set_document(child_session, child_document));
    expect(replaced.path).toEqual(['root', 'child']);
    expect(current_graph_of(replaced).id).toBe('child');
    expect(Object.keys(session_current_nodes(replaced)).sort()).toEqual(['consumer', 'source']);
    expect(session_current_bindings(replaced)).toEqual({
      child_binding: child_document.bindings['child_binding'],
    });
    expect(session_current_boundary_bindings(replaced)).toEqual({});
    expect(E.isRight(validate_graph_document(replaced.document))).toBe(true);
  });

  it('rejects set_document when the current graph is removed', () => {
    const inner = make_node_record('inner', 'root');
    let packed_document = unwrap_document(add_node(create_empty_graph_document(), inner));
    packed_document = unwrap_document(
      pack_nodes(packed_document, {
        source_graph_id: 'root',
        node_ids: ['inner'],
        graph_id: 'child',
        host_node_id: 'host',
      }),
    );

    const root_session = unwrap_session(create_graph_session(packed_document));
    const child_session = unwrap_session(enter_subgraph(root_session, 'host'));
    const unpacked_document = unwrap_document(unpack_subgraph(packed_document, 'host'));

    const error = unwrap_session_error(session_set_document(child_session, unpacked_document));
    expect(error.type).toBe('path_graph_not_found');
    if (error.type === 'path_graph_not_found') {
      expect(error.graph_id).toBe('child');
    }
  });

  it('rejects set_document when an ancestor in the path is missing', () => {
    const inner = make_node_record('inner', 'root');
    let document = unwrap_document(add_node(create_empty_graph_document(), inner));
    document = unwrap_document(
      pack_nodes(document, {
        source_graph_id: 'root',
        node_ids: ['inner'],
        graph_id: 'inner_graph',
        host_node_id: 'inner_host',
      }),
    );
    document = unwrap_document(
      pack_nodes(document, {
        source_graph_id: 'root',
        node_ids: ['inner_host'],
        graph_id: 'outer_graph',
        host_node_id: 'outer_host',
      }),
    );

    const root_session = unwrap_session(create_graph_session(document));
    const outer_session = unwrap_session(enter_subgraph(root_session, 'outer_host'));
    const deep_session = unwrap_session(enter_subgraph(outer_session, 'inner_host'));
    expect(deep_session.path).toEqual(['root', 'outer_graph', 'inner_graph']);
    expect(current_graph_of(deep_session).id).toBe('inner_graph');

    const unpacked_document = unwrap_document(unpack_subgraph(document, 'outer_host'));
    const error = unwrap_session_error(session_set_document(deep_session, unpacked_document));
    expect(error.type).toBe('path_graph_not_found');
    if (error.type === 'path_graph_not_found') {
      expect(error.graph_id).toBe('outer_graph');
    }
  });

  it('does not mutate session or document inputs', () => {
    let document = create_empty_graph_document();
    document = unwrap_document(add_graph(document, make_subgraph('child', 'root')));
    document = unwrap_document(
      add_node(document, make_node_record('host', 'root', [], [], 'child')),
    );
    const document_snapshot = JSON.stringify(document);

    const root_session = unwrap_session(create_graph_session(document));
    const root_session_snapshot = JSON.stringify(root_session);
    const child_session = unwrap_session(enter_subgraph(root_session, 'host'));
    const child_session_snapshot = JSON.stringify(child_session);

    const exited = unwrap_session(exit_subgraph(child_session));
    expect(exited.path).toEqual(['root']);

    const updated_document = unwrap_document(
      add_node(child_session.document, 'child', make_graph_node('inside')),
    );
    const replaced = unwrap_session(session_set_document(child_session, updated_document));

    expect(JSON.stringify(root_session)).toBe(root_session_snapshot);
    expect(JSON.stringify(child_session)).toBe(child_session_snapshot);
    expect(JSON.stringify(document)).toBe(document_snapshot);
    expect(child_session.document.nodes['inside']).toBeUndefined();
    expect(replaced.document.nodes['inside']).toBeDefined();
    expect(replaced.path).toEqual(child_session.path);
    expect(replaced.path).not.toBe(child_session.path);
  });
});
