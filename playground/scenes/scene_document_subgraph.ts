import * as E from 'fp-ts/Either';
import type { GraphDocument, GraphNodeRecord, NodeId } from '@/core/graph/types';
import type { GraphDocumentError } from '@/core/graph/document';
import { add_binding, add_node, create_empty_graph_document } from '@/core/graph/document';
import { pack_nodes } from '@/core/graph/subgraph';
import { vec2_create } from '@/core/math';
import type { GraphNode, Port } from '@/core/types';
import type { Easel } from '@/runtime/easel';
import { create_document_controller, type DocumentController } from '@/runtime/document_controller';
import { mount_document_bridge } from '@/runtime/document_bridge';

/** Handle returned by the playground document subgraph scene. */
export type DocumentSubgraphSceneHandle = {
  readonly controller: DocumentController;
  readonly stop: () => void;
};

const unwrap_document = <T>(result: E.Either<GraphDocumentError, T>): T => {
  if (E.isLeft(result)) {
    throw new Error(`document scene construction failed: ${String(result.left)}`);
  }
  return result.right;
};

const make_port = (id: string, kind: 'input' | 'output', value_type: string): Port => {
  return { id, label: id, type: kind, value_type };
};

const make_node = (
  id: string,
  title: string,
  inputs: readonly Port[],
  outputs: readonly Port[],
  x: number,
  y: number,
): GraphNode => {
  return {
    id,
    type: 'default',
    position: vec2_create(x, y),
    size: vec2_create(200, 100),
    title,
    inputs,
    outputs,
    custom_data: {},
  };
};

const make_document_node = (document: GraphDocument, node: GraphNode): GraphDocument => {
  return unwrap_document(add_node(document, 'root', node));
};

const make_document_binding = (
  document: GraphDocument,
  id: string,
  source_id: string,
  source_handle: string,
  target_id: string,
  target_handle: string,
): GraphDocument => {
  return unwrap_document(
    add_binding(document, {
      id,
      graph_id: 'root',
      source_id,
      source_handle,
      target_id,
      target_handle,
    }),
  );
};

/**
 * Build a compact GraphDocument for visually checking GraphDocument scope
 * navigation through the legacy playground bridge.
 */
export const create_document_subgraph_document = (): GraphDocument => {
  const source = make_node(
    'source',
    'Input Source',
    [],
    [make_port('prompt', 'output', 'text')],
    80,
    180,
  );
  const processor = make_node(
    'processor',
    'Processor',
    [make_port('prompt', 'input', 'text')],
    [make_port('result', 'output', 'text')],
    380,
    160,
  );
  const preview = make_node(
    'preview',
    'Preview',
    [make_port('content', 'input', 'text')],
    [],
    780,
    160,
  );

  let document = make_document_node(create_empty_graph_document(), source);
  document = make_document_node(document, processor);
  document = make_document_node(document, preview);
  document = make_document_binding(
    document,
    'source_to_processor',
    'source',
    'prompt',
    'processor',
    'prompt',
  );
  document = make_document_binding(
    document,
    'processor_to_preview',
    'processor',
    'result',
    'preview',
    'content',
  );

  return unwrap_document(
    pack_nodes(document, {
      source_graph_id: 'root',
      node_ids: ['processor'],
      graph_id: 'child',
      host_node_id: 'host_subgraph',
      host_type: 'document_subgraph',
      host_title: 'Child Scope',
      position: vec2_create(380, 160),
      size: vec2_create(220, 110),
    }),
  );
};

const enter_host_from_dblclick = (controller: DocumentController, node_id: NodeId): void => {
  const node: GraphNodeRecord | undefined = controller.view.nodes[node_id];
  if (node?.nested_graph_id == null) {
    return;
  }
  controller.enter_subgraph(node_id);
};

/** Load the document scene into legacy Easel and return its cleanup handle. */
export const load_document_subgraph_scene = (easel: Easel): DocumentSubgraphSceneHandle => {
  const controller_result = create_document_controller(create_document_subgraph_document());
  if (E.isLeft(controller_result)) {
    throw new Error(`document controller creation failed: ${String(controller_result.left)}`);
  }
  const controller = controller_result.right;
  const stop_bridge = mount_document_bridge(easel, controller);
  const handle_dblclick = (payload: {
    readonly node_id: NodeId;
    readonly target: HTMLElement;
  }): void => {
    void payload.target;
    enter_host_from_dblclick(controller, payload.node_id);
  };

  easel.app_events.on('node_dblclick', handle_dblclick);

  let stopped = false;
  const stop = (): void => {
    if (stopped) {
      return;
    }
    stopped = true;
    easel.app_events.off('node_dblclick', handle_dblclick);
    stop_bridge();
  };

  return { controller, stop };
};
