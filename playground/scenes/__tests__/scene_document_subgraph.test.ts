import { describe, expect, it } from 'vitest';
import * as E from 'fp-ts/Either';
import { validate_graph_document } from '@/core/graph/validation';
import {
  create_document_controller,
  type DocumentController,
  type DocumentGraphView,
} from '@/runtime/document_controller';
import { create_document_subgraph_document } from '../scene_document_subgraph';

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

  it('navigates into host scope with two internal nodes and an internal binding', () => {
    const document = create_document_subgraph_document();
    const controller = unwrap_controller(create_document_controller(document));

    expect(controller.path).toEqual(['root']);
    expect(Object.keys(controller.view.nodes).sort()).toEqual([
      'host_subgraph',
      'preview',
      'source',
    ]);
    expect(controller.view.bindings['source_to_processor']?.target_id).toBe('host_subgraph');
    expect(controller.view.bindings['formatter_to_preview']?.source_id).toBe('host_subgraph');

    const child_view = unwrap_view(controller.enter_subgraph('host_subgraph'));
    expect(child_view.path).toEqual(['root', 'child']);
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
});
