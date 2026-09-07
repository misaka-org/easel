import * as E from 'fp-ts/Either';
import { effect, stop as stop_effect } from '@vue/reactivity';
import type { GraphDocument, GraphNodeRecord, NodeId } from '@/core/graph/types';
import type { GraphDocumentError } from '@/core/graph/document';
import { add_binding, add_node, create_empty_graph_document } from '@/core/graph/document';
import { pack_nodes } from '@/core/graph/subgraph';
import { vec2_create } from '@/core/math';
import type { GraphNode, Port } from '@/core/types';
import type { Easel } from '@/runtime/easel';
import { create_document_controller, type DocumentController } from '@/runtime/document_controller';
import { mount_document_bridge } from '@/runtime/document_bridge';
import { mount_document_boundary_editor } from '@/runtime/document_boundary_editor';
import { on_locale_change, translate } from '../i18n';

/** Handle returned by the playground document subgraph scene. */
export type DocumentSubgraphSceneHandle = {
  readonly controller: DocumentController;
  readonly stop: () => void;
};

export type DocumentSubgraphSceneOptions = {
  readonly document?: GraphDocument;
  readonly auto_enter?: NodeId | null;
};

export type DocumentSubgraphSceneSetup = {
  readonly document: GraphDocument;
  readonly auto_enter_node_id: NodeId | null;
};

export const default_document_subgraph_host_id: NodeId = 'host_subgraph';

