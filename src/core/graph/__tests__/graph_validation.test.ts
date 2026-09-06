import { describe, expect, it } from 'vitest';
import type { Port } from '@/core/types';
import type {
  GraphBindingRecord,
  GraphDocument,
  GraphNodeRecord,
} from '@/core/graph/types';
import {
  add_binding,
  add_graph,
  add_node,
  create_empty_graph_document,
  type GraphDocumentError,
} from '@/core/graph/document';
import { pack_nodes, type PackNodesOptions } from '@/core/graph/subgraph';
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
): GraphNodeRecord => {
  return {
    id,
    graph_id,
    type: 'default',
    position: { x: 0, y: 0 },
    size: { x: 100, y: 100 },
    title: id,
    inputs,
    outputs,
    custom_data: {},
  };
};

const unwrap_document = (result: E.Either<GraphDocumentError, GraphDocument>): GraphDocument => {
  if (E.isLeft(result)) {
    throw new Error(`unexpected error: ${result.left.type}`);
  }
  return result.right;
};

const unwrap_pack = (result: E.Either<GraphDocumentError, GraphDocument>): GraphDocument => {
  return unwrap_document(result);
};

const clone_document = (document: GraphDocument): GraphDocument => {
  return JSON.parse(JSON.stringify(document)) as GraphDocument;
};

const get_issues = (document: GraphDocument): readonly GraphValidationIssue[] => {
  const result = validate_graph_document(document);
  if (E.isRight(result)) {
    throw new Error('expected validation failure');
  }
  return result.left;
};

const expect_valid = (document: GraphDocument): void => {
  expect(E.isRight(validate_graph_document(document))).toBe(true);
};

const expect_issue_path = (document: GraphDocument, path: string): void => {
  const issue_paths = get_issues(document).map(issue => issue.path);
  expect(issue_paths).toContain(path);
};

const add_subgraph = (document: GraphDocument, id: string): GraphDocument => {
  return unwrap_document(
    add_graph(document, {
      id,
      kind: 'subgraph',
      parent_graph_id: 'root',
      title: id,
      input_slots: [],
      output_slots: [],
    }),
  );
};

const make_crossing_document = (): GraphDocument => {
  const external_source = make_node('external_source', 'root', [], [port('source_out', 'output')]);
  const external_target = make_node('external_target', 'root', [port('target_in', 'input')], []);
  const internal = make_node('internal', 'root', [port('in', 'input')], [port('out', 'output')]);
  let document = unwrap_document(add_node(create_empty_graph_document(), external_source));
  document = unwrap_document(add_node(document, external_target));
  document = unwrap_document(add_node(document, internal));
  document = unwrap_document(
    add_binding(document, {
      id: 'input_binding',
      graph_id: 'root',
      source_id: 'external_source',
      source_handle: 'source_out',
      target_id: 'internal',
      target_handle: 'in',
    }),
  );
  document = unwrap_document(
    add_binding(document, {
      id: 'output_binding',
      graph_id: 'root',
      source_id: 'internal',
      source_handle: 'out',
      target_id: 'external_target',
      target_handle: 'target_in',
    }),
  );
  return document;
};

const make_packed_document = (): GraphDocument => {
  const base = make_crossing_document();
  const options: PackNodesOptions = {
    source_graph_id: 'root',
    node_ids: ['internal'],
    graph_id: 'child',
    host_node_id: 'host',
  };
  return unwrap_pack(pack_nodes(base, options));
};

