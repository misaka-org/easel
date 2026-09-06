import type { Port } from '../types';
import type {
  BindingId,
  BoundaryId,
  GraphBoundaryBinding,
  GraphBindingRecord,
  GraphDocument,
  GraphId,
  GraphNodeRecord,
  GraphScope,
  GraphSlot,
  NodeId,
} from './types';
import * as E from 'fp-ts/Either';

export type GraphBoundaryDirection = 'input' | 'output';

export type GraphBoundaryMapping = {
  readonly node_id: NodeId;
  readonly port_id: string;
};

export type AddGraphBoundaryOptions = {
  readonly graph_id: GraphId;
  readonly direction: GraphBoundaryDirection;
  readonly slot: GraphSlot;
  readonly mapping: GraphBoundaryMapping;
  readonly boundary_id?: BoundaryId;
};

export type GraphBoundarySlotUpdate = Partial<GraphSlot>;

export type GraphBoundaryError =
  | { readonly type: 'invalid_arguments' }
  | { readonly type: 'graph_not_found'; readonly graph_id: GraphId }
  | {
      readonly type: 'boundary_slot_already_exists';
      readonly graph_id: GraphId;
      readonly direction: GraphBoundaryDirection;
      readonly slot_id: string;
    }
  | {
      readonly type: 'boundary_slot_not_found';
      readonly graph_id: GraphId;
      readonly direction: GraphBoundaryDirection;
      readonly slot_id: string;
    }
  | {
      readonly type: 'boundary_mapping_node_not_found';
      readonly graph_id: GraphId;
      readonly direction: GraphBoundaryDirection;
      readonly node_id: NodeId;
    }
  | {
      readonly type: 'boundary_mapping_node_not_in_graph';
      readonly graph_id: GraphId;
      readonly direction: GraphBoundaryDirection;
      readonly node_id: NodeId;
      readonly node_graph_id: GraphId;
    }
  | {
      readonly type: 'boundary_mapping_port_not_found';
      readonly graph_id: GraphId;
      readonly direction: GraphBoundaryDirection;
      readonly node_id: NodeId;
      readonly port_id: string;
    }
  | { readonly type: 'boundary_id_already_exists'; readonly boundary_id: BoundaryId }
  | {
      readonly type: 'host_port_in_use';
      readonly graph_id: GraphId;
      readonly direction: GraphBoundaryDirection;
      readonly slot_id: string;
      readonly host_node_id: NodeId;
      readonly binding_id: BindingId;
    };

const get_direction_slots = (
  graph: GraphScope,
  direction: GraphBoundaryDirection,
): readonly GraphSlot[] => {
  return direction === 'input' ? graph.input_slots : graph.output_slots;
};

const set_direction_slots = (
  graph: GraphScope,
  direction: GraphBoundaryDirection,
  slots: readonly GraphSlot[],
): GraphScope => {
  if (direction === 'input') {
    return { ...graph, input_slots: slots };
  }
  return { ...graph, output_slots: slots };
};

const get_direction_ports = (
  node: GraphNodeRecord,
  direction: GraphBoundaryDirection,
): readonly Port[] => {
  return direction === 'input' ? node.inputs : node.outputs;
};

const slot_to_port = (slot: GraphSlot, direction: GraphBoundaryDirection): Port => {
  return {
    id: slot.id,
    label: slot.label,
    type: direction,
    ...(slot.value_type !== undefined ? { value_type: slot.value_type } : {}),
    ...(slot.accepts !== undefined ? { accepts: slot.accepts } : {}),
    ...(slot.required !== undefined ? { required: slot.required } : {}),
  };
};

const find_host_port_binding = (
  document: GraphDocument,
  host_node: GraphNodeRecord,
  direction: GraphBoundaryDirection,
  slot_id: string,
): GraphBindingRecord | undefined => {
  if (direction === 'input') {
    return Object.values(document.bindings).find(
      binding =>
        binding.graph_id === host_node.graph_id &&
        binding.target_id === host_node.id &&
        binding.target_handle === slot_id,
    );
  }
  return Object.values(document.bindings).find(
    binding =>
      binding.graph_id === host_node.graph_id &&
      binding.source_id === host_node.id &&
      binding.source_handle === slot_id,
  );
};

const append_host_ports = (
  document: GraphDocument,
  graph_id: GraphId,
  direction: GraphBoundaryDirection,
  port: Port,
): Readonly<Record<NodeId, GraphNodeRecord>> => {
  return Object.values(document.nodes).reduce<Readonly<Record<NodeId, GraphNodeRecord>>>(
    (nodes, node) => {
      if (node.nested_graph_id !== graph_id) {
        return { ...nodes, [node.id]: node };
      }
      const updated_node =
        direction === 'input'
          ? { ...node, inputs: [...node.inputs, port] }
          : { ...node, outputs: [...node.outputs, port] };
      return { ...nodes, [node.id]: updated_node };
    },
    {},
  );
};

