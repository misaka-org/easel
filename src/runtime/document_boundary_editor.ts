import type { GraphNode, Port } from '../core/types';
import type { GraphSlot } from '../core/graph/types';
import type { GraphBoundaryDirection, GraphBoundaryMapping } from '../core/graph/boundary';
import type {
  DocumentController,
  DocumentControllerError,
  DocumentGraphView,
} from './document_controller';
import {
  document_boundary_add_port_id,
  project_document_bridge_view,
  sync_document_controller_to_legacy,
  type DocumentBridgeBinding,
  type DocumentBridgeView,
} from './document_bridge';
import type { Easel } from './easel';
import * as E from 'fp-ts/Either';

export type DocumentBoundaryEditError =
  | { readonly type: 'not_boundary_connection' }
  | { readonly type: 'invalid_rail_direction' }
  | { readonly type: 'real_port_not_found' };

export type DocumentBoundaryEdit =
  | {
      readonly kind: 'add';
      readonly direction: GraphBoundaryDirection;
      readonly slot: GraphSlot;
      readonly mapping: GraphBoundaryMapping;
    }
  | {
      readonly kind: 'remap';
      readonly direction: GraphBoundaryDirection;
      readonly slot_id: string;
      readonly mapping: GraphBoundaryMapping;
    };

export type DocumentBoundaryRemoval = {
  readonly kind: 'remove';
  readonly direction: GraphBoundaryDirection;
  readonly slot_id: string;
};

export type DocumentBoundaryChange = DocumentBoundaryEdit | DocumentBoundaryRemoval;

const is_rail_node = (node: GraphNode, view_only_node_ids: readonly string[]): boolean => {
  if (!view_only_node_ids.includes(node.id)) {
    return false;
  }
  const direction = node.custom_data['boundary_direction'];
  return direction === 'input' || direction === 'output';
};

const get_real_port = (
  node: GraphNode | undefined,
  direction: GraphBoundaryDirection,
  port_id: string,
): Port | undefined => {
  if (node == null) {
    return undefined;
  }
  const ports = direction === 'input' ? node.inputs : node.outputs;
  return ports.find(port => port.id === port_id);
};

const has_existing_slot = (
  view: DocumentBridgeView,
  direction: GraphBoundaryDirection,
  slot_id: string,
): boolean => {
  const slots = direction === 'input' ? view.graph.input_slots : view.graph.output_slots;
  return slots.some(slot => slot.id === slot_id);
};

const make_unique_slot_id = (
  view: DocumentBridgeView,
  direction: GraphBoundaryDirection,
  node_id: string,
  port_id: string,
): string => {
  const base_id = `${direction}_${node_id}_${port_id}`;
  if (!has_existing_slot(view, direction, base_id)) {
    return base_id;
  }
  let counter = 2;
  while (has_existing_slot(view, direction, `${base_id}_${counter}`)) {
    counter += 1;
  }
  return `${base_id}_${counter}`;
};

const make_add_slot = (real_port: Port, slot_id: string): GraphSlot => {
  return {
    id: slot_id,
    label: real_port.label,
    ...(real_port.value_type !== undefined ? { value_type: real_port.value_type } : {}),
    ...(real_port.accepts !== undefined ? { accepts: real_port.accepts } : {}),
    ...(real_port.required !== undefined ? { required: real_port.required } : {}),
  };
};

const find_real_port_endpoint = (
  view: DocumentBridgeView,
  real_node_id: string,
  direction: GraphBoundaryDirection,
  port_id: string,
): E.Either<DocumentBoundaryEditError, Port> => {
  const real_node = view.nodes[real_node_id];
  if (real_node == null || is_rail_node(real_node, view.view_only_node_ids)) {
    return E.left({ type: 'invalid_rail_direction' });
  }
  const real_port = get_real_port(real_node, direction, port_id);
  if (real_port == null) {
    return E.left({ type: 'real_port_not_found' });
  }
  return E.right(real_port);
};

