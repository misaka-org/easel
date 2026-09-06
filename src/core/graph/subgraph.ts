import type { Port } from '../types';
import type { Vec2 } from '../math';
import type { GraphDocumentError } from './document';
import type {
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

export type { GraphDocumentError };

export type PackNodesOptions = {
  readonly source_graph_id: GraphId;
  readonly node_ids: readonly NodeId[];
  readonly graph_id: GraphId;
  readonly host_node_id: NodeId;
  readonly host_type?: string;
  readonly host_title?: string;
  readonly position?: Vec2;
  readonly size?: Vec2;
};

type CrossingEntry = {
  readonly binding: GraphBindingRecord;
  readonly slot_id: string;
};

const sort_bindings = (bindings: readonly GraphBindingRecord[]): GraphBindingRecord[] => {
  return [...bindings].sort((left, right) => {
    if (left.id < right.id) {
      return -1;
    }
    if (left.id > right.id) {
      return 1;
    }
    return 0;
  });
};

const get_output_port = (
  document: GraphDocument,
  node_id: NodeId,
  handle: string,
): Port | undefined => {
  const node = document.nodes[node_id];
  return node == null ? undefined : node.outputs.find(port => port.id === handle);
};

const get_input_port = (
  document: GraphDocument,
  node_id: NodeId,
  handle: string,
): Port | undefined => {
  const node = document.nodes[node_id];
  return node == null ? undefined : node.inputs.find(port => port.id === handle);
};

const build_input_slots = (
  document: GraphDocument,
  entries: readonly CrossingEntry[],
): E.Either<GraphDocumentError, readonly GraphSlot[]> => {
  const slots: GraphSlot[] = [];
  for (const entry of entries) {
    const target_port = get_input_port(
      document,
      entry.binding.target_id,
      entry.binding.target_handle,
    );
    if (target_port == null) {
      return E.left({
        type: 'target_port_not_found',
        binding_id: entry.binding.id,
        node_id: entry.binding.target_id,
        handle: entry.binding.target_handle,
      });
    }

    slots.push({
      id: entry.slot_id,
      label: target_port.label,
      value_type: target_port.value_type,
      accepts: target_port.accepts,
      required: target_port.required,
    });
  }
  return E.right(slots);
};

const build_output_slots = (
  document: GraphDocument,
  entries: readonly CrossingEntry[],
): E.Either<GraphDocumentError, readonly GraphSlot[]> => {
  const slots: GraphSlot[] = [];
  for (const entry of entries) {
    const source_port = get_output_port(
      document,
      entry.binding.source_id,
      entry.binding.source_handle,
    );
    if (source_port == null) {
      return E.left({
        type: 'source_port_not_found',
        binding_id: entry.binding.id,
        node_id: entry.binding.source_id,
        handle: entry.binding.source_handle,
      });
    }

    slots.push({
      id: entry.slot_id,
      label: source_port.label,
      value_type: source_port.value_type,
    });
  }
  return E.right(slots);
};

const boundary_id = (
  graph_id: GraphId,
  direction: 'input' | 'output',
  index: number,
): BoundaryId => {
  return `${graph_id}:${direction}:${index}`;
};

const make_boundary = (
  document: GraphDocument,
  entry: CrossingEntry,
  graph_id: GraphId,
  direction: 'input' | 'output',
  index: number,
): E.Either<GraphDocumentError, GraphBoundaryBinding> => {
  const binding = entry.binding;
  if (direction === 'input') {
    const target_port = get_input_port(document, binding.target_id, binding.target_handle);
    if (target_port == null) {
      return E.left({
        type: 'target_port_not_found',
        binding_id: binding.id,
        node_id: binding.target_id,
        handle: binding.target_handle,
      });
    }
    return E.right({
      id: boundary_id(graph_id, direction, index),
      graph_id,
      direction,
      slot_id: entry.slot_id,
      node_id: binding.target_id,
      port_id: binding.target_handle,
    });
  }

  const source_port = get_output_port(document, binding.source_id, binding.source_handle);
  if (source_port == null) {
    return E.left({
      type: 'source_port_not_found',
      binding_id: binding.id,
      node_id: binding.source_id,
      handle: binding.source_handle,
    });
  }
  return E.right({
    id: boundary_id(graph_id, direction, index),
    graph_id,
    direction,
    slot_id: entry.slot_id,
    node_id: binding.source_id,
    port_id: binding.source_handle,
  });
};

const slot_to_input_port = (slot: GraphSlot): Port => {
  return {
    id: slot.id,
    label: slot.label,
    type: 'input',
    value_type: slot.value_type,
    accepts: slot.accepts,
    required: slot.required,
  };
};

const slot_to_output_port = (slot: GraphSlot): Port => {
  return {
    id: slot.id,
    label: slot.label,
    type: 'output',
    value_type: slot.value_type,
  };
};

const create_boundary_bindings = (
  document: GraphDocument,
  input_entries: readonly CrossingEntry[],
  output_entries: readonly CrossingEntry[],
  graph_id: GraphId,
): E.Either<GraphDocumentError, Readonly<Record<BoundaryId, GraphBoundaryBinding>>> => {
  const boundaries: Record<BoundaryId, GraphBoundaryBinding> = {};
  for (const [index, entry] of input_entries.entries()) {
    const result = make_boundary(document, entry, graph_id, 'input', index);
    if (E.isLeft(result)) {
      return result;
    }
    boundaries[result.right.id] = result.right;
  }
  for (const [index, entry] of output_entries.entries()) {
    const result = make_boundary(document, entry, graph_id, 'output', index);
    if (E.isLeft(result)) {
      return result;
    }
    boundaries[result.right.id] = result.right;
  }
  return E.right(boundaries);
};

const find_crossing_entry = (
  entries: readonly CrossingEntry[],
  binding_id: string,
): CrossingEntry | undefined => {
  return entries.find(entry => entry.binding.id === binding_id);
};

export const pack_nodes = (
  document: GraphDocument,
  options: PackNodesOptions,
): E.Either<GraphDocumentError, GraphDocument> => {
  const source_graph_id = options.source_graph_id;
  if (document.graphs[source_graph_id] == null) {
    return E.left({ type: 'graph_not_found', graph_id: source_graph_id });
  }

  if (options.node_ids.length === 0) {
    return E.left({ type: 'empty_node_selection', source_graph_id });
  }

  if (options.graph_id === options.host_node_id) {
    return E.left({ type: 'invalid_arguments' });
  }

  const selected_ids = new Set(options.node_ids);
  if (selected_ids.has(options.host_node_id)) {
    return E.left({ type: 'host_node_in_selection', host_node_id: options.host_node_id });
  }

  if (document.graphs[options.graph_id] != null) {
    return E.left({ type: 'graph_already_exists', graph_id: options.graph_id });
  }
  if (document.nodes[options.graph_id] != null) {
    return E.left({ type: 'duplicate_node_id', node_id: options.graph_id });
  }
  if (document.nodes[options.host_node_id] != null) {
    return E.left({ type: 'duplicate_node_id', node_id: options.host_node_id });
  }
  if (document.graphs[options.host_node_id] != null) {
    return E.left({ type: 'graph_already_exists', graph_id: options.host_node_id });
  }

  for (const node_id of options.node_ids) {
    const node = document.nodes[node_id];
    if (node == null) {
      return E.left({ type: 'node_not_found', node_id });
    }
    if (node.graph_id !== source_graph_id) {
      return E.left({
        type: 'node_not_in_source_graph',
        node_id,
        node_graph_id: node.graph_id,
        source_graph_id,
      });
    }
  }

  const source_bindings = sort_bindings(
    Object.values(document.bindings).filter(binding => binding.graph_id === source_graph_id),
  );
  const input_crossings = source_bindings.filter(
    binding => !selected_ids.has(binding.source_id) && selected_ids.has(binding.target_id),
  );
  const output_crossings = source_bindings.filter(
    binding => selected_ids.has(binding.source_id) && !selected_ids.has(binding.target_id),
  );
  const input_entries: CrossingEntry[] = input_crossings.map((binding, index) => ({
    binding,
    slot_id: `input_${index}`,
  }));
  const output_entries: CrossingEntry[] = output_crossings.map((binding, index) => ({
    binding,
    slot_id: `output_${index}`,
  }));

  const input_slots_result = build_input_slots(document, input_entries);
  if (E.isLeft(input_slots_result)) {
    return input_slots_result;
  }
  const output_slots_result = build_output_slots(document, output_entries);
  if (E.isLeft(output_slots_result)) {
    return output_slots_result;
  }
  const boundary_result = create_boundary_bindings(
    document,
    input_entries,
    output_entries,
    options.graph_id,
  );
  if (E.isLeft(boundary_result)) {
    return boundary_result;
  }

  const moved_nodes = Array.from(selected_ids).reduce<Record<NodeId, GraphNodeRecord>>(
    (acc, node_id) => {
      const node = document.nodes[node_id];
      if (node == null) {
        return acc;
      }
      return { ...acc, [node_id]: { ...node, graph_id: options.graph_id } };
    },
    {},
  );

  const host_type = options.host_type ?? 'subgraph';
  const host_title = options.host_title ?? options.host_node_id;
  const host_node: GraphNodeRecord = {
    id: options.host_node_id,
    graph_id: source_graph_id,
    nested_graph_id: options.graph_id,
    type: host_type,
    position: options.position ?? { x: 0, y: 0 },
    size: options.size ?? { x: 200, y: 120 },
    title: host_title,
    inputs: input_slots_result.right.map(slot_to_input_port),
    outputs: output_slots_result.right.map(slot_to_output_port),
    custom_data: {},
  };

  const next_nodes = {
    ...document.nodes,
    ...moved_nodes,
    [host_node.id]: host_node,
  };

  const next_bindings: Record<string, GraphBindingRecord> = {};
  for (const binding of Object.values(document.bindings)) {
    if (binding.graph_id !== source_graph_id) {
      next_bindings[binding.id] = binding;
      continue;
    }

    const source_selected = selected_ids.has(binding.source_id);
    const target_selected = selected_ids.has(binding.target_id);
    if (source_selected && target_selected) {
      next_bindings[binding.id] = { ...binding, graph_id: options.graph_id };
      continue;
    }
    if (source_selected) {
      const entry = find_crossing_entry(output_entries, binding.id);
      if (entry == null) {
        next_bindings[binding.id] = binding;
        continue;
      }
      next_bindings[binding.id] = {
        id: binding.id,
        graph_id: source_graph_id,
        source_id: host_node.id,
        source_handle: entry.slot_id,
        target_id: binding.target_id,
        target_handle: binding.target_handle,
      };
      continue;
    }
    if (target_selected) {
      const entry = find_crossing_entry(input_entries, binding.id);
      if (entry == null) {
        next_bindings[binding.id] = binding;
        continue;
      }
      next_bindings[binding.id] = {
        id: binding.id,
        graph_id: source_graph_id,
        source_id: binding.source_id,
        source_handle: binding.source_handle,
        target_id: host_node.id,
        target_handle: entry.slot_id,
      };
      continue;
    }
    next_bindings[binding.id] = binding;
  }

  const subgraph_scope: GraphScope = {
    id: options.graph_id,
    kind: 'subgraph',
    parent_graph_id: source_graph_id,
    title: host_title,
    input_slots: input_slots_result.right,
    output_slots: output_slots_result.right,
  };

  let graphs: Readonly<Record<GraphId, GraphScope>> = {
    ...document.graphs,
    [options.graph_id]: subgraph_scope,
  };
  for (const node_id of selected_ids) {
    const node = document.nodes[node_id];
    if (node == null || node.nested_graph_id == null) {
      continue;
    }
    const nested_graph = document.graphs[node.nested_graph_id];
    if (nested_graph != null) {
      graphs = {
        ...graphs,
        [node.nested_graph_id]: { ...nested_graph, parent_graph_id: options.graph_id },
      };
    }
  }

  return E.right({
    ...document,
    graphs,
    nodes: next_nodes,
    bindings: next_bindings,
    boundary_bindings: {
      ...document.boundary_bindings,
      ...boundary_result.right,
    },
  });
};

export const unpack_subgraph = (
  document: GraphDocument,
  host_node_id: NodeId,
): E.Either<GraphDocumentError, GraphDocument> => {
  const host_node = document.nodes[host_node_id];
  if (host_node == null) {
    return E.left({ type: 'node_not_found', node_id: host_node_id });
  }
  if (host_node.nested_graph_id == null) {
    return E.left({ type: 'nested_graph_required', node_id: host_node_id });
  }

  const child_graph_id = host_node.nested_graph_id;
  const child_graph = document.graphs[child_graph_id];
  if (child_graph == null) {
    return E.left({
      type: 'nested_graph_not_found',
      node_id: host_node_id,
      graph_id: child_graph_id,
    });
  }
  if (child_graph_id === document.root_graph_id) {
    return E.left({ type: 'cannot_remove_root', graph_id: child_graph_id });
  }

  const other_host_node_ids = Object.values(document.nodes)
    .filter(node => node.id !== host_node_id && node.nested_graph_id === child_graph_id)
    .map(node => node.id);
  if (other_host_node_ids.length > 0) {
    return E.left({
      type: 'graph_still_has_hosts',
      graph_id: child_graph_id,
      host_node_ids: other_host_node_ids,
    });
  }

  const host_graph = document.graphs[host_node.graph_id];
  if (host_graph == null) {
    return E.left({ type: 'graph_not_found', graph_id: host_node.graph_id });
  }

  const boundary_by_slot = new Map<string, GraphBoundaryBinding>();
  for (const boundary of Object.values(document.boundary_bindings)) {
    if (boundary.graph_id === child_graph_id) {
      boundary_by_slot.set(boundary.slot_id, boundary);
    }
  }

  const host_input_ports = new Set(host_node.inputs.map(port => port.id));
  const host_output_ports = new Set(host_node.outputs.map(port => port.id));
  const restored_bindings: Record<string, GraphBindingRecord> = {};
  for (const binding of Object.values(document.bindings)) {
    if (binding.graph_id !== host_node.graph_id) {
      continue;
    }
    if (binding.target_id === host_node_id) {
      if (!host_input_ports.has(binding.target_handle)) {
        return E.left({
          type: 'host_binding_missing_boundary',
          binding_id: binding.id,
          node_id: host_node_id,
          handle: binding.target_handle,
        });
      }
      const boundary = boundary_by_slot.get(binding.target_handle);
      if (boundary == null || boundary.direction !== 'input') {
        return E.left({
          type: 'host_binding_missing_boundary',
          binding_id: binding.id,
          node_id: host_node_id,
          handle: binding.target_handle,
        });
      }
      restored_bindings[binding.id] = {
        id: binding.id,
        graph_id: host_node.graph_id,
        source_id: binding.source_id,
        source_handle: binding.source_handle,
        target_id: boundary.node_id,
        target_handle: boundary.port_id,
      };
      continue;
    }
    if (binding.source_id === host_node_id) {
      if (!host_output_ports.has(binding.source_handle)) {
        return E.left({
          type: 'host_binding_missing_boundary',
          binding_id: binding.id,
          node_id: host_node_id,
          handle: binding.source_handle,
        });
      }
      const boundary = boundary_by_slot.get(binding.source_handle);
      if (boundary == null || boundary.direction !== 'output') {
        return E.left({
          type: 'host_binding_missing_boundary',
          binding_id: binding.id,
          node_id: host_node_id,
          handle: binding.source_handle,
        });
      }
      restored_bindings[binding.id] = {
        id: binding.id,
        graph_id: host_node.graph_id,
        source_id: boundary.node_id,
        source_handle: boundary.port_id,
        target_id: binding.target_id,
        target_handle: binding.target_handle,
      };
    }
  }

  const next_nodes: Record<NodeId, GraphNodeRecord> = {};
  for (const node of Object.values(document.nodes)) {
    if (node.id === host_node_id) {
      continue;
    }
    if (node.graph_id === child_graph_id) {
      next_nodes[node.id] = { ...node, graph_id: host_node.graph_id };
      continue;
    }
    next_nodes[node.id] = node;
  }

  const next_bindings: Record<string, GraphBindingRecord> = {};
  for (const binding of Object.values(document.bindings)) {
    if (binding.graph_id === child_graph_id) {
      next_bindings[binding.id] = { ...binding, graph_id: host_node.graph_id };
      continue;
    }
    if (restored_bindings[binding.id] != null) {
      continue;
    }
    next_bindings[binding.id] = binding;
  }
  for (const binding of Object.values(restored_bindings)) {
    next_bindings[binding.id] = binding;
  }

  const graphs = Object.values(document.graphs).reduce<Readonly<Record<GraphId, GraphScope>>>(
    (acc, graph) => {
      if (graph.id === child_graph_id) {
        return acc;
      }
      if (graph.parent_graph_id === child_graph_id) {
        return { ...acc, [graph.id]: { ...graph, parent_graph_id: host_node.graph_id } };
      }
      return { ...acc, [graph.id]: graph };
    },
    {},
  );
  const cleaned_boundaries = Object.values(document.boundary_bindings)
    .filter(boundary => boundary.graph_id !== child_graph_id)
    .reduce<Readonly<Record<BoundaryId, GraphBoundaryBinding>>>(
      (acc, boundary) => ({ ...acc, [boundary.id]: boundary }),
      {},
    );

  return E.right({
    ...document,
    graphs,
    nodes: next_nodes,
    bindings: next_bindings,
    boundary_bindings: cleaned_boundaries,
  });
};