describe('graph validation', () => {
  it('accepts a valid host/boundary document and a nested scope', () => {
    const packed = make_packed_document();
    expect_valid(packed);

    let nested_base = unwrap_document(add_node(create_empty_graph_document(), make_node('a', 'root')));
    nested_base = unwrap_document(add_node(nested_base, make_node('b', 'root')));
    nested_base = unwrap_document(add_node(nested_base, make_node('c', 'root')));
    const inner = unwrap_pack(
      pack_nodes(nested_base, {
        source_graph_id: 'root',
        node_ids: ['a', 'b'],
        graph_id: 'child',
        host_node_id: 'inner_host',
      }),
    );
    const nested = unwrap_pack(
      pack_nodes(inner, {
        source_graph_id: 'root',
        node_ids: ['inner_host', 'c'],
        graph_id: 'outer_graph',
        host_node_id: 'outer_host',
      }),
    );
    expect_valid(nested);
    expect(nested.graphs['outer_graph']?.parent_graph_id).toBe('root');
    expect(nested.graphs['child']?.parent_graph_id).toBe('outer_graph');
    expect(nested.nodes['outer_host']?.graph_id).toBe('root');
    expect(nested.nodes['outer_host']?.nested_graph_id).toBe('outer_graph');
    expect(nested.nodes['inner_host']?.graph_id).toBe('outer_graph');
    expect(nested.nodes['inner_host']?.nested_graph_id).toBe('child');
  });

  it('rejects root graph and parent hierarchy errors with paths', () => {
    const missing_root = create_empty_graph_document();
    expect_issue_path({ ...missing_root, root_graph_id: 'missing' }, 'root_graph_id');

    const wrong_root_kind = create_empty_graph_document();
    expect_issue_path(
      {
        ...wrong_root_kind,
        graphs: {
          root: { ...wrong_root_kind.graphs['root'], kind: 'subgraph' },
        },
      },
      'graphs.root.kind',
    );

    const root_with_parent = create_empty_graph_document();
    expect_issue_path(
      {
        ...root_with_parent,
        graphs: {
          root: { ...root_with_parent.graphs['root'], parent_graph_id: 'missing' },
        },
      },
      'graphs.root.parent_graph_id',
    );

    const missing_parent = add_subgraph(create_empty_graph_document(), 'child');
    expect_issue_path(
      {
        ...missing_parent,
        graphs: {
          ...missing_parent.graphs,
          child: { ...missing_parent.graphs['child'], parent_graph_id: undefined },
        },
      },
      'graphs.child.parent_graph_id',
    );

    const bad_parent = add_subgraph(create_empty_graph_document(), 'child');
    expect_issue_path(
      {
        ...bad_parent,
        graphs: {
          ...bad_parent.graphs,
          child: { ...bad_parent.graphs['child'], parent_graph_id: 'missing' },
        },
      },
      'graphs.child.parent_graph_id',
    );
  });

  it('rejects scope hierarchy cycles with a readable graph path', () => {
    let document = add_subgraph(create_empty_graph_document(), 'child');
    document = unwrap_document(
      add_graph(document, {
        id: 'grand',
        kind: 'subgraph',
        parent_graph_id: 'child',
        title: 'grand',
        input_slots: [],
        output_slots: [],
      }),
    );
    document = {
      ...document,
      graphs: {
        ...document.graphs,
        child: { ...document.graphs['child'], parent_graph_id: 'grand' },
      },
    };
    const issues = get_issues(document);
    const cycle_issue = issues.find(issue => issue.path.startsWith('graphs.'));
    expect(cycle_issue).toBeDefined();
    expect(cycle_issue?.message).toContain('cycle');
  });

  it('rejects node graph and key errors with paths', () => {
    let document = add_subgraph(create_empty_graph_document(), 'sub');
    document = unwrap_document(add_node(document, make_node('n1', 'sub')));
    expect_issue_path(
      { ...document, nodes: { ...document.nodes, n1: { ...document.nodes['n1'], graph_id: 'missing' } } },
      'nodes.n1.graph_id',
    );

    document = unwrap_document(add_node(document, make_node('n2', 'sub')));
    expect_issue_path(
      { ...document, nodes: { ...document.nodes, wrong_key: document.nodes['n1'] } },
      'nodes.wrong_key.id',
    );
  });

  it('rejects bindings whose graph, nodes, or ports are invalid', () => {
    const source = make_node('source', 'root', [], [port('out', 'output')]);
    const target = make_node('target', 'root', [port('in', 'input')], []);
    let document = unwrap_document(add_node(create_empty_graph_document(), source));
    document = unwrap_document(add_node(document, target));

    const valid_binding: GraphBindingRecord = {
      id: 'b1',
      graph_id: 'root',
      source_id: 'source',
      source_handle: 'out',
      target_id: 'target',
      target_handle: 'in',
    };
    document = unwrap_document(add_binding(document, valid_binding));

    expect_issue_path(
      { ...document, bindings: { ...document.bindings, b1: { ...valid_binding, source_handle: 'missing' } } },
      'bindings.b1.source_handle',
    );
    expect_issue_path(
      { ...document, bindings: { ...document.bindings, b1: { ...valid_binding, target_handle: 'missing' } } },
      'bindings.b1.target_handle',
    );

    const sub_document = add_subgraph(create_empty_graph_document(), 'sub');
    const other_target = unwrap_document(
      add_node(sub_document, make_node('other_target', 'sub', [port('in', 'input')], [])),
    );
    const crossing: GraphBindingRecord = {
      id: 'cross',
      graph_id: 'root',
      source_id: 'source',
      source_handle: 'out',
      target_id: 'other_target',
      target_handle: 'in',
    };
    expect_issue_path(
      {
        ...other_target,
        bindings: { ...other_target.bindings, cross: crossing },
      },
      'bindings.cross.graph_id',
    );
  });

  it('rejects invalid boundary bindings with paths', () => {
    const packed = make_packed_document();
    const boundary_input_id = 'child:input:0';
    const boundary_output_id = 'child:output:0';
    const input_boundary = packed.boundary_bindings[boundary_input_id];
    const output_boundary = packed.boundary_bindings[boundary_output_id];
    if (input_boundary == null || output_boundary == null) {
      throw new Error('expected packed boundaries');
    }

    const with_outside_node = unwrap_document(
      add_node(packed, make_node('outside', 'root', [port('in', 'input')], [])),
    );
    expect_issue_path(
      {
        ...with_outside_node,
        boundary_bindings: {
          ...with_outside_node.boundary_bindings,
          [boundary_input_id]: { ...input_boundary, node_id: 'outside' },
        },
      },
      'boundary_bindings.child:input:0.graph_id',
    );

    expect_issue_path(
      {
        ...packed,
        boundary_bindings: {
          ...packed.boundary_bindings,
          [boundary_output_id]: { ...output_boundary, direction: 'input' },
        },
      },
      'boundary_bindings.child:output:0.slot_id',
    );
    expect_issue_path(
      {
        ...packed,
        boundary_bindings: {
          ...packed.boundary_bindings,
          [boundary_input_id]: { ...input_boundary, graph_id: 'missing' },
        },
      },
      'boundary_bindings.child:input:0.graph_id',
    );
  });

  it('rejects host and scope port mismatches with paths', () => {
    const packed = make_packed_document();
    const host = packed.nodes['host'];
    if (host == null) {
      throw new Error('expected host node');
    }

    expect_issue_path(
      {
        ...packed,
        nodes: { ...packed.nodes, host: { ...host, outputs: [] } },
      },
      'nodes.host.outputs',
    );

    expect_issue_path(
      {
        ...packed,
        nodes: { ...packed.nodes, host: { ...host, nested_graph_id: 'missing' } },
      },
      'nodes.host.nested_graph_id',
    );
  });

  it('returns no issues for a document rebuilt from JSON', () => {
    const document = make_packed_document();
    const cloned = clone_document(document);
    expect_valid(cloned);
  });
});
