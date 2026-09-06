import { effect, enableTracking, pauseTracking, stop as stop_effect } from '@vue/reactivity';
import type { GraphNode } from '../core/types';
import type {
  BindingId,
  GraphBindingRecord,
  GraphId,
  GraphNodeRecord,
  GraphScope,
  NodeId,
} from '../core/graph/types';
import type { Easel } from './easel';
import type { DocumentController, DocumentGraphView } from './document_controller';

/** Legacy wire binding projected from current-scope graph bindings. */
export type DocumentBridgeBinding = {
  readonly id: BindingId;
  readonly source_id: NodeId;
  readonly source_handle: string;
  readonly target_id: NodeId;
  readonly target_handle: string;
};

/** Current-scope projection consumed by the legacy Easel Store and wire plugin. */
export type DocumentBridgeView = {
  readonly path: readonly GraphId[];
  readonly graph: GraphScope;
  readonly nodes: Readonly<Record<NodeId, GraphNode>>;
  readonly bindings: Readonly<Record<BindingId, DocumentBridgeBinding>>;
};

/** 去掉 GraphNodeRecord 的 graph-only 字段，得到旧 Easel 可消费的 GraphNode。 */
const project_node = (record: GraphNodeRecord): GraphNode => {
  return {
    id: record.id,
    type: record.type,
    position: record.position,
    size: record.size,
    title: record.title,
    inputs: record.inputs,
    outputs: record.outputs,
    widgets: record.widgets,
    style_mode: record.style_mode,
    resizable: record.resizable,
    collapsed: record.collapsed,
    custom_data: record.custom_data,
  };
};

/** 去掉 GraphBindingRecord 的 graph-only 字段，得到 DataFlowBinding 兼容形状。 */
const project_binding = (record: GraphBindingRecord): DocumentBridgeBinding => {
  return {
    id: record.id,
    source_id: record.source_id,
    source_handle: record.source_handle,
    target_id: record.target_id,
    target_handle: record.target_handle,
  };
};

/**
 * 把 DocumentGraphView 投影成当前 scope 的 legacy view。
 *
 * 这是纯投影：只复制当前 graph 的节点与 binding，不处理 boundary stub，
 * 也不修改传入 view。
 */
export const project_document_bridge_view = (view: DocumentGraphView): DocumentBridgeView => {
  const nodes: Record<NodeId, GraphNode> = {};
  const bindings: Record<BindingId, DocumentBridgeBinding> = {};

  for (const [node_id, node] of Object.entries(view.nodes)) {
    nodes[node_id] = project_node(node);
  }
  for (const [binding_id, binding] of Object.entries(view.bindings)) {
    bindings[binding_id] = project_binding(binding);
  }

  return {
    path: view.path.slice(),
    graph: view.graph,
    nodes,
    bindings,
  };
};

/**
 * 把 controller 的当前 scope 一次性同步到 legacy Easel。
 *
 * 同步方向仅为 GraphDocument -> legacy Store/wire。旧 Easel 的任何后续编辑
 * 都不会反向写回 controller，本函数不迁移编辑或数据所有权。
 */
export const sync_document_controller_to_legacy = (
  easel: Easel,
  controller: DocumentController,
): void => {
  const view = project_document_bridge_view(controller.view);
  const wire = easel.plugin_data.wire;
  if (wire == null) {
    throw new Error('document bridge requires the @easel/wire plugin.');
  }

  easel.store.transact(() => {
    for (const binding of wire.get_bindings()) {
      wire.remove_binding(binding.id);
    }
    for (const node_id of easel.store.nodes.keys()) {
      easel.store.nodes.delete(node_id);
    }
    for (const [node_id, node] of Object.entries(view.nodes)) {
      easel.store.nodes.put(node_id, node);
    }
    for (const binding of Object.values(view.bindings)) {
      wire.add_binding(binding);
    }
  });
};

/** 在 effect 运行期间暂停 legacy store 的响应式追踪。 */
const run_without_tracking = <T>(fn: () => T): T => {
  pauseTracking();
  try {
    return fn();
  } finally {
    enableTracking();
  }
};

/**
 * 挂载 DocumentController 到旧 Easel 的响应式 bridge。
 *
 * 只追踪 controller 的 session_ref；同步过程读取和写入 legacy Store/wire 时
 * 暂停追踪，避免旧 Easel 编辑反过来触发本 bridge。返回的 stop 用于卸载。
 */
export const mount_document_bridge = (
  easel: Easel,
  controller: DocumentController,
): (() => void) => {
  const runner = effect(() => {
    const _session = controller.session;
    run_without_tracking(() => {
      sync_document_controller_to_legacy(easel, controller);
    });
    void _session;
  });

  return () => stop_effect(runner);
};
