import type { GraphNode } from '../types';
import type {
  BindingId,
  BoundaryId,
  GraphBoundaryBinding,
  GraphBindingRecord,
  GraphDocument,
  GraphId,
  GraphNodeRecord,
  GraphScope,
  NodeId,
} from './types';
import * as E from 'fp-ts/Either';
import * as O from 'fp-ts/Option';

export type GraphDocumentError =
  | { readonly type: 'invalid_arguments' }
  | { readonly type: 'graph_not_found'; readonly graph_id: GraphId }
  | { readonly type: 'graph_already_exists'; readonly graph_id: GraphId }
  | { readonly type: 'parent_graph_required'; readonly graph_id: GraphId }
  | {
      readonly type: 'parent_graph_not_found';
      readonly graph_id: GraphId;
      readonly parent_graph_id: GraphId;
    }
  | {
      readonly type: 'root_graph_must_not_have_parent';
      readonly graph_id: GraphId;
      readonly parent_graph_id: GraphId;
    }
  | { readonly type: 'root_already_exists'; readonly graph_id: GraphId }
  | { readonly type: 'cannot_remove_root'; readonly graph_id: GraphId }
  | {
      readonly type: 'graph_has_children';
      readonly graph_id: GraphId;
      readonly child_graph_ids: readonly GraphId[];
    }
  | {
      readonly type: 'graph_not_empty';
      readonly graph_id: GraphId;
      readonly node_count: number;
      readonly binding_count: number;
    }
  | { readonly type: 'node_not_found'; readonly node_id: NodeId }
  | { readonly type: 'duplicate_node_id'; readonly node_id: NodeId }
  | { readonly type: 'node_graph_not_found'; readonly node_id: NodeId; readonly graph_id: GraphId }
  | { readonly type: 'target_graph_not_found'; readonly target_graph_id: GraphId }
  | {
      readonly type: 'target_graph_is_current_graph';
      readonly node_id: NodeId;
      readonly graph_id: GraphId;
    }
  | { readonly type: 'binding_not_found'; readonly binding_id: BindingId }
  | { readonly type: 'binding_already_exists'; readonly binding_id: BindingId }
  | {
      readonly type: 'binding_graph_not_found';
      readonly binding_id: BindingId;
      readonly graph_id: GraphId;
    }
  | {
      readonly type: 'binding_graph_mismatch';
      readonly binding_id: BindingId;
      readonly graph_id: GraphId;
      readonly node_id: NodeId;
    }
  | {
      readonly type: 'binding_source_not_found';
      readonly binding_id: BindingId;
      readonly source_id: NodeId;
    }
  | {
      readonly type: 'binding_target_not_found';
      readonly binding_id: BindingId;
      readonly target_id: NodeId;
    }
  | {
      readonly type: 'binding_nodes_in_different_graphs';
      readonly binding_id: BindingId;
      readonly source_graph_id: GraphId;
      readonly target_graph_id: GraphId;
    }
  | {
      readonly type: 'source_port_not_found';
      readonly binding_id: BindingId;
      readonly node_id: NodeId;
      readonly handle: string;
    }
  | {
      readonly type: 'target_port_not_found';
      readonly binding_id: BindingId;
      readonly node_id: NodeId;
      readonly handle: string;
    }
  | {
      readonly type: 'graph_has_hosts';
      readonly graph_id: GraphId;
      readonly host_node_ids: readonly NodeId[];
    }
  | {
      readonly type: 'empty_node_selection';
      readonly source_graph_id: GraphId;
    }
  | {
      readonly type: 'node_not_in_source_graph';
      readonly node_id: NodeId;
      readonly node_graph_id: GraphId;
      readonly source_graph_id: GraphId;
    }
  | {
      readonly type: 'host_node_in_selection';
      readonly host_node_id: NodeId;
    }
  | {
      readonly type: 'nested_graph_required';
      readonly node_id: NodeId;
    }
  | {
      readonly type: 'nested_graph_not_found';
      readonly node_id: NodeId;
      readonly graph_id: GraphId;
    }
  | {
      readonly type: 'host_graph_is_root';
      readonly node_id: NodeId;
      readonly nested_graph_id: GraphId;
    }
  | {
      readonly type: 'host_graph_kind_invalid';
      readonly node_id: NodeId;
      readonly nested_graph_id: GraphId;
      readonly nested_kind: string;
    }
  | {
      readonly type: 'host_graph_parent_mismatch';
      readonly node_id: NodeId;
      readonly nested_graph_id: GraphId;
      readonly node_graph_id: GraphId;
      readonly nested_parent_graph_id?: GraphId;
    }
  | {
      readonly type: 'host_ports_scope_mismatch';
      readonly node_id: NodeId;
      readonly nested_graph_id: GraphId;
      readonly direction: 'input' | 'output';
    }
  | {
      readonly type: 'node_used_by_boundary';
      readonly node_id: NodeId;
      readonly graph_id: GraphId;
      readonly boundary_ids: readonly BoundaryId[];
    }
  | {
      readonly type: 'cannot_move_host_node';
      readonly node_id: NodeId;
      readonly nested_graph_id: GraphId;
    }
  | {
      readonly type: 'updated_node_id_changed';
      readonly node_id: NodeId;
      readonly updated_node_id: NodeId;
    }
  | {
      readonly type: 'updated_node_graph_changed';
      readonly node_id: NodeId;
      readonly graph_id: GraphId;
      readonly updated_graph_id: GraphId;
    }
  | {
      readonly type: 'binding_invalidated_by_node_update';
      readonly binding_id: BindingId;
      readonly node_id: NodeId;
      readonly handle: string;
    }
  | {
      readonly type: 'graph_still_has_hosts';
      readonly graph_id: GraphId;
      readonly host_node_ids: readonly NodeId[];
    }
  | {
      readonly type: 'host_binding_missing_boundary';
      readonly binding_id: BindingId;
      readonly node_id: NodeId;
      readonly handle: string;
    };

