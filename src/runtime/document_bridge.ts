import { effect, enableTracking, pauseTracking, stop as stop_effect } from '@vue/reactivity';
import type { GraphNode, Port } from '../core/types';
import type {
  BindingId,
  GraphBindingRecord,
  GraphId,
  GraphNodeRecord,
  GraphScope,
  GraphSlot,
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
  /** 合成边界代理的只读标记，便于 UI/调试区分真实 document node。 */
  readonly view_only_node_ids: readonly NodeId[];
  /** 合成边界 mapping 连线的只读标记，便于 UI/调试区分真实 document binding。 */
  readonly view_only_binding_ids: readonly BindingId[];
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

const view_only_node_prefix = 'document_view_only_boundary:';
const view_only_binding_prefix = 'document_view_only_binding:';
const proxy_width = 180;
const proxy_gap = 56;
const proxy_default_top = 180;

type BoundaryProxyDirection = 'input' | 'output';
type ProxyPosition = { readonly x: number; readonly y: number };
type ProxyPositions = {
  readonly input: ProxyPosition;
  readonly output: ProxyPosition;
};

/** 在冲突时追加序号，避免投影 ID 与 document 当前 scope 的真实 ID 相同。 */
const make_unique_id = (base_id: string, used_ids: ReadonlySet<string>): string => {
  if (!used_ids.has(base_id)) {
    return base_id;
  }
  let counter = 1;
  while (used_ids.has(`${base_id}:${counter}`)) {
    counter += 1;
  }
  return `${base_id}:${counter}`;
};

/** 把 GraphSlot 转成边界代理上的 legacy Port；边界代理只保留对应方向端口。 */
const slot_to_proxy_port = (slot: GraphSlot, type: 'input' | 'output'): Port => {
  return {
    id: slot.id,
    label: slot.label,
    type,
    ...(slot.value_type !== undefined ? { value_type: slot.value_type } : {}),
    ...(slot.accepts !== undefined ? { accepts: slot.accepts } : {}),
    ...(slot.required !== undefined ? { required: slot.required } : {}),
  };
};

/** 估算 boundary node 的高度，使 wire 渲染端口间距与默认 node 布局接近。 */
const estimate_proxy_height = (slot_count: number): number => {
  return Math.max(80, 48 + slot_count * 16);
};

/** 为两个 view-only boundary node 计算 legacy 画布坐标，不修改 core。 */
const layout_proxy_positions = (
  view_nodes: Readonly<Record<NodeId, GraphNodeRecord>>,
  proxy_height: number,
): ProxyPositions => {
  const actual_nodes = Object.values(view_nodes);
  if (actual_nodes.length === 0) {
    const input: ProxyPosition = { x: 80, y: Math.max(80, proxy_default_top - proxy_height / 2) };
    const output: ProxyPosition = { x: input.x + proxy_width + proxy_gap * 2, y: input.y };
    return { input, output };
  }

  let min_x = Infinity;
  let min_y = Infinity;
  let max_x = -Infinity;
  let max_y = -Infinity;
  for (const node of actual_nodes) {
    min_x = Math.min(min_x, node.position.x);
    min_y = Math.min(min_y, node.position.y);
    max_x = Math.max(max_x, node.position.x + node.size.x);
    max_y = Math.max(max_y, node.position.y + node.size.y);
  }

  const center_y = (min_y + max_y) / 2 - proxy_height / 2;
  return {
    input: { x: min_x - proxy_gap - proxy_width, y: center_y },
    output: { x: max_x + proxy_gap, y: center_y },
  };
};

/**
 * 创建 view-only boundary proxy。
 *
 * 这不是 boundary stub node，也不属于 GraphDocument；它只是 legacy view 层
 * 用来在编辑 subgraph 时展示 scope 输入/输出端口的合成节点。
 */
const create_boundary_proxy_node = (
  node_id: NodeId,
  direction: BoundaryProxyDirection,
  graph_title: string,
  slots: readonly GraphSlot[],
  position: ProxyPosition,
  proxy_height: number,
): GraphNode => {
  const node_type = direction === 'input' ? 'document_boundary_input' : 'document_boundary_output';
  const ports = slots.map(slot => {
    return slot_to_proxy_port(slot, direction === 'input' ? 'output' : 'input');
  });
  return {
    id: node_id,
    type: node_type,
    position,
    size: { x: proxy_width, y: proxy_height },
    title: `${graph_title} ${direction === 'input' ? 'Input' : 'Output'}`,
    inputs: direction === 'input' ? [] : ports,
    outputs: direction === 'input' ? ports : [],
    custom_data: {},
  };
};

/**
 * 把 DocumentGraphView 投影成当前 scope 的 legacy view。
 *
 * 这是纯投影：复制当前 graph 的真实节点与 binding，并在 graph 有
 * input/output slots 时合成 view-only boundary proxy 与 mapping 连线。
 * 合成内容不写回 GraphDocument，也不修改传入 view。
 */
export const project_document_bridge_view = (view: DocumentGraphView): DocumentBridgeView => {
  const nodes: Record<NodeId, GraphNode> = {};
  const bindings: Record<BindingId, DocumentBridgeBinding> = {};
  const view_only_node_ids: NodeId[] = [];
  const view_only_binding_ids: BindingId[] = [];

  for (const [node_id, node] of Object.entries(view.nodes)) {
    nodes[node_id] = project_node(node);
  }
  for (const [binding_id, binding] of Object.entries(view.bindings)) {
    bindings[binding_id] = project_binding(binding);
  }

  const input_slots = view.graph.input_slots;
  const output_slots = view.graph.output_slots;
  const has_slots = input_slots.length > 0 || output_slots.length > 0;
  if (!has_slots) {
    return {
      path: view.path.slice(),
      graph: view.graph,
      nodes,
      bindings,
      view_only_node_ids,
      view_only_binding_ids,
    };
  }

  const proxy_height = estimate_proxy_height(Math.max(input_slots.length, output_slots.length));
  const proxy_positions = layout_proxy_positions(view.nodes, proxy_height);
  const used_ids = new Set<string>([...Object.keys(nodes), ...Object.keys(bindings)]);

  let input_node_id: NodeId | undefined;
  let output_node_id: NodeId | undefined;
  if (input_slots.length > 0) {
    input_node_id = make_unique_id(`${view_only_node_prefix}${view.graph.id}:input`, used_ids);
    nodes[input_node_id] = create_boundary_proxy_node(
      input_node_id,
      'input',
      view.graph.title,
      input_slots,
      proxy_positions.input,
      proxy_height,
    );
    used_ids.add(input_node_id);
    view_only_node_ids.push(input_node_id);
  }
  if (output_slots.length > 0) {
    output_node_id = make_unique_id(`${view_only_node_prefix}${view.graph.id}:output`, used_ids);
    nodes[output_node_id] = create_boundary_proxy_node(
      output_node_id,
      'output',
      view.graph.title,
      output_slots,
      proxy_positions.output,
      proxy_height,
    );
    used_ids.add(output_node_id);
    view_only_node_ids.push(output_node_id);
  }

  const input_proxy_node = input_node_id == null ? undefined : nodes[input_node_id];
  const output_proxy_node = output_node_id == null ? undefined : nodes[output_node_id];
  for (const boundary of Object.values(view.boundary_bindings)) {
    if (boundary.graph_id !== view.graph.id) {
      continue;
    }

    const direction = boundary.direction;
    const direction_slots = direction === 'input' ? input_slots : output_slots;
    const proxy_node = direction === 'input' ? input_proxy_node : output_proxy_node;
    const internal_node = view.nodes[boundary.node_id];
    const slot_exists = direction_slots.some(slot => slot.id === boundary.slot_id);
    if (proxy_node == null || internal_node == null || !slot_exists) {
      continue;
    }

    if (direction === 'input') {
      const source_port_exists = proxy_node.outputs.some(port => port.id === boundary.slot_id);
      const target_port_exists = internal_node.inputs.some(port => port.id === boundary.port_id);
      if (!source_port_exists || !target_port_exists) {
        continue;
      }
    } else {
      const source_port_exists = internal_node.outputs.some(port => port.id === boundary.port_id);
      const target_port_exists = proxy_node.inputs.some(port => port.id === boundary.slot_id);
      if (!source_port_exists || !target_port_exists) {
        continue;
      }
    }

    const binding_id = make_unique_id(
      `${view_only_binding_prefix}${view.graph.id}:${direction}:${boundary.slot_id}`,
      used_ids,
    );
    const projected_binding: DocumentBridgeBinding =
      direction === 'input'
        ? {
            id: binding_id,
            source_id: proxy_node.id,
            source_handle: boundary.slot_id,
            target_id: internal_node.id,
            target_handle: boundary.port_id,
          }
        : {
            id: binding_id,
            source_id: internal_node.id,
            source_handle: boundary.port_id,
            target_id: proxy_node.id,
            target_handle: boundary.slot_id,
          };
    bindings[binding_id] = projected_binding;
    used_ids.add(binding_id);
    view_only_binding_ids.push(binding_id);
  }

  return {
    path: view.path.slice(),
    graph: view.graph,
    nodes,
    bindings,
    view_only_node_ids,
    view_only_binding_ids,
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
