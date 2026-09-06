import { describe, expect, it } from 'vitest';
import type { Port } from '@/core/types';
import type {
  GraphBindingRecord,
  GraphDocument,
  GraphNodeRecord,
  GraphScope,
} from '@/core/graph/types';
import {
  add_binding,
  add_graph,
  add_node,
  create_empty_graph_document,
  get_binding,
  get_graph,
  get_node,
  move_node_to_graph,
  remove_binding,
  remove_graph,
  remove_node,
  type GraphDocumentError,
} from '@/core/graph/document';
import * as E from 'fp-ts/Either';
import * as O from 'fp-ts/Option';

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

const make_subgraph = (id: string, parent_graph_id = 'root'): GraphScope => {
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

describe('graph document', () => {
  describe('create and graphs', () => {
    it('creates a root graph document', () => {
      const document = create_empty_graph_document();
      expect(document.root_graph_id).toBe('root');
      expect(O.isSome(get_graph(document, 'root'))).toBe(true);
      expect(document.graphs['root']?.kind).toBe('root');
      expect(document.nodes).toEqual({});
      expect(document.bindings).toEqual({});
    });

    it('adds and removes an empty subgraph', () => {
      const document = create_empty_graph_document();
      const with_subgraph = unwrap_document(add_graph(document, make_subgraph('sub')));
      expect(with_subgraph.graphs['sub']).toEqual(make_subgraph('sub'));
      expect(document.graphs['sub']).toBeUndefined();

      const without_subgraph = unwrap_document(remove_graph(with_subgraph, 'sub'));
      expect(without_subgraph.graphs['sub']).toBeUndefined();
      expect(without_subgraph.graphs['root']).toBeDefined();
    });

    it('validates graph ids and parents', () => {
      const document = create_empty_graph_document();
      const with_subgraph = unwrap_document(add_graph(document, make_subgraph('sub')));
      const duplicate = add_graph(with_subgraph, make_subgraph('sub'));
      expect(unwrap_error(duplicate).type).toBe('graph_already_exists');

      const missing_parent = add_graph(document, make_subgraph('child', 'missing'));
      expect(unwrap_error(missing_parent).type).toBe('parent_graph_not_found');

      const root: GraphScope = make_subgraph('other_root') as GraphScope;
      const no_parent = add_graph(document, { ...root, kind: 'root', parent_graph_id: undefined });
      expect(unwrap_error(no_parent).type).toBe('root_already_exists');

      const root_with_parent: GraphScope = {
        ...make_subgraph('bad_root'),
        kind: 'root',
        parent_graph_id: 'root',
      };
      const with_parent = add_graph(document, root_with_parent);
      expect(unwrap_error(with_parent).type).toBe('root_graph_must_not_have_parent');
    });

    it('does not remove the root or non-empty graphs', () => {
      const document = create_empty_graph_document();
      const root_result = remove_graph(document, 'root');
      expect(unwrap_error(root_result).type).toBe('cannot_remove_root');

      const missing_result = remove_graph(document, 'missing');
      expect(unwrap_error(missing_result).type).toBe('graph_not_found');

      const with_subgraph = unwrap_document(add_graph(document, make_subgraph('sub')));
      const with_child = unwrap_document(add_graph(with_subgraph, make_subgraph('grand', 'sub')));
      const child_result = remove_graph(with_child, 'sub');
      expect(unwrap_error(child_result).type).toBe('graph_has_children');

      const with_node = unwrap_document(add_node(with_subgraph, make_node('n1', 'sub')));
      const non_empty_result = remove_graph(with_node, 'sub');
      const non_empty_error = unwrap_error(non_empty_result);
      expect(non_empty_error.type).toBe('graph_not_empty');
    });
  });

  describe('nodes', () => {
    it('adds and removes nodes and enforces global ids', () => {
      const document = create_empty_graph_document();
      const with_subgraph = unwrap_document(add_graph(document, make_subgraph('sub')));
      const added = unwrap_document(add_node(with_subgraph, make_node('n1', 'sub')));
      expect(get_node(added, 'n1')).toEqual(O.some(added.nodes['n1']));
      expect(O.isNone(get_node(added, 'missing'))).toBe(true);

      const duplicate = add_node(added, make_node('n1', 'root'));
      expect(unwrap_error(duplicate).type).toBe('duplicate_node_id');

      const missing_graph = add_node(document, make_node('n2', 'missing'));
      expect(unwrap_error(missing_graph).type).toBe('graph_not_found');

      const removed = unwrap_document(remove_node(added, 'n1'));
      expect(O.isNone(get_node(removed, 'n1'))).toBe(true);

      const missing_remove = remove_node(removed, 'n1');
      expect(unwrap_error(missing_remove).type).toBe('node_not_found');
    });

    it('supports the graph_id plus node form', () => {
      const document = create_empty_graph_document();
      const added = unwrap_document(add_node(document, 'root', make_node('n1', 'root')));
      expect(added.nodes['n1']?.graph_id).toBe('root');
    });
  });

  describe('bindings', () => {
    const make_bound_nodes = (): GraphDocument => {
      const a = make_node('a', 'root', [], [port('out', 'output')]);
      const b = make_node('b', 'root', [port('in', 'input')], []);
      let document = unwrap_document(add_node(create_empty_graph_document(), a));
      document = unwrap_document(add_node(document, b));
      return document;
    };

    it('adds and removes a valid binding', () => {
      const binding: GraphBindingRecord = {
        id: 'b1',
        graph_id: 'root',
        source_id: 'a',
        source_handle: 'out',
        target_id: 'b',
        target_handle: 'in',
      };
      const document = make_bound_nodes();
      const added = unwrap_document(add_binding(document, binding));
      expect(get_binding(added, 'b1')).toEqual(O.some(binding));
      expect(document.bindings['b1']).toBeUndefined();

      const removed = unwrap_document(remove_binding(added, 'b1'));
      expect(O.isNone(get_binding(removed, 'b1'))).toBe(true);

      const missing_remove = remove_binding(removed, 'b1');
      expect(unwrap_error(missing_remove).type).toBe('binding_not_found');
    });

    it('rejects duplicate, invalid, and cross-graph bindings', () => {
      const binding: GraphBindingRecord = {
        id: 'b1',
        graph_id: 'root',
        source_id: 'a',
        source_handle: 'out',
        target_id: 'b',
        target_handle: 'in',
      };
      const document = make_bound_nodes();
      const with_binding = unwrap_document(add_binding(document, binding));
      const duplicate = add_binding(with_binding, binding);
      expect(unwrap_error(duplicate).type).toBe('binding_already_exists');

      const bad_source = add_binding(document, { ...binding, source_handle: 'missing' });
      expect(unwrap_error(bad_source).type).toBe('source_port_not_found');

      const bad_target = add_binding(document, { ...binding, target_handle: 'missing' });
      expect(unwrap_error(bad_target).type).toBe('target_port_not_found');

      const with_subgraph = unwrap_document(add_graph(document, make_subgraph('sub')));
      const outside = make_node('outside', 'sub', [port('in', 'input')], [port('out', 'output')]);
      const with_outside = unwrap_document(add_node(with_subgraph, outside));
      const cross_graph = add_binding(with_outside, {
        ...binding,
        id: 'b2',
        target_id: 'outside',
        target_handle: 'in',
      });
      expect(unwrap_error(cross_graph).type).toBe('binding_nodes_in_different_graphs');
    });

    it('removes bindings when a node is removed', () => {
      const a = make_node('a', 'root', [port('in_a', 'input')], [port('out_a', 'output')]);
      const b = make_node('b', 'root', [port('in_b', 'input')], [port('out_b', 'output')]);
      const c = make_node('c', 'root', [port('in_c', 'input')], []);
      let document = unwrap_document(add_node(create_empty_graph_document(), a));
      document = unwrap_document(add_node(document, b));
      document = unwrap_document(add_node(document, c));
      document = unwrap_document(
        add_binding(document, {
          id: 'incoming',
          graph_id: 'root',
          source_id: 'b',
          source_handle: 'out_b',
          target_id: 'a',
          target_handle: 'in_a',
        }),
      );
      document = unwrap_document(
        add_binding(document, {
          id: 'outgoing',
          graph_id: 'root',
          source_id: 'a',
          source_handle: 'out_a',
          target_id: 'c',
          target_handle: 'in_c',
        }),
      );

      const removed = unwrap_document(remove_node(document, 'a'));
      expect(removed.nodes['a']).toBeUndefined();
      expect(removed.bindings['incoming']).toBeUndefined();
      expect(removed.bindings['outgoing']).toBeUndefined();
      expect(removed.nodes['b']).toBeDefined();
      expect(removed.nodes['c']).toBeDefined();
    });
  });

  describe('move_node_to_graph', () => {
    it('moves a node and keeps its id', () => {
      const a = make_node('a', 'root', [], [port('out', 'output')]);
      const b = make_node('b', 'root', [port('in', 'input')], []);
      let document = unwrap_document(add_node(create_empty_graph_document(), a));
      document = unwrap_document(add_node(document, b));
      document = unwrap_document(add_graph(document, make_subgraph('sub')));
      document = unwrap_document(
        add_binding(document, {
          id: 'b1',
          graph_id: 'root',
          source_id: 'a',
          source_handle: 'out',
          target_id: 'b',
          target_handle: 'in',
        }),
      );

      const moved = unwrap_document(move_node_to_graph(document, 'b', 'sub'));
      expect(moved.nodes['b']?.id).toBe('b');
      expect(moved.nodes['b']?.graph_id).toBe('sub');
      expect(moved.bindings['b1']).toBeUndefined();
      expect(moved.nodes['a']?.graph_id).toBe('root');

      const moved_back = unwrap_document(move_node_to_graph(moved, 'b', 'root'));
      expect(moved_back.nodes['b']?.graph_id).toBe('root');
    });

    it('validates the node and target graph', () => {
      const document = create_empty_graph_document();
      const missing_node = move_node_to_graph(document, 'n1', 'root');
      expect(unwrap_error(missing_node).type).toBe('node_not_found');

      const with_node = unwrap_document(add_node(document, make_node('n1', 'root')));
      const missing_target = move_node_to_graph(with_node, 'n1', 'missing');
      expect(unwrap_error(missing_target).type).toBe('target_graph_not_found');

      const same_graph = move_node_to_graph(with_node, 'n1', 'root');
      expect(unwrap_error(same_graph).type).toBe('target_graph_is_current_graph');
    });
  });

  it('does not mutate an input document', () => {
    const sub = make_subgraph('sub');
    const a = make_node('a', 'root', [port('in_a', 'input')], [port('out_a', 'output')]);
    const b = make_node('b', 'sub', [port('in_b', 'input')], [port('out_b', 'output')]);
    const c = make_node('c', 'root', [port('in_c', 'input')], []);
    let document = unwrap_document(add_graph(create_empty_graph_document(), sub));
    document = unwrap_document(add_node(document, a));
    document = unwrap_document(add_node(document, b));
    document = unwrap_document(add_node(document, c));
    document = unwrap_document(
      add_binding(document, {
        id: 'root_binding',
        graph_id: 'root',
        source_id: 'a',
        source_handle: 'out_a',
        target_id: 'c',
        target_handle: 'in_c',
      }),
    );
    document = unwrap_document(
      add_binding(document, {
        id: 'sub_binding',
        graph_id: 'sub',
        source_id: 'b',
        source_handle: 'out_b',
        target_id: 'b',
        target_handle: 'in_b',
      }),
    );
    const snapshot = JSON.stringify(document);
    const operations: E.Either<GraphDocumentError, GraphDocument>[] = [
      add_graph(document, make_subgraph('child', 'sub')),
      remove_graph(document, 'root'),
      add_node(document, make_node('new', 'root')),
      remove_node(document, 'a'),
      move_node_to_graph(document, 'a', 'sub'),
      add_binding(document, {
        id: 'new_binding',
        graph_id: 'sub',
        source_id: 'b',
        source_handle: 'out_b',
        target_id: 'a',
        target_handle: 'in_a',
      }),
      remove_binding(document, 'root_binding'),
      remove_binding(document, 'sub_binding'),
    ];

    for (const operation of operations) {
      void operation;
    }
    expect(JSON.stringify(document)).toBe(snapshot);
  });

  it('roundtrips through JSON without losing structure', () => {
    const a = make_node('a', 'root', [port('in_a', 'input')], [port('out_a', 'output')]);
    let document = unwrap_document(add_node(create_empty_graph_document(), a));
    document = unwrap_document(add_graph(document, make_subgraph('sub')));
    const b = make_node('b', 'sub', [port('in_b', 'input')], []);
    document = unwrap_document(add_node(document, b));
    document = unwrap_document(
      add_binding(document, {
        id: 'binding',
        graph_id: 'root',
        source_id: 'a',
        source_handle: 'out_a',
        target_id: 'a',
        target_handle: 'in_a',
      }),
    );

    const round_tripped = JSON.parse(JSON.stringify(document)) as GraphDocument;
    expect(round_tripped).toEqual(document);
    expect(round_tripped.root_graph_id).toBe('root');
    expect(round_tripped.graphs['sub']?.kind).toBe('subgraph');
    expect(round_tripped.nodes['b']?.graph_id).toBe('sub');
    expect(round_tripped.bindings['binding']?.target_handle).toBe('in_a');
    expect(Object.getPrototypeOf(round_tripped)).toBe(Object.prototype);
  });
});