export const create_empty_graph_document = (): GraphDocument => {
  const root_graph: GraphScope = {
    id: 'root',
    kind: 'root',
    title: 'Root',
    input_slots: [],
    output_slots: [],
  };

  return {
    format_version: 1,
    root_graph_id: root_graph.id,
    graphs: { [root_graph.id]: root_graph },
    nodes: {},
    bindings: {},
    boundary_bindings: {},
  };
};

export const get_graph = (document: GraphDocument, graph_id: GraphId): O.Option<GraphScope> => {
  return O.fromNullable(document.graphs[graph_id]);
};

export const get_node = (document: GraphDocument, node_id: NodeId): O.Option<GraphNodeRecord> => {
  return O.fromNullable(document.nodes[node_id]);
};

export const get_binding = (
  document: GraphDocument,
  binding_id: BindingId,
): O.Option<GraphBindingRecord> => {
  return O.fromNullable(document.bindings[binding_id]);
};

export const add_graph = (
  document: GraphDocument,
  graph: GraphScope,
): E.Either<GraphDocumentError, GraphDocument> => {
  if (document.graphs[graph.id] != null) {
    return E.left({ type: 'graph_already_exists', graph_id: graph.id });
  }

  if (graph.kind === 'root') {
    if (graph.parent_graph_id != null) {
      return E.left({
        type: 'root_graph_must_not_have_parent',
        graph_id: graph.id,
        parent_graph_id: graph.parent_graph_id,
      });
    }

    return E.left({ type: 'root_already_exists', graph_id: graph.id });
  }

  if (graph.parent_graph_id == null) {
    return E.left({ type: 'parent_graph_required', graph_id: graph.id });
  }

  if (document.graphs[graph.parent_graph_id] == null) {
    return E.left({
      type: 'parent_graph_not_found',
      graph_id: graph.id,
      parent_graph_id: graph.parent_graph_id,
    });
  }

  return E.right({
    ...document,
    graphs: { ...document.graphs, [graph.id]: graph },
  });
};