const translate_add_edit = (
  view: DocumentBridgeView,
  direction: GraphBoundaryDirection,
  real_node_id: string,
  real_port_id: string,
): E.Either<DocumentBoundaryEditError, DocumentBoundaryEdit> => {
  return pipe_endpoint(view, direction, real_node_id, real_port_id, real_port => {
    const slot_id = make_unique_slot_id(view, direction, real_node_id, real_port_id);
    return E.right({
      kind: 'add',
      direction,
      slot: make_add_slot(real_port, slot_id),
      mapping: { node_id: real_node_id, port_id: real_port_id },
    });
  });
};

const pipe_endpoint = (
  view: DocumentBridgeView,
  direction: GraphBoundaryDirection,
  real_node_id: string,
  real_port_id: string,
  on_port: (port: Port) => E.Either<DocumentBoundaryEditError, DocumentBoundaryEdit>,
): E.Either<DocumentBoundaryEditError, DocumentBoundaryEdit> => {
  const port_result = find_real_port_endpoint(view, real_node_id, direction, real_port_id);
  if (E.isLeft(port_result)) {
    return port_result;
  }
  return on_port(port_result.right);
};

/**
 * 把 legacy wire binding 转成 DocumentController 边界操作。
 *
 * Input rail 作为 source，Output rail 作为 target；只有触及 view-only rail 且
 * 另一端为当前 scope 真实内部节点的 binding 才属于边界编辑。
 */
export const translate_document_boundary_binding = (
  view: DocumentBridgeView,
  binding: DocumentBridgeBinding,
): E.Either<DocumentBoundaryEditError, DocumentBoundaryEdit> => {
  const source_node = view.nodes[binding.source_id];
  const target_node = view.nodes[binding.target_id];
  if (source_node == null || target_node == null) {
    return E.left({ type: 'not_boundary_connection' });
  }

  const source_rail = is_rail_node(source_node, view.view_only_node_ids);
  const target_rail = is_rail_node(target_node, view.view_only_node_ids);
  if (source_rail && !target_rail) {
    const direction = source_node.custom_data['boundary_direction'];
    if (direction !== 'input') {
      return E.left({ type: 'invalid_rail_direction' });
    }
    if (binding.source_handle === document_boundary_add_port_id) {
      return translate_add_edit(view, 'input', binding.target_id, binding.target_handle);
    }
    if (!has_existing_slot(view, 'input', binding.source_handle)) {
      return E.left({ type: 'not_boundary_connection' });
    }
    const port_result = find_real_port_endpoint(
      view,
      binding.target_id,
      'input',
      binding.target_handle,
    );
    if (E.isLeft(port_result)) {
      return port_result;
    }
    return E.right({
      kind: 'remap',
      direction: 'input',
      slot_id: binding.source_handle,
      mapping: { node_id: binding.target_id, port_id: binding.target_handle },
    });
  }

  if (!source_rail && target_rail) {
    const direction = target_node.custom_data['boundary_direction'];
    if (direction !== 'output') {
      return E.left({ type: 'invalid_rail_direction' });
    }
    if (binding.target_handle === document_boundary_add_port_id) {
      return translate_add_edit(view, 'output', binding.source_id, binding.source_handle);
    }
    if (!has_existing_slot(view, 'output', binding.target_handle)) {
      return E.left({ type: 'not_boundary_connection' });
    }
    const port_result = find_real_port_endpoint(
      view,
      binding.source_id,
      'output',
      binding.source_handle,
    );
    if (E.isLeft(port_result)) {
      return port_result;
    }
    return E.right({
      kind: 'remap',
      direction: 'output',
      slot_id: binding.target_handle,
      mapping: { node_id: binding.source_id, port_id: binding.source_handle },
    });
  }

  return E.left({ type: 'not_boundary_connection' });
};

type BoundarySlotEndpoint = {
  readonly direction: GraphBoundaryDirection;
  readonly slot_id: string;
};

