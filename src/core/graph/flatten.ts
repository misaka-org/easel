import type {
  GraphBoundaryBinding,
  GraphBindingRecord,
  GraphDocument,
  GraphId,
  GraphNodeRecord,
  NodeId,
} from './types';
import * as E from 'fp-ts/Either';

export type GraphScopeStep = {
  readonly graph_id: GraphId;
  readonly host_node_id?: NodeId;
};

export type FlattenedGraphNode = {
  readonly instance_id: string;
  readonly scope_steps: readonly GraphScopeStep[];
  readonly graph_id: GraphId;
  readonly node_id: NodeId;
  readonly node: GraphNodeRecord;
};

export type FlattenedGraphBinding = {
  readonly id: string;
  readonly source_instance_id: string;
  readonly source_handle: string;
  readonly target_instance_id: string;
  readonly target_handle: string;
};

export type FlattenedGraph = {
  readonly nodes: Readonly<Record<string, FlattenedGraphNode>>;
  readonly bindings: Readonly<Record<string, FlattenedGraphBinding>>;
};

export type GraphFlattenError =
  | { readonly type: 'root_graph_not_found'; readonly root_graph_id: GraphId }
  | { readonly type: 'root_graph_kind_invalid'; readonly root_graph_id: GraphId }
  | { readonly type: 'graph_not_found'; readonly graph_id: GraphId }
  | {
      readonly type: 'nested_graph_not_found';
      readonly host_node_id: NodeId;
      readonly host_graph_id: GraphId;
      readonly nested_graph_id: GraphId;
    }
  | { readonly type: 'node_not_found'; readonly node_id: NodeId; readonly graph_id: GraphId }
  | {
      readonly type: 'node_graph_mismatch';
      readonly node_id: NodeId;
      readonly expected_graph_id: GraphId;
      readonly actual_graph_id: GraphId;
    }
  | {
      readonly type: 'duplicate_boundary_mapping';
      readonly graph_id: GraphId;
      readonly direction: 'input' | 'output';
      readonly slot_id: string;
      readonly boundary_ids: readonly string[];
    }
  | {
      readonly type: 'host_binding_missing_boundary';
      readonly binding_id: string;
      readonly graph_id: GraphId;
      readonly host_node_id: NodeId;
      readonly direction: 'input' | 'output';
      readonly slot_id: string;
      readonly nested_graph_id: GraphId;
    }
  | {
      readonly type: 'boundary_mapping_node_not_found';
      readonly graph_id: GraphId;
      readonly direction: 'input' | 'output';
      readonly slot_id: string;
      readonly node_id: NodeId;
    }
  | {
      readonly type: 'boundary_mapping_node_graph_mismatch';
      readonly graph_id: GraphId;
      readonly direction: 'input' | 'output';
      readonly slot_id: string;
      readonly node_id: NodeId;
      readonly node_graph_id: GraphId;
    }
  | {
      readonly type: 'boundary_mapping_port_not_found';
      readonly graph_id: GraphId;
      readonly direction: 'input' | 'output';
      readonly slot_id: string;
      readonly node_id: NodeId;
      readonly port_id: string;
    }
  | {
      readonly type: 'scope_cycle_detected';
      readonly graph_id: GraphId;
      readonly host_node_id: NodeId;
    };

type BoundaryDirection = 'input' | 'output';

type ScopeContext = {
  readonly graph_id: GraphId;
  readonly steps: readonly GraphScopeStep[];
  readonly path_components: readonly string[];
  readonly host_node_ids: readonly NodeId[];
};

type FlatEndpoint = {
  readonly instance_id: string;
  readonly handle: string;
};

type FlatAccumulator = {
  readonly nodes: Readonly<Record<string, FlattenedGraphNode>>;
  readonly bindings: Readonly<Record<string, FlattenedGraphBinding>>;
};

const encode_path_component = (value: string): string => {
  return value.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
};

const make_flat_id = (context: ScopeContext, suffix: string): string => {
  const parts = [...context.path_components, suffix].map(encode_path_component);
  return parts.join(':');
};

const make_flat_binding_id = (context: ScopeContext, binding: GraphBindingRecord): string => {
  // root 下保留原 binding id；实例化 subgraph 后用实例路径隔离相同 binding id。
  if (context.steps.length === 1) {
    return binding.id;
  }
  return make_flat_id(context, binding.id);
};

const merge_accumulator = (
  left: FlatAccumulator,
  right: FlatAccumulator,
): FlatAccumulator => {
  return {
    nodes: { ...left.nodes, ...right.nodes },
    bindings: { ...left.bindings, ...right.bindings },
  };
};