export const remove_graph = (
  document: GraphDocument,
  graph_id: GraphId,
): E.Either<GraphDocumentError, GraphDocument> => {
  const graph = document.graphs[graph_id];
  if (graph == null) {
    return E.left({ type: 'graph_not_found', graph_id });
  }

  if (graph_id === document.root_graph_id) {
    return E.left({ type: 'cannot_remove_root', graph_id });
  }

  const host_node_ids = Object.values(document.nodes)
    .filter(node => node.nested_graph_id === graph_id)
    .map(node => node.id);
  if (host_node_ids.length > 0) {
    return E.left({ type: 'graph_has_hosts', graph_id, host_node_ids });
  }

  const child_graph_ids = Object.values(document.graphs)
    .filter(child_graph => child_graph.parent_graph_id === graph_id)
    .map(child_graph => child_graph.id);
  if (child_graph_ids.length > 0) {
    return E.left({ type: 'graph_has_children', graph_id, child_graph_ids });
  }

  const node_count = Object.values(document.nodes).filter(
    node => node.graph_id === graph_id,
  ).length;
  const binding_count = Object.values(document.bindings).filter(
    binding => binding.graph_id === graph_id,
  ).length;
  if (node_count > 0 || binding_count > 0) {
    return E.left({ type: 'graph_not_empty', graph_id, node_count, binding_count });
  }

  const { [graph_id]: _removed_graph, ...graphs } = document.graphs;
  const boundary_bindings = Object.values(document.boundary_bindings)
    .filter(boundary => boundary.graph_id !== graph_id)
    .reduce<Readonly<Record<BoundaryId, GraphBoundaryBinding>>>(
      (acc, boundary) => ({ ...acc, [boundary.id]: boundary }),
      {},
    );

  return E.right({ ...document, graphs, boundary_bindings });
};