/** 返回 view-only I/O wire 对应的 boundary slot；非边界或 add wire 返回 undefined。 */
const get_boundary_slot_endpoint = (
  view: DocumentBridgeView,
  binding: DocumentBridgeBinding,
): BoundarySlotEndpoint | undefined => {
  const source_node = view.nodes[binding.source_id];
  const target_node = view.nodes[binding.target_id];
  if (source_node == null || target_node == null) {
    return undefined;
  }

  const source_rail = is_rail_node(source_node, view.view_only_node_ids);
  const target_rail = is_rail_node(target_node, view.view_only_node_ids);
  if (source_rail && !target_rail) {
    const direction = source_node.custom_data['boundary_direction'];
    if (direction !== 'input' || binding.source_handle === document_boundary_add_port_id) {
      return undefined;
    }
    return { direction: 'input', slot_id: binding.source_handle };
  }
  if (!source_rail && target_rail) {
    const direction = target_node.custom_data['boundary_direction'];
    if (direction !== 'output' || binding.target_handle === document_boundary_add_port_id) {
      return undefined;
    }
    return { direction: 'output', slot_id: binding.target_handle };
  }

  return undefined;
};

/** 把被 legacy 删除的 view-only binding 还原为 boundary removal。 */
export const translate_document_boundary_removal = (
  view: DocumentBridgeView,
  binding: DocumentBridgeBinding,
): E.Either<DocumentBoundaryEditError, DocumentBoundaryRemoval> => {
  const endpoint = get_boundary_slot_endpoint(view, binding);
  if (endpoint == null) {
    return E.left({ type: 'not_boundary_connection' });
  }
  return E.right({ kind: 'remove', ...endpoint });
};

/**
 * 比较 pointer gesture 前后的 legacy wire 集合。
 *
 * 删除的 view-only binding 如果没有同方向同 slot 的新 binding 替代，就翻译为
 * boundary removal；有替代时保留给新增 binding 的 remap 翻译，避免先删 slot。
 */
export const diff_document_boundary_wire_changes = (
  baseline_view: DocumentBridgeView,
  baseline_bindings: readonly DocumentBridgeBinding[],
  latest_view: DocumentBridgeView,
  latest_bindings: readonly DocumentBridgeBinding[],
): readonly DocumentBoundaryChange[] => {
  const baseline_ids = new Set(baseline_bindings.map(binding => binding.id));
  const latest_ids = new Set(latest_bindings.map(binding => binding.id));
  const changes: DocumentBoundaryChange[] = [];

  for (const binding of baseline_bindings) {
    if (latest_ids.has(binding.id)) {
      continue;
    }
    const removal_result = translate_document_boundary_removal(baseline_view, binding);
    if (E.isLeft(removal_result)) {
      continue;
    }
    const removal = removal_result.right;
    const slot_key = `${removal.direction}:${removal.slot_id}`;
    const has_replacement = latest_bindings.some(candidate => {
      const endpoint = get_boundary_slot_endpoint(latest_view, candidate);
      return endpoint != null && `${endpoint.direction}:${endpoint.slot_id}` === slot_key;
    });
    if (!has_replacement) {
      changes.push(removal);
    }
  }

  for (const binding of latest_bindings) {
    if (baseline_ids.has(binding.id)) {
      continue;
    }
    const edit_result = translate_document_boundary_binding(latest_view, binding);
    if (E.isRight(edit_result)) {
      changes.push(edit_result.right);
    }
  }

  return changes;
};

/**
 * 把已翻译的边界操作 commit 到当前 controller。
 * 不修改 legacy store/wire，bridge 下一轮同步会清理临时投影连线。
 *
 * removal 使用级联删除：拖离 I/O rail 时同步清理父图对 host 端口的引用。
 */
export const commit_document_boundary_edit = (
  controller: DocumentController,
  edit: DocumentBoundaryChange,
): E.Either<DocumentControllerError, DocumentGraphView> => {
  if (edit.kind === 'add') {
    return controller.add_graph_boundary({
      direction: edit.direction,
      slot: edit.slot,
      mapping: edit.mapping,
    });
  }
  if (edit.kind === 'remove') {
    return controller.remove_graph_boundary(edit.direction, edit.slot_id, {
      cascade_host_bindings: true,
    });
  }
  return controller.set_graph_boundary_mapping(edit.direction, edit.slot_id, edit.mapping);
};