const replace_host_ports = (
  document: GraphDocument,
  graph_id: GraphId,
  direction: GraphBoundaryDirection,
  slot_id: string,
  next_slot: GraphSlot,
): Readonly<Record<NodeId, GraphNodeRecord>> => {
  return Object.values(document.nodes).reduce<Readonly<Record<NodeId, GraphNodeRecord>>>(
    (nodes, node) => {
      if (node.nested_graph_id !== graph_id) {
        return { ...nodes, [node.id]: node };
      }
      const updated_port = slot_to_port(next_slot, direction);
      const ports = get_direction_ports(node, direction).map(port => {
        return port.id === slot_id ? { ...port, ...updated_port } : port;
      });
      const updated_node =
        direction === 'input' ? { ...node, inputs: ports } : { ...node, outputs: ports };
      return { ...nodes, [node.id]: updated_node };
    },
    {},
  );
};

const remove_host_ports = (
  document: GraphDocument,
  graph_id: GraphId,
  direction: GraphBoundaryDirection,
  slot_id: string,
): Readonly<Record<NodeId, GraphNodeRecord>> => {
  return Object.values(document.nodes).reduce<Readonly<Record<NodeId, GraphNodeRecord>>>(
    (nodes, node) => {
      if (node.nested_graph_id !== graph_id) {
        return { ...nodes, [node.id]: node };
      }
      const ports = get_direction_ports(node, direction).filter(port => port.id !== slot_id);
      const updated_node =
        direction === 'input' ? { ...node, inputs: ports } : { ...node, outputs: ports };
      return { ...nodes, [node.id]: updated_node };
    },
    {},
  );
};

const merge_slot_update = (
  slot: GraphSlot,
  updates: GraphBoundarySlotUpdate,
): E.Either<GraphBoundaryError, GraphSlot> => {
  if (updates == null || typeof updates !== 'object' || Array.isArray(updates)) {
    return E.left({ type: 'invalid_arguments' });
  }

  const update_record = updates as Partial<GraphSlot>;
  if (update_record.id != null && update_record.id !== slot.id) {
    return E.left({ type: 'invalid_arguments' });
  }

  const label = updates.label ?? slot.label;
  const value_type = updates.value_type !== undefined ? updates.value_type : slot.value_type;
  const accepts = updates.accepts !== undefined ? updates.accepts : slot.accepts;
  const required = updates.required !== undefined ? updates.required : slot.required;
  if (typeof label !== 'string') {
    return E.left({ type: 'invalid_arguments' });
  }
  if (value_type !== undefined && typeof value_type !== 'string') {
    return E.left({ type: 'invalid_arguments' });
  }
  if (accepts !== undefined && !Array.isArray(accepts)) {
    return E.left({ type: 'invalid_arguments' });
  }
  if (required !== undefined && typeof required !== 'boolean') {
    return E.left({ type: 'invalid_arguments' });
  }

  const next_slot: GraphSlot = {
    id: slot.id,
    label,
    ...(value_type !== undefined ? { value_type } : {}),
    ...(accepts !== undefined ? { accepts } : {}),
    ...(required !== undefined ? { required } : {}),
  };
  return E.right(next_slot);
};

/**
 * 向 graph scope 追加 input/output slot，并同步所有引用该 graph 的 host node 端口。
 * @param document - 原 GraphDocument
 * @param options - graph、方向、slot 与真实端口 mapping
 * @returns 更新后的 document，或 GraphBoundaryError
 */
export const add_graph_boundary = (
  document: GraphDocument,
  options: AddGraphBoundaryOptions,
): E.Either<GraphBoundaryError, GraphDocument> => {
  const graph = document.graphs[options.graph_id];
  if (graph == null) {
    return E.left({ type: 'graph_not_found', graph_id: options.graph_id });
  }
  if (
    options.slot == null ||
    typeof options.slot.id !== 'string' ||
    typeof options.slot.label !== 'string' ||
    options.mapping == null ||
    typeof options.mapping.node_id !== 'string' ||
    typeof options.mapping.port_id !== 'string'
  ) {
    return E.left({ type: 'invalid_arguments' });
  }

  const slots = get_direction_slots(graph, options.direction);
  if (slots.some(slot => slot.id === options.slot.id)) {
    return E.left({
      type: 'boundary_slot_already_exists',
      graph_id: options.graph_id,
      direction: options.direction,
      slot_id: options.slot.id,
    });
  }

  const mapping_node = document.nodes[options.mapping.node_id];
  if (mapping_node == null) {
    return E.left({
      type: 'boundary_mapping_node_not_found',
      graph_id: options.graph_id,
      direction: options.direction,
      node_id: options.mapping.node_id,
    });
  }
  if (mapping_node.graph_id !== options.graph_id) {
    return E.left({
      type: 'boundary_mapping_node_not_in_graph',
      graph_id: options.graph_id,
      direction: options.direction,
      node_id: options.mapping.node_id,
      node_graph_id: mapping_node.graph_id,
    });
  }
  const mapped_ports = get_direction_ports(mapping_node, options.direction);
  if (!mapped_ports.some(port => port.id === options.mapping.port_id)) {
    return E.left({
      type: 'boundary_mapping_port_not_found',
      graph_id: options.graph_id,
      direction: options.direction,
      node_id: options.mapping.node_id,
      port_id: options.mapping.port_id,
    });
  }

  const boundary_id =
    options.boundary_id ?? `${options.graph_id}:${options.direction}:${options.slot.id}`;
  if (document.boundary_bindings[boundary_id] != null) {
    return E.left({ type: 'boundary_id_already_exists', boundary_id });
  }

  const boundary: GraphBoundaryBinding = {
    id: boundary_id,
    graph_id: options.graph_id,
    direction: options.direction,
    slot_id: options.slot.id,
    node_id: options.mapping.node_id,
    port_id: options.mapping.port_id,
  };
  const next_slots = [...slots, options.slot];
  const next_graph = set_direction_slots(graph, options.direction, next_slots);

  return E.right({
    ...document,
    graphs: { ...document.graphs, [options.graph_id]: next_graph },
    nodes: append_host_ports(
      document,
      options.graph_id,
      options.direction,
      slot_to_port(options.slot, options.direction),
    ),
    boundary_bindings: { ...document.boundary_bindings, [boundary_id]: boundary },
  });
};