const has_same_ids = (left: readonly string[], right: readonly string[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((id, index) => id === right[index]);
};

const validate_host_scope = (
  document: GraphDocument,
  node: GraphNodeRecord,
): E.Either<GraphDocumentError, undefined> => {
  const nested_graph_id = node.nested_graph_id;
  if (nested_graph_id == null) {
    return E.right(undefined);
  }

  const nested_graph = document.graphs[nested_graph_id];
  if (nested_graph == null) {
    return E.left({
      type: 'nested_graph_not_found',
      node_id: node.id,
      graph_id: nested_graph_id,
    });
  }
  if (nested_graph.id === document.root_graph_id) {
    return E.left({
      type: 'host_graph_is_root',
      node_id: node.id,
      nested_graph_id,
    });
  }
  if (nested_graph.kind !== 'subgraph') {
    return E.left({
      type: 'host_graph_kind_invalid',
      node_id: node.id,
      nested_graph_id,
      nested_kind: String(nested_graph.kind),
    });
  }
  if (nested_graph.parent_graph_id !== node.graph_id) {
    return E.left({
      type: 'host_graph_parent_mismatch',
      node_id: node.id,
      nested_graph_id,
      node_graph_id: node.graph_id,
      nested_parent_graph_id: nested_graph.parent_graph_id,
    });
  }

  const host_input_ids = node.inputs.map(port => port.id);
  const scope_input_ids = nested_graph.input_slots.map(slot => slot.id);
  if (!has_same_ids(host_input_ids, scope_input_ids)) {
    return E.left({
      type: 'host_ports_scope_mismatch',
      node_id: node.id,
      nested_graph_id,
      direction: 'input',
    });
  }

  const host_output_ids = node.outputs.map(port => port.id);
  const scope_output_ids = nested_graph.output_slots.map(slot => slot.id);
  if (!has_same_ids(host_output_ids, scope_output_ids)) {
    return E.left({
      type: 'host_ports_scope_mismatch',
      node_id: node.id,
      nested_graph_id,
      direction: 'output',
    });
  }

  return E.right(undefined);
};

const add_node_record = (
  document: GraphDocument,
  node: GraphNodeRecord,
): E.Either<GraphDocumentError, GraphDocument> => {
  if (document.graphs[node.graph_id] == null) {
    return E.left({ type: 'graph_not_found', graph_id: node.graph_id });
  }

  if (document.nodes[node.id] != null) {
    return E.left({ type: 'duplicate_node_id', node_id: node.id });
  }

  const host_validation = validate_host_scope(document, node);
  if (E.isLeft(host_validation)) {
    return host_validation;
  }

  return E.right({
    ...document,
    nodes: { ...document.nodes, [node.id]: node },
  });
};

export function add_node(
  document: GraphDocument,
  node: GraphNodeRecord,
): E.Either<GraphDocumentError, GraphDocument>;
export function add_node(
  document: GraphDocument,
  graph_id: GraphId,
  node: GraphNode,
): E.Either<GraphDocumentError, GraphDocument>;
export function add_node(
  document: GraphDocument,
  graph_id_or_node: GraphId | GraphNodeRecord,
  maybe_node?: GraphNode,
): E.Either<GraphDocumentError, GraphDocument> {
  if (typeof graph_id_or_node === 'string') {
    if (maybe_node == null) {
      return E.left({ type: 'invalid_arguments' });
    }

    return add_node_record(document, { ...maybe_node, graph_id: graph_id_or_node });
  }

  return add_node_record(document, graph_id_or_node);
}

const boundary_ids_using_node = (
  document: GraphDocument,
  node_id: NodeId,
  graph_id: GraphId,
): readonly BoundaryId[] => {
  return Object.values(document.boundary_bindings)
    .filter(boundary => boundary.graph_id === graph_id && boundary.node_id === node_id)
    .map(boundary => boundary.id);
};

export const remove_node = (
  document: GraphDocument,
  node_id: NodeId,
): E.Either<GraphDocumentError, GraphDocument> => {
  const node_option = get_node(document, node_id);
  if (O.isNone(node_option)) {
    return E.left({ type: 'node_not_found', node_id });
  }

  const node = node_option.value;
  const boundary_ids = boundary_ids_using_node(document, node_id, node.graph_id);
  if (boundary_ids.length > 0) {
    return E.left({
      type: 'node_used_by_boundary',
      node_id,
      graph_id: node.graph_id,
      boundary_ids,
    });
  }

  const bindings = bindings_without_node(document, node_id, node.graph_id);
  const { [node_id]: _removed_node, ...nodes } = document.nodes;

  return E.right({ ...document, nodes, bindings });
};

export const move_node_to_graph = (
  document: GraphDocument,
  node_id: NodeId,
  target_graph_id: GraphId,
): E.Either<GraphDocumentError, GraphDocument> => {
  const node_option = get_node(document, node_id);
  if (O.isNone(node_option)) {
    return E.left({ type: 'node_not_found', node_id });
  }

  const node = node_option.value;
  if (document.graphs[node.graph_id] == null) {
    return E.left({ type: 'node_graph_not_found', node_id, graph_id: node.graph_id });
  }

  if (document.graphs[target_graph_id] == null) {
    return E.left({ type: 'target_graph_not_found', target_graph_id });
  }

  if (node.graph_id === target_graph_id) {
    return E.left({ type: 'target_graph_is_current_graph', node_id, graph_id: node.graph_id });
  }

  const boundary_ids = boundary_ids_using_node(document, node_id, node.graph_id);
  if (boundary_ids.length > 0) {
    return E.left({
      type: 'node_used_by_boundary',
      node_id,
      graph_id: node.graph_id,
      boundary_ids,
    });
  }

  if (node.nested_graph_id != null) {
    return E.left({
      type: 'cannot_move_host_node',
      node_id,
      nested_graph_id: node.nested_graph_id,
    });
  }

  const moved_node: GraphNodeRecord = { ...node, graph_id: target_graph_id };
  const bindings = bindings_without_node(document, node_id, node.graph_id);

  return E.right({
    ...document,
    nodes: { ...document.nodes, [node_id]: moved_node },
    bindings,
  });
};

const find_binding_invalidated_by_node_update = (
  document: GraphDocument,
  node_id: NodeId,
  graph_id: GraphId,
  updated_node: GraphNodeRecord,
): GraphBindingRecord | undefined => {
  const input_handles = new Set(updated_node.inputs.map(port => port.id));
  const output_handles = new Set(updated_node.outputs.map(port => port.id));
  return Object.values(document.bindings).find(binding => {
    if (binding.graph_id !== graph_id) {
      return false;
    }
    if (binding.source_id === node_id && !output_handles.has(binding.source_handle)) {
      return true;
    }
    if (binding.target_id === node_id && !input_handles.has(binding.target_handle)) {
      return true;
    }
    return false;
  });
};

/**
 * 用纯 updater 更新节点，并在写入前校验 host/scope 与既有 binding 不变量。
 * @param document - 原 GraphDocument
 * @param node_id - 目标节点 id
 * @param updater - 返回新 GraphNodeRecord 的纯函数
 * @returns 更新后的 document，或 GraphDocumentError
 */
export const update_node = (
  document: GraphDocument,
  node_id: NodeId,
  updater: (node: GraphNodeRecord) => GraphNodeRecord,
): E.Either<GraphDocumentError, GraphDocument> => {
  const node_option = get_node(document, node_id);
  if (O.isNone(node_option)) {
    return E.left({ type: 'node_not_found', node_id });
  }

  const node = node_option.value;
  const updated_node = updater(node);

  if (updated_node.id !== node.id) {
    return E.left({
      type: 'updated_node_id_changed',
      node_id: node.id,
      updated_node_id: updated_node.id,
    });
  }
  if (updated_node.graph_id !== node.graph_id) {
    return E.left({
      type: 'updated_node_graph_changed',
      node_id: node.id,
      graph_id: node.graph_id,
      updated_graph_id: updated_node.graph_id,
    });
  }

  const invalidated_binding = find_binding_invalidated_by_node_update(
    document,
    node_id,
    node.graph_id,
    updated_node,
  );
  if (invalidated_binding != null) {
    const source_invalidated = invalidated_binding.source_id === node_id;
    return E.left({
      type: 'binding_invalidated_by_node_update',
      binding_id: invalidated_binding.id,
      node_id,
      handle: source_invalidated
        ? invalidated_binding.source_handle
        : invalidated_binding.target_handle,
    });
  }

  const host_validation = validate_host_scope(document, updated_node);
  if (E.isLeft(host_validation)) {
    return host_validation;
  }

  return E.right({
    ...document,
    nodes: { ...document.nodes, [node_id]: updated_node },
  });
};

const bindings_without_node = (
  document: GraphDocument,
  node_id: NodeId,
  graph_id: GraphId,
): Readonly<Record<BindingId, GraphBindingRecord>> => {
  return Object.values(document.bindings)
    .filter(binding => {
      const is_related =
        binding.graph_id === graph_id &&
        (binding.source_id === node_id || binding.target_id === node_id);
      return !is_related;
    })
    .reduce<Readonly<Record<BindingId, GraphBindingRecord>>>((acc, binding) => {
      return { ...acc, [binding.id]: binding };
    }, {});
};

export const add_binding = (
  document: GraphDocument,
  binding: GraphBindingRecord,
): E.Either<GraphDocumentError, GraphDocument> => {
  if (document.bindings[binding.id] != null) {
    return E.left({ type: 'binding_already_exists', binding_id: binding.id });
  }

  if (document.graphs[binding.graph_id] == null) {
    return E.left({
      type: 'binding_graph_not_found',
      binding_id: binding.id,
      graph_id: binding.graph_id,
    });
  }

  const source_node_option = get_node(document, binding.source_id);
  if (O.isNone(source_node_option)) {
    return E.left({
      type: 'binding_source_not_found',
      binding_id: binding.id,
      source_id: binding.source_id,
    });
  }

  const target_node_option = get_node(document, binding.target_id);
  if (O.isNone(target_node_option)) {
    return E.left({
      type: 'binding_target_not_found',
      binding_id: binding.id,
      target_id: binding.target_id,
    });
  }

  const source_node = source_node_option.value;
  const target_node = target_node_option.value;

  if (source_node.graph_id !== target_node.graph_id) {
    return E.left({
      type: 'binding_nodes_in_different_graphs',
      binding_id: binding.id,
      source_graph_id: source_node.graph_id,
      target_graph_id: target_node.graph_id,
    });
  }

  if (source_node.graph_id !== binding.graph_id) {
    return E.left({
      type: 'binding_graph_mismatch',
      binding_id: binding.id,
      graph_id: binding.graph_id,
      node_id: source_node.id,
    });
  }

  const source_port_exists = source_node.outputs.some(port => port.id === binding.source_handle);
  if (!source_port_exists) {
    return E.left({
      type: 'source_port_not_found',
      binding_id: binding.id,
      node_id: source_node.id,
      handle: binding.source_handle,
    });
  }

  const target_port_exists = target_node.inputs.some(port => port.id === binding.target_handle);
  if (!target_port_exists) {
    return E.left({
      type: 'target_port_not_found',
      binding_id: binding.id,
      node_id: target_node.id,
      handle: binding.target_handle,
    });
  }

  return E.right({
    ...document,
    bindings: { ...document.bindings, [binding.id]: binding },
  });
};

export const remove_binding = (
  document: GraphDocument,
  binding_id: BindingId,
): E.Either<GraphDocumentError, GraphDocument> => {
  if (document.bindings[binding_id] == null) {
    return E.left({ type: 'binding_not_found', binding_id });
  }

  const { [binding_id]: _removed_binding, ...bindings } = document.bindings;
  return E.right({ ...document, bindings });
};

export { pack_nodes, unpack_subgraph } from './subgraph';
export type { PackNodesOptions } from './subgraph';