/**
 * 无 DOM 入口：翻译并提交一条 legacy I/O binding。
 */
export const commit_document_boundary_binding = (
  controller: DocumentController,
  view: DocumentBridgeView,
  binding: DocumentBridgeBinding,
): E.Either<DocumentControllerError | DocumentBoundaryEditError, DocumentGraphView> => {
  const edit_result = translate_document_boundary_binding(view, binding);
  if (E.isLeft(edit_result)) {
    return edit_result;
  }
  return commit_document_boundary_edit(controller, edit_result.right);
};

type DocumentBoundaryGestureBaseline = {
  readonly scope_key: string;
  readonly view: DocumentBridgeView;
  readonly bindings: readonly DocumentBridgeBinding[];
};

const make_scope_key = (view: DocumentBridgeView): string => {
  return `${view.path.join('::')}::${view.graph.id}`;
};

const snapshot_gesture_baseline = (
  easel: Easel,
  controller: DocumentController,
): DocumentBoundaryGestureBaseline | undefined => {
  const wire = easel.plugin_data.wire;
  if (wire == null) {
    return undefined;
  }
  const view = project_document_bridge_view(controller.view);
  return {
    scope_key: make_scope_key(view),
    view,
    bindings: wire.get_bindings().slice(),
  };
};

/**
 * 挂载到 pointer gesture 前后处理 boundary wire。
 *
 * wire capture pointerdown 会先删掉被拖动的 legacy wire，所以不能在 app_events
 * pointerdown 记录基线；这里用 window capture 在更早阶段保存 wire/scope 快照。
 * pointerup 后再等 legacy wire_tool 完成新增，最后 diff 基线并 commit。
 */
export const mount_document_boundary_editor = (
  easel: Easel,
  controller: DocumentController,
): (() => void) => {
  const target_window = easel.container.ownerDocument.defaultView;
  if (target_window == null) {
    return () => undefined;
  }

  let baseline: DocumentBoundaryGestureBaseline | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const handle_capture_pointer_down = (): void => {
    if (timeout != null) {
      clearTimeout(timeout);
      timeout = undefined;
    }
    baseline = snapshot_gesture_baseline(easel, controller);
  };

  const handle_pointer_up = (): void => {
    const current_baseline = baseline ?? snapshot_gesture_baseline(easel, controller);
    if (current_baseline == null) {
      return;
    }
    if (timeout != null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      timeout = undefined;
      const latest_wire = easel.plugin_data.wire;
      if (latest_wire == null) {
        baseline = undefined;
        return;
      }

      const latest_view = project_document_bridge_view(controller.view);
      if (make_scope_key(latest_view) !== current_baseline.scope_key) {
        baseline = {
          scope_key: make_scope_key(latest_view),
          view: latest_view,
          bindings: latest_wire.get_bindings().slice(),
        };
        return;
      }

      const latest_bindings = latest_wire.get_bindings().slice();
      const changes = diff_document_boundary_wire_changes(
        current_baseline.view,
        current_baseline.bindings,
        latest_view,
        latest_bindings,
      );
      for (const change of changes) {
        const commit_result = commit_document_boundary_edit(controller, change);
        if (E.isLeft(commit_result)) {
          // commit 失败时 legacy wire 可能已删除但 controller 仍映射，立即恢复一致性。
          sync_document_controller_to_legacy(easel, controller);
          baseline = snapshot_gesture_baseline(easel, controller);
          return;
        }
      }
      baseline = snapshot_gesture_baseline(easel, controller);
    }, 0);
  };

  target_window.addEventListener('pointerdown', handle_capture_pointer_down, true);
  easel.app_events.on('pointerup', handle_pointer_up);
  return () => {
    if (timeout != null) {
      clearTimeout(timeout);
      timeout = undefined;
    }
    target_window.removeEventListener('pointerdown', handle_capture_pointer_down, true);
    easel.app_events.off('pointerup', handle_pointer_up);
  };
};