const get_boundary_mapping = (
  document: GraphDocument,
  graph_id: GraphId,
  direction: BoundaryDirection,
  slot_id: string,
): GraphBoundaryBinding | undefined => {
  return Object.values(document.boundary_bindings).find(boundary => {
    return (
      boundary.graph_id === graph_id &&
      boundary.direction === direction &&
      boundary.slot_id === slot_id
    );
  });
};

const node_has_port = (
  node: GraphNodeRecord,
  direction: BoundaryDirection,
  port_id: string,
): boolean => {
  const ports = direction === 'input' ? node.inputs : node.outputs;
  return ports.some(port => port.id === port_id);
};

const check_duplicate_boundary_mappings = (
  document: GraphDocument,
  graph_id: GraphId,
): E.Either<GraphFlattenError, true> => {
  const seen = new Map<string, GraphBoundaryBinding>();
  for (const boundary of Object.values(document.boundary_bindings)) {
    if (boundary.graph_id !== graph_id) {
      continue;
    }
    const key = `${boundary.direction}\u0000${boundary.slot_id}`;
    const previous = seen.get(key);
    if (previous != null) {
      return E.left({
        type: 'duplicate_boundary_mapping',
        graph_id,
        direction: boundary.direction,
        slot_id: boundary.slot_id,
        boundary_ids: [previous.id, boundary.id],
      });
    }
    seen.set(key, boundary);
  }
  return E.right(true);
};

const create_root_context = (
  document: GraphDocument,
): E.Either<GraphFlattenError, ScopeContext> => {
  const root_graph_id = document.root_graph_id;
  const root_graph = document.graphs[root_graph_id];
  if (root_graph == null) {
    return E.left({ type: 'root_graph_not_found', root_graph_id });
  }
  if (root_graph.kind !== 'root') {
    return E.left({ type: 'root_graph_kind_invalid', root_graph_id });
  }
  return E.right({
    graph_id: root_graph_id,
    steps: [{ graph_id: root_graph_id }],
    path_components: [root_graph_id],
    host_node_ids: [],
  });
};

const extend_scope_context = (
  document: GraphDocument,
  context: ScopeContext,
  host_node: GraphNodeRecord,
  nested_graph_id: GraphId,
): E.Either<GraphFlattenError, ScopeContext> => {
  if (context.host_node_ids.includes(host_node.id)) {
    return E.left({
      type: 'scope_cycle_detected',
      graph_id: host_node.graph_id,
      host_node_id: host_node.id,
    });
  }
  if (document.graphs[nested_graph_id] == null) {
    return E.left({
      type: 'nested_graph_not_found',
      host_node_id: host_node.id,
      host_graph_id: host_node.graph_id,
      nested_graph_id,
    });
  }
  return E.right({
    graph_id: nested_graph_id,
    steps: [...context.steps, { graph_id: nested_graph_id, host_node_id: host_node.id }],
    path_components: [...context.path_components, host_node.id],
    host_node_ids: [...context.host_node_ids, host_node.id],
  });
};

const resolve_endpoint = (
  document: GraphDocument,
  context: ScopeContext,
  binding_id: string,
  node_id: NodeId,
  handle: string,
  direction: BoundaryDirection,
): E.Either<GraphFlattenError, FlatEndpoint> => {
  const node = document.nodes[node_id];
  if (node == null) {
    return E.left({ type: 'node_not_found', node_id, graph_id: context.graph_id });
  }
  if (node.graph_id !== context.graph_id) {
    return E.left({
      type: 'node_graph_mismatch',
      node_id,
      expected_graph_id: context.graph_id,
      actual_graph_id: node.graph_id,
    });
  }
  if (node.nested_graph_id == null) {
    return E.right({ instance_id: make_flat_id(context, node_id), handle });
  }

  const nested_graph_id = node.nested_graph_id;
  if (document.graphs[nested_graph_id] == null) {
    return E.left({
      type: 'nested_graph_not_found',
      host_node_id: node.id,
      host_graph_id: node.graph_id,
      nested_graph_id,
    });
  }

  const boundary = get_boundary_mapping(document, nested_graph_id, direction, handle);
  if (boundary == null || boundary.direction !== direction) {
    return E.left({
      type: 'host_binding_missing_boundary',
      binding_id,
      graph_id: node.graph_id,
      host_node_id: node.id,
      direction,
      slot_id: handle,
      nested_graph_id,
    });
  }

  const boundary_node = document.nodes[boundary.node_id];
  if (boundary_node == null) {
    return E.left({
      type: 'boundary_mapping_node_not_found',
      graph_id: nested_graph_id,
      direction,
      slot_id: handle,
      node_id: boundary.node_id,
    });
  }
  if (boundary_node.graph_id !== nested_graph_id) {
    return E.left({
      type: 'boundary_mapping_node_graph_mismatch',
      graph_id: nested_graph_id,
      direction,
      slot_id: handle,
      node_id: boundary.node_id,
      node_graph_id: boundary_node.graph_id,
    });
  }
  if (!node_has_port(boundary_node, direction, boundary.port_id)) {
    return E.left({
      type: 'boundary_mapping_port_not_found',
      graph_id: nested_graph_id,
      direction,
      slot_id: handle,
      node_id: boundary.node_id,
      port_id: boundary.port_id,
    });
  }

  const nested_context_result = extend_scope_context(
    document,
    context,
    node,
    nested_graph_id,
  );
  if (E.isLeft(nested_context_result)) {
    return nested_context_result;
  }
  return resolve_endpoint(
    document,
    nested_context_result.right,
    binding_id,
    boundary.node_id,
    boundary.port_id,
    direction,
  );
};