/**
 * 删除 graph scope 的边界 slot、对应 mapping，并同步删除 host node 端口。
 * host 端口仍被父 graph binding 使用时返回明确错误。
 * @param document - 原 GraphDocument
 * @param graph_id - 目标 graph
 * @param direction - slot 方向
 * @param slot_id - 要删除的 slot id
 * @returns 更新后的 document，或 GraphBoundaryError
 */
export const remove_graph_boundary = (
  document: GraphDocument,
  graph_id: GraphId,
  direction: GraphBoundaryDirection,
  slot_id: string,
): E.Either<GraphBoundaryError, GraphDocument> => {
  const graph = document.graphs[graph_id];
  if (graph == null) {
    return E.left({ type: 'graph_not_found', graph_id });
  }

  const slots = get_direction_slots(graph, direction);
  if (!slots.some(slot => slot.id === slot_id)) {
    return E.left({
      type: 'boundary_slot_not_found',
      graph_id,
      direction,
      slot_id,
    });
  }

  const host_nodes = Object.values(document.nodes).filter(
    node => node.nested_graph_id === graph_id,
  );
  for (const host_node of host_nodes) {
    const binding = find_host_port_binding(document, host_node, direction, slot_id);
    if (binding != null) {
      return E.left({
        type: 'host_port_in_use',
        graph_id,
        direction,
        slot_id,
        host_node_id: host_node.id,
        binding_id: binding.id,
      });
    }
  }

  const next_slots = slots.filter(slot => slot.id !== slot_id);
  const next_graph = set_direction_slots(graph, direction, next_slots);
  const next_boundaries = Object.values(document.boundary_bindings)
    .filter(
      boundary =>
        !(
          boundary.graph_id === graph_id &&
          boundary.direction === direction &&
          boundary.slot_id === slot_id
        ),
    )
    .reduce<Readonly<Record<BoundaryId, GraphBoundaryBinding>>>((acc, boundary) => {
      return { ...acc, [boundary.id]: boundary };
    }, {});

  return E.right({
    ...document,
    graphs: { ...document.graphs, [graph_id]: next_graph },
    nodes: remove_host_ports(document, graph_id, direction, slot_id),
    boundary_bindings: next_boundaries,
  });
};

/**
 * 更新边界 slot 的可编辑元数据，并同步更新所有 host node 上同名端口。
 * slot id 不可变。
 * @param document - 原 GraphDocument
 * @param graph_id - 目标 graph
 * @param direction - slot 方向
 * @param slot_id - 要更新的 slot id
 * @param updates - 可更新的 slot 字段
 * @returns 更新后的 document，或 GraphBoundaryError
 */
export const update_graph_boundary_slot = (
  document: GraphDocument,
  graph_id: GraphId,
  direction: GraphBoundaryDirection,
  slot_id: string,
  updates: GraphBoundarySlotUpdate,
): E.Either<GraphBoundaryError, GraphDocument> => {
  const graph = document.graphs[graph_id];
  if (graph == null) {
    return E.left({ type: 'graph_not_found', graph_id });
  }

  const slots = get_direction_slots(graph, direction);
  const slot = slots.find(slot => slot.id === slot_id);
  if (slot == null) {
    return E.left({
      type: 'boundary_slot_not_found',
      graph_id,
      direction,
      slot_id,
    });
  }

  const merge_result = merge_slot_update(slot, updates);
  if (E.isLeft(merge_result)) {
    return merge_result;
  }

  const next_slot = merge_result.right;
  const next_slots = slots.map(current_slot => {
    return current_slot.id === slot_id ? next_slot : current_slot;
  });
  const next_graph = set_direction_slots(graph, direction, next_slots);

  return E.right({
    ...document,
    graphs: { ...document.graphs, [graph_id]: next_graph },
    nodes: replace_host_ports(document, graph_id, direction, slot_id, next_slot),
  });
};
