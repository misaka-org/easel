import { describe, expect, it } from 'vitest';
import type { Port } from '@/core/types';
import type { GraphBindingRecord, GraphDocument, GraphNodeRecord } from '@/core/graph/types';
import { add_binding, add_node, create_empty_graph_document } from '@/core/graph/document';
import { pack_nodes, unpack_subgraph } from '@/core/graph/subgraph';
import {
  create_document_controller,
  deserialize_document_controller,
  type DocumentController,
  type DocumentControllerError,
  type DocumentGraphView,
} from '@/runtime/document_controller';
import * as E from 'fp-ts/Either';
import * as O from 'fp-ts/Option';

const port = (id: string, kind: 'input' | 'output'): Port => {
  return { id, label: id, type: kind, value_type: 'text' };
};

const make_node = (
  id: string,
  graph_id = 'root',
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

const unwrap_controller = (result: E.Either<unknown, DocumentController>): DocumentController => {
  if (E.isLeft(result)) {
    throw new Error(`unexpected controller error: ${String(result.left)}`);
  }
  return result.right;
};

const unwrap_document = (result: E.Either<unknown, GraphDocument>): GraphDocument => {
  if (E.isLeft(result)) {
    throw new Error(`unexpected document error: ${String(result.left)}`);
  }
  return result.right;
};

const unwrap_view = (
  result: E.Either<DocumentControllerError, DocumentGraphView>,
): DocumentGraphView => {
  if (E.isLeft(result)) {
    throw new Error(`unexpected controller operation error: ${result.left.type}`);
  }
  return result.right;
};

const make_crossing_document = (): GraphDocument => {
  const source = make_node('source', 'root', [], [port('source_out', 'output')]);
  const target = make_node('target', 'root', [port('target_in', 'input')], []);
  let document = unwrap_document(add_node(create_empty_graph_document(), source));
  document = unwrap_document(add_node(document, target));
  document = unwrap_document(
    add_binding(
      document,
      make_binding('external_input', 'root', 'source', 'source_out', 'target', 'target_in'),
    ),
  );
  return unwrap_document(
    pack_nodes(document, {
      source_graph_id: 'root',
      node_ids: ['target'],
      graph_id: 'child',
      host_node_id: 'host',
      host_title: 'Child',
    }),
  );
};

const make_boundary_document = (): GraphDocument => {
  const internal = make_node(
    'internal',
    'root',
    [port('internal_in', 'input')],
    [port('internal_out', 'output')],
  );
  const document = unwrap_document(add_node(create_empty_graph_document(), internal));
  return unwrap_document(
    pack_nodes(document, {
      source_graph_id: 'root',
      node_ids: ['internal'],
      graph_id: 'child',
      host_node_id: 'host',
      host_title: 'Child',
    }),
  );
};

const enter_child = (controller: DocumentController): DocumentGraphView => {
  return unwrap_view(controller.enter_subgraph('host'));
};

describe('document controller', () => {
  it('creates a root controller and root view', () => {
    const document = create_empty_graph_document();
    const controller = unwrap_controller(create_document_controller(document));

    expect(controller.document).toBe(document);
    expect(controller.path).toEqual(['root']);
    expect(O.isSome(controller.graph)).toBe(true);
    expect(controller.view.graph).toEqual(document.graphs['root']);
    expect(controller.view.path).toEqual(['root']);
    expect(controller.view.nodes).toEqual({});
    expect(controller.view.bindings).toEqual({});
    expect(controller.view.boundary_bindings).toEqual({});
  });

  it('enters and exits a packed subgraph with scoped view data', () => {
    const document = make_crossing_document();
    const controller = unwrap_controller(create_document_controller(document));

    const root_view = controller.view;
    expect(Object.keys(root_view.nodes).sort()).toEqual(['host', 'source']);
    expect(root_view.bindings).toEqual({ external_input: document.bindings['external_input'] });
    expect(root_view.boundary_bindings).toEqual({});

    const child_view = enter_child(controller);
    expect(child_view.path).toEqual(['root', 'child']);
    expect(child_view.graph.id).toBe('child');
    expect(Object.keys(child_view.nodes)).toEqual(['target']);
    expect(child_view.bindings).toEqual({});
    expect(Object.keys(child_view.boundary_bindings)).toEqual(['child:input:0']);
    expect(child_view.boundary_bindings['child:input:0']?.node_id).toBe('target');
    expect(child_view.graph.input_slots[0]?.id).toBe('input_0');
    expect(controller.document.nodes['host']?.inputs[0]?.id).toBe('input_0');

    const exited_view = unwrap_view(controller.exit_subgraph());
    expect(exited_view.path).toEqual(['root']);
    expect(controller.path).toEqual(['root']);
    expect(Object.keys(exited_view.nodes).sort()).toEqual(['host', 'source']);
    expect(exited_view.boundary_bindings).toEqual({});
  });

  it('edits nodes and bindings in the current scope without changing other scopes', () => {
    const controller = unwrap_controller(create_document_controller(make_crossing_document()));
    enter_child(controller);
    const root_nodes_snapshot = JSON.stringify(
      Object.fromEntries(
        Object.entries(controller.document.nodes).filter(([, node]) => node.graph_id === 'root'),
      ),
    );
    const root_bindings_snapshot = JSON.stringify(
      Object.fromEntries(
        Object.entries(controller.document.bindings).filter(
          ([, binding]) => binding.graph_id === 'root',
        ),
      ),
    );

    const child_source = make_node('child_source', 'child', [], [port('child_out', 'output')]);
    const child_target = make_node('child_target', 'child', [port('child_in', 'input')], []);
    unwrap_view(controller.add_node(child_source));
    let view = unwrap_view(controller.add_node(child_target));
    expect(Object.keys(view.nodes).sort()).toEqual(['child_source', 'child_target', 'target']);

    view = unwrap_view(
      controller.add_binding(
        make_binding(
          'child_binding',
          'child',
          'child_source',
          'child_out',
          'child_target',
          'child_in',
        ),
      ),
    );
    expect(view.bindings).toEqual({ child_binding: controller.document.bindings['child_binding'] });
    expect(controller.document.bindings['external_input']?.graph_id).toBe('root');

    view = unwrap_view(
      controller.update_node('child_source', node => ({ ...node, title: 'Renamed Source' })),
    );
    expect(view.nodes['child_source']?.title).toBe('Renamed Source');

    view = unwrap_view(controller.remove_binding('child_binding'));
    expect(view.bindings).toEqual({});
    expect(view.nodes['child_source']).toBeDefined();

    view = unwrap_view(controller.remove_node('child_target'));
    expect(view.nodes['child_target']).toBeUndefined();
    expect(view.bindings).toEqual({});

    expect(controller.document.nodes['child_source']?.graph_id).toBe('child');
    expect(controller.document.nodes['target']?.graph_id).toBe('child');
    expect(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(controller.document.nodes).filter(([, node]) => node.graph_id === 'root'),
        ),
      ),
    ).toBe(root_nodes_snapshot);
    expect(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(controller.document.bindings).filter(
            ([, binding]) => binding.graph_id === 'root',
          ),
        ),
      ),
    ).toBe(root_bindings_snapshot);
  });

  it('synchronizes host ports through boundary slot edits and exposes the current view', () => {
    const controller = unwrap_controller(create_document_controller(make_boundary_document()));
    const child_view = enter_child(controller);

    expect(child_view.graph.input_slots).toEqual([]);
    expect(controller.document.nodes['host']?.inputs).toEqual([]);

    let view = unwrap_view(
      controller.add_graph_boundary({
        direction: 'input',
        slot: { id: 'request', label: 'Request', value_type: 'text', required: true },
        mapping: { node_id: 'internal', port_id: 'internal_in' },
      }),
    );
    expect(view.graph.input_slots[0]?.id).toBe('request');
    expect(view.boundary_bindings['child:input:request']?.node_id).toBe('internal');
    expect(controller.document.nodes['host']?.inputs[0]?.id).toBe('request');
    expect(controller.document.nodes['host']?.inputs[0]?.label).toBe('Request');

    view = unwrap_view(
      controller.add_graph_boundary({
        direction: 'output',
        slot: { id: 'response', label: 'Response', value_type: 'text' },
        mapping: { node_id: 'internal', port_id: 'internal_out' },
      }),
    );
    expect(view.graph.output_slots[0]?.id).toBe('response');
    expect(controller.document.nodes['host']?.outputs[0]?.id).toBe('response');

    view = unwrap_view(
      controller.update_graph_boundary_slot('output', 'response', {
        label: 'Renamed Response',
        value_type: 'number',
        required: false,
      }),
    );
    expect(view.graph.output_slots[0]?.label).toBe('Renamed Response');
    expect(controller.document.nodes['host']?.outputs[0]?.label).toBe('Renamed Response');

    view = unwrap_view(controller.remove_graph_boundary('input', 'request'));
    expect(view.graph.input_slots).toEqual([]);
    expect(controller.document.nodes['host']?.inputs).toEqual([]);
    expect(view.boundary_bindings['child:input:request']).toBeUndefined();
    expect(view.graph.output_slots[0]?.id).toBe('response');
  });

  it('rejects commit_document when the active subgraph is removed', () => {
    const document = make_crossing_document();
    const controller = unwrap_controller(create_document_controller(document));
    enter_child(controller);
    const unpacked_document = unwrap_document(unpack_subgraph(controller.document, 'host'));
    const snapshot = JSON.stringify(controller.document);
    const path_snapshot = controller.path.slice();

    const result = controller.commit_document(unpacked_document);
    expect(E.isLeft(result)).toBe(true);
    if (E.isLeft(result)) {
      expect(result.left.type).toBe('path_graph_not_found');
    }
    expect(JSON.stringify(controller.document)).toBe(snapshot);
    expect(controller.path).toEqual(path_snapshot);
    expect(controller.view.graph.id).toBe('child');
  });

  it('roundtrips serialization and always restores from root', () => {
    const controller = unwrap_controller(create_document_controller(make_crossing_document()));
    enter_child(controller);

    const json = controller.serialize({ pretty: true });
    const restored = unwrap_controller(deserialize_document_controller(json));
    expect(restored.path).toEqual(['root']);
    expect(restored.document).toEqual(controller.document);
    expect(Object.keys(restored.view.nodes).sort()).toEqual(['host', 'source']);
    expect(restored.view.boundary_bindings).toEqual({});
  });

  it('keeps controller state unchanged after failed navigation and operations', () => {
    const controller = unwrap_controller(create_document_controller(make_crossing_document()));
    expect(E.isLeft(controller.exit_subgraph())).toBe(true);

    const missing_enter = controller.enter_subgraph('missing');
    expect(E.isLeft(missing_enter)).toBe(true);

    enter_child(controller);
    const document_snapshot = JSON.stringify(controller.document);
    const path_snapshot = controller.path.slice();
    const view_snapshot = JSON.stringify(controller.view);

    const failed_node_remove = controller.remove_node('source');
    expect(E.isLeft(failed_node_remove)).toBe(true);
    if (E.isLeft(failed_node_remove)) {
      expect(failed_node_remove.left.type).toBe('node_not_in_current_graph');
    }

    const failed_binding_remove = controller.remove_binding('external_input');
    expect(E.isLeft(failed_binding_remove)).toBe(true);
    if (E.isLeft(failed_binding_remove)) {
      expect(failed_binding_remove.left.type).toBe('binding_not_in_current_graph');
    }

    const duplicate_node = controller.add_node(make_node('target', 'child', [port('x', 'input')]));
    expect(E.isLeft(duplicate_node)).toBe(true);
    if (E.isLeft(duplicate_node)) {
      expect(duplicate_node.left.type).toBe('duplicate_node_id');
    }

    const duplicate_boundary = controller.add_graph_boundary({
      direction: 'input',
      slot: { id: 'input_0', label: 'Duplicate' },
      mapping: { node_id: 'target', port_id: 'target_in' },
    });
    expect(E.isLeft(duplicate_boundary)).toBe(true);
    if (E.isLeft(duplicate_boundary)) {
      expect(duplicate_boundary.left.type).toBe('boundary_slot_already_exists');
    }

    expect(JSON.stringify(controller.document)).toBe(document_snapshot);
    expect(controller.path).toEqual(path_snapshot);
    expect(JSON.stringify(controller.view)).toBe(view_snapshot);
  });
});