/** Resolve default fixture behavior without coupling it to imported documents. */
export const resolve_document_subgraph_scene_options = (
  options: DocumentSubgraphSceneOptions = {},
): DocumentSubgraphSceneSetup => {
  if (options.document != null) {
    return {
      document: options.document,
      auto_enter_node_id: options.auto_enter ?? null,
    };
  }
  return {
    document: create_document_subgraph_document(),
    auto_enter_node_id: options.auto_enter ?? default_document_subgraph_host_id,
  };
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
    60,
    180,
  );
  const processor = make_node(
    'processor',
    'Processor',
    [make_port('prompt', 'input', 'text'), make_port('config', 'input', 'text')],
    [make_port('result', 'output', 'text'), make_port('debug', 'output', 'text')],
    420,
    180,
  );
  const formatter = make_node(
    'formatter',
    'Formatter',
    [make_port('result', 'input', 'text'), make_port('theme', 'input', 'text')],
    [make_port('content', 'output', 'text'), make_port('report', 'output', 'text')],
    680,
    180,
  );
  const preview = make_node(
    'preview',
    'Preview',
    [make_port('content', 'input', 'text')],
    [],
    1020,
    180,
  );

  let document = make_document_node(create_empty_graph_document(), source);
  document = make_document_node(document, processor);
  document = make_document_node(document, formatter);
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
    'processor_to_formatter',
    'processor',
    'result',
    'formatter',
    'result',
  );
  document = make_document_binding(
    document,
    'formatter_to_preview',
    'formatter',
    'content',
    'preview',
    'content',
  );

  return unwrap_document(
    pack_nodes(document, {
      source_graph_id: 'root',
      node_ids: ['formatter', 'processor'],
      graph_id: 'child',
      host_node_id: 'host_subgraph',
      host_type: 'document_subgraph',
      host_title: 'Child Scope',
      position: vec2_create(520, 180),
      size: vec2_create(240, 110),
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

const get_selected_host_id = (easel: Easel, controller: DocumentController): NodeId | undefined => {
  return easel.state.value.selected_node_ids.find(id => {
    return controller.view.nodes[id]?.nested_graph_id != null;
  });
};

const enter_selected_host = (easel: Easel, controller: DocumentController): void => {
  const selected_host_id = get_selected_host_id(easel, controller);
  if (selected_host_id != null) {
    controller.enter_subgraph(selected_host_id);
  }
};

/**
 * Mounts scope UI that is cleaned up when the scene stops.
 * UI only reads controller path/state and never writes GraphDocument.
 */
const mount_document_scope_ui = (easel: Easel, controller: DocumentController): (() => void) => {
  const root_node = easel.container.getRootNode();
  const style_el = document.createElement('style');
  style_el.textContent = `
    .easel-document-scope-ui {
      position: absolute;
      top: 12px;
      left: 12px;
      z-index: 900;
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-width: min(360px, calc(100% - 24px));
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid var(--node-border);
      background: var(--node-bg);
      color: var(--text-color);
      font-family: sans-serif;
      font-size: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      user-select: none;
    }
    .easel-document-scope-path {
      font-weight: 600;
      line-height: 18px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .easel-document-scope-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 26px;
    }
    .easel-document-scope-exit {
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--text-muted);
      background: var(--primary-color);
      color: var(--canvas-bg);
      padding: 4px 10px;
      border-radius: 6px;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .easel-document-scope-hint {
      color: var(--text-muted);
      line-height: 18px;
    }
  `;
  if (root_node instanceof ShadowRoot || root_node instanceof Document) {
    root_node.appendChild(style_el);
  }

  const panel = document.createElement('div');
  panel.className = 'easel-document-scope-ui';
  const path_el = document.createElement('div');
  path_el.className = 'easel-document-scope-path';
  const row = document.createElement('div');
  row.className = 'easel-document-scope-row';
  const exit_button = document.createElement('button');
  exit_button.className = 'easel-document-scope-exit';
  exit_button.textContent = translate('overlay_scope_exit_up');
  exit_button.style.display = 'none';
  exit_button.type = 'button';
  const hint_el = document.createElement('div');
  hint_el.className = 'easel-document-scope-hint';
  row.appendChild(exit_button);
  panel.appendChild(path_el);
  panel.appendChild(row);
  panel.appendChild(hint_el);
  easel.container.appendChild(panel);

  const stop_panel_drag = (e: PointerEvent): void => {
    e.stopPropagation();
  };
  panel.addEventListener('pointerdown', stop_panel_drag);

  const update_scope_ui = (): void => {
    exit_button.textContent = translate('overlay_scope_exit_up');
    const path = controller.path;
    path_el.textContent = path.join(' > ');
    const selected_host_id = get_selected_host_id(easel, controller);
    if (path.length > 1) {
      exit_button.style.display = 'inline-flex';
      hint_el.textContent = translate('overlay_scope_child_hint');
    } else {
      exit_button.style.display = 'none';
      hint_el.textContent =
        selected_host_id == null
          ? translate('overlay_scope_root_hint')
          : translate('overlay_scope_root_selected_hint', { host_id: selected_host_id });
    }
  };
  const ui_effect = effect(() => {
    void controller.session;
    void easel.state.value;
    update_scope_ui();
  });
  const stop_locale_listener = on_locale_change(update_scope_ui);

  exit_button.addEventListener('click', () => {
    controller.exit_subgraph();
  });

  const handle_keydown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target != null && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
      return;
    }
    if (e.key === 'Escape' && controller.path.length > 1) {
      controller.exit_subgraph();
    } else if (e.key === 'Enter' && controller.path.length === 1) {
      enter_selected_host(easel, controller);
    }
  };
  easel.app_events.on('keydown', handle_keydown);

  return () => {
    stop_effect(ui_effect);
    stop_locale_listener();
    easel.app_events.off('keydown', handle_keydown);
    panel.removeEventListener('pointerdown', stop_panel_drag);
    panel.remove();
    style_el.remove();
  };
};

/** Create a document scene controller from an optional GraphDocument. */
export const create_document_subgraph_controller = (
  options: DocumentSubgraphSceneOptions = {},
): DocumentController => {
  const setup = resolve_document_subgraph_scene_options(options);
  const controller_result = create_document_controller(setup.document);
  if (E.isLeft(controller_result)) {
    throw new Error(`document controller creation failed: ${String(controller_result.left)}`);
  }
  const controller = controller_result.right;
  if (setup.auto_enter_node_id != null) {
    const host_node = controller.view.nodes[setup.auto_enter_node_id];
    if (host_node?.nested_graph_id == null) {
      throw new Error(
        `document scene auto_enter target '${setup.auto_enter_node_id}' is not a host node.`,
      );
    }
    const enter_result = controller.enter_subgraph(setup.auto_enter_node_id);
    if (E.isLeft(enter_result)) {
      throw new Error(`document scene enter failed: ${String(enter_result.left)}`);
    }
  }
  return controller;
};

/** Create the default playground fixture controller with host_subgraph entered. */
export const create_entered_document_subgraph_controller = (): DocumentController => {
  return create_document_subgraph_controller();
};

/** Load the document scene into legacy Easel and return its cleanup handle. */
export const load_document_subgraph_scene = (
  easel: Easel,
  options: DocumentSubgraphSceneOptions = {},
): DocumentSubgraphSceneHandle => {
  const controller = create_document_subgraph_controller(options);
  const stop_bridge = mount_document_bridge(easel, controller);
  const stop_boundary_editor = mount_document_boundary_editor(easel, controller);
  const stop_scope_ui = mount_document_scope_ui(easel, controller);
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
    stop_scope_ui();
    stop_boundary_editor();
    stop_bridge();
  };

  return { controller, stop };
};