const flatten_scope_instance = (
  document: GraphDocument,
  context: ScopeContext,
): E.Either<GraphFlattenError, FlatAccumulator> => {
  if (document.graphs[context.graph_id] == null) {
    return E.left({ type: 'graph_not_found', graph_id: context.graph_id });
  }
  const duplicate_result = check_duplicate_boundary_mappings(document, context.graph_id);
  if (E.isLeft(duplicate_result)) {
    return duplicate_result;
  }

  let nodes: Readonly<Record<string, FlattenedGraphNode>> = {};
  let bindings: Readonly<Record<string, FlattenedGraphBinding>> = {};

  const graph_node_ids = Object.values(document.nodes)
    .filter(node => node.graph_id === context.graph_id)
    .map(node => node.id)
    .sort();
  for (const node_id of graph_node_ids) {
    const node = document.nodes[node_id];
    if (node == null) {
      return E.left({ type: 'node_not_found', node_id, graph_id: context.graph_id });
    }

    if (node.nested_graph_id == null) {
      const instance_id = make_flat_id(context, node.id);
      const flat_node: FlattenedGraphNode = {
        instance_id,
        scope_steps: context.steps,
        graph_id: node.graph_id,
        node_id: node.id,
        node,
      };
      nodes = { ...nodes, [instance_id]: flat_node };
      continue;
    }

    const nested_context_result = extend_scope_context(
      document,
      context,
      node,
      node.nested_graph_id,
    );
    if (E.isLeft(nested_context_result)) {
      return nested_context_result;
    }
    const nested_result = flatten_scope_instance(document, nested_context_result.right);
    if (E.isLeft(nested_result)) {
      return nested_result;
    }
    const merged = merge_accumulator(
      { nodes, bindings },
      nested_result.right,
    );
    nodes = merged.nodes;
    bindings = merged.bindings;
  }

  const graph_binding_ids = Object.values(document.bindings)
    .filter(binding => binding.graph_id === context.graph_id)
    .map(binding => binding.id)
    .sort();
  for (const binding_id of graph_binding_ids) {
    const binding = document.bindings[binding_id];
    if (binding == null) {
      continue;
    }
    const source_result = resolve_endpoint(
      document,
      context,
      binding.id,
      binding.source_id,
      binding.source_handle,
      'output',
    );
    if (E.isLeft(source_result)) {
      return source_result;
    }
    const target_result = resolve_endpoint(
      document,
      context,
      binding.id,
      binding.target_id,
      binding.target_handle,
      'input',
    );
    if (E.isLeft(target_result)) {
      return target_result;
    }

    const flat_binding_id = make_flat_binding_id(context, binding);
    const flat_binding: FlattenedGraphBinding = {
      id: flat_binding_id,
      source_instance_id: source_result.right.instance_id,
      source_handle: source_result.right.handle,
      target_instance_id: target_result.right.instance_id,
      target_handle: target_result.right.handle,
    };
    bindings = { ...bindings, [flat_binding_id]: flat_binding };
  }

  return E.right({ nodes, bindings });
};

/**
 * 从 root 开始把 GraphDocument 编译成扁平执行图视图。
 * host 节点会展开为其指向的 scope；跨 host 的 binding 端点沿 boundary_bindings 穿透到真实节点端口。
 * @param document - 原 GraphDocument
 * @returns 扁平图，或 GraphFlattenError
 */
export const flatten_graph_document = (
  document: GraphDocument,
): E.Either<GraphFlattenError, FlattenedGraph> => {
  const root_context_result = create_root_context(document);
  if (E.isLeft(root_context_result)) {
    return root_context_result;
  }
  const flattened_result = flatten_scope_instance(document, root_context_result.right);
  if (E.isLeft(flattened_result)) {
    return flattened_result;
  }
  return E.right({
    nodes: flattened_result.right.nodes,
    bindings: flattened_result.right.bindings,
  });
};
