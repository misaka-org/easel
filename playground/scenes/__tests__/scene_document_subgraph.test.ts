import { describe, expect, it } from 'vitest';
import * as E from 'fp-ts/Either';
import type { GraphDocument, GraphNodeRecord } from '@/core/graph/types';
import { add_graph, add_node, create_empty_graph_document } from '@/core/graph/document';
import { validate_graph_document } from '@/core/graph/validation';
import {
  create_document_controller,
  type DocumentController,
  type DocumentGraphView,
} from '@/runtime/document_controller';
import { project_document_bridge_view } from '@/runtime/document_bridge';
import {
  create_document_subgraph_controller,
  create_document_subgraph_document,
  create_entered_document_subgraph_controller,
} from '../scene_document_subgraph';

const unwrap_controller = (result: E.Either<unknown, DocumentController>): DocumentController => {
  if (E.isLeft(result)) {
    throw new Error(`unexpected controller error: ${String(result.left)}`);
  }
  return result.right;
};

const unwrap_view = (result: E.Either<unknown, DocumentGraphView>): DocumentGraphView => {
  if (E.isLeft(result)) {
    throw new Error(`unexpected controller operation error: ${String(result.left)}`);
  }
  return result.right;
};

const unwrap_document = (result: E.Either<unknown, GraphDocument>): GraphDocument => {
  if (E.isLeft(result)) {
    throw new Error(`unexpected document error: ${String(result.left)}`);
  }
  return result.right;
};

describe('document subgraph scene', () => {
  it('builds a valid document with root input, host, and preview nodes', () => {
    const document = create_document_subgraph_document();
    expect(E.isRight(validate_graph_document(document))).toBe(true);

    const root_ids = Object.values(document.nodes)
      .filter(node => node.graph_id === 'root')
      .map(node => node.id)
      .sort();
    const child_ids = Object.values(document.nodes)
      .filter(node => node.graph_id === 'child')
      .map(node => node.id)
      .sort();

    expect(root_ids).toEqual(['host_subgraph', 'preview', 'source']);
    expect(child_ids).toEqual(['formatter', 'processor']);

    const host = document.nodes['host_subgraph'];
    expect(host?.type).toBe('document_subgraph');
    expect(host?.nested_graph_id).toBe('child');
    expect(Object.keys(document.boundary_bindings)).toHaveLength(2);
  });

  it('enters host scope before load with two internal nodes and an internal binding', () => {
    const controller = create_entered_document_subgraph_controller();

    expect(controller.path).toEqual(['root', 'child']);
    const child_view = controller.view;
    expect(Object.keys(child_view.nodes).sort()).toEqual(['formatter', 'processor']);
    expect(Object.keys(child_view.bindings)).toEqual(['processor_to_formatter']);
    expect(child_view.bindings['processor_to_formatter']?.source_id).toBe('processor');
    expect(child_view.bindings['processor_to_formatter']?.target_id).toBe('formatter');
    expect(Object.keys(child_view.boundary_bindings).sort()).toEqual([
      'child:input:0',
      'child:output:0',
    ]);
    expect(child_view.boundary_bindings['child:input:0']?.node_id).toBe('processor');
    expect(child_view.boundary_bindings['child:output:0']?.node_id).toBe('formatter');

    const exited_view = unwrap_view(controller.exit_subgraph());
    expect(exited_view.path).toEqual(['root']);
    expect(Object.keys(exited_view.nodes).sort()).toEqual(['host_subgraph', 'preview', 'source']);
    expect(controller.path).toEqual(['root']);
  });

  it('projects an empty child scope with visible boundary rails and add ports', () => {
    let document = unwrap_document(
      add_graph(create_empty_graph_document(), {
        id: 'empty_child',
        kind: 'subgraph',
        parent_graph_id: 'root',
        title: 'Empty Child',
        input_slots: [],
        output_slots: [],
      }),
    );
    const host: GraphNodeRecord = {
      id: 'empty_host',
      graph_id: 'root',
      type: 'document_subgraph',
      nested_graph_id: 'empty_child',
      position: { x: 100, y: 100 },
      size: { x: 200, y: 80 },
      title: 'Empty Host',
      inputs: [],
      outputs: [],
      custom_data: {},
    };
    document = unwrap_document(add_node(document, host));

    const controller = unwrap_controller(create_document_controller(document));
    unwrap_view(controller.enter_subgraph('empty_host'));
    const projected = project_document_bridge_view(controller.view);

    expect(Object.keys(projected.nodes)).toEqual(projected.view_only_node_ids);
    expect(projected.view_only_node_ids).toHaveLength(2);
    expect(Object.values(projected.nodes).some(node => node.type === 'subgraph_input')).toBe(true);
    expect(Object.values(projected.nodes).some(node => node.type === 'subgraph_output')).toBe(true);
    expect(
      Object.values(projected.nodes).every(node => {
        const ports = node.type === 'subgraph_input' ? node.outputs : node.inputs;
        return ports.some(port => port.id === '__easel_boundary_add__');
      }),
    ).toBe(true);
  });

  it('starts an explicit document at root by default', () => {
    const document = create_document_subgraph_document();
    const controller = create_document_subgraph_controller({ document });

    expect(controller.path).toEqual(['root']);
    expect(controller.document).toBe(document);
    expect(controller.view.nodes['host_subgraph']?.nested_graph_id).toBe('child');
  });

  it('enters an arbitrary host from root when auto_enter is supplied', () => {
    let document = unwrap_document(
      add_graph(create_empty_graph_document(), {
        id: 'custom_child',
        kind: 'subgraph',
        parent_graph_id: 'root',
        title: 'Custom Child',
        input_slots: [],
        output_slots: [],
      }),
    );
    const host: GraphNodeRecord = {
      id: 'custom_host',
      graph_id: 'root',
      type: 'document_subgraph',
      nested_graph_id: 'custom_child',
      position: { x: 100, y: 100 },
      size: { x: 200, y: 80 },
      title: 'Custom Host',
      inputs: [],
      outputs: [],
      custom_data: {},
    };
    document = unwrap_document(add_node(document, host));

    const controller = create_document_subgraph_controller({
      document,
      auto_enter: 'custom_host',
    });

    expect(controller.path).toEqual(['root', 'custom_child']);
    expect(controller.view.nodes['custom_host']).toBeUndefined();
    expect(Object.keys(controller.view.nodes)).toEqual([]);
  });
});
