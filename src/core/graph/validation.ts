import type {
  GraphDocument,
  GraphId,
  GraphNodeRecord,
  GraphScope,
} from './types';
import * as E from 'fp-ts/Either';

export type GraphValidationIssuePath = string;

export type GraphValidationIssue = {
  readonly path: GraphValidationIssuePath;
  readonly message: string;
};

const push_issue = (
  issues: GraphValidationIssue[],
  path: string,
  message: string,
): void => {
  issues.push({ path, message });
};

const has_same_ids = (left: readonly string[], right: readonly string[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((id, index) => id === right[index]);
};

const find_port = (
  node: GraphNodeRecord,
  direction: 'input' | 'output',
  port_id: string,
): boolean => {
  const ports = direction === 'input' ? node.inputs : node.outputs;
  return ports.some(port => port.id === port_id);
};

const has_slot = (graph: GraphScope, direction: 'input' | 'output', slot_id: string): boolean => {
  const slots = direction === 'input' ? graph.input_slots : graph.output_slots;
  return slots.some(slot => slot.id === slot_id);
};

const push_duplicate_slot_issue = (
  issues: GraphValidationIssue[],
  path: string,
  direction: string,
  slot_id: string,
): void => {
  push_issue(issues, path, `duplicate ${direction} slot id '${slot_id}'`);
};

export const validate_graph_document = (
  document: GraphDocument,
): E.Either<readonly GraphValidationIssue[], true> => {
  const issues: GraphValidationIssue[] = [];
  const graph_ids = new Set<string>();

  const root_graph = document.graphs[document.root_graph_id];
  if (root_graph == null) {
    push_issue(
      issues,
      'root_graph_id',
      `root graph '${document.root_graph_id}' is missing from graphs`,
    );
  } else {
    if (root_graph.kind !== 'root') {
      push_issue(issues, `graphs.${document.root_graph_id}.kind`, 'root graph kind must be root');
    }
    if (root_graph.parent_graph_id != null) {
      push_issue(
        issues,
        `graphs.${document.root_graph_id}.parent_graph_id`,
        'root graph must not have a parent_graph_id',
      );
    }
  }

  for (const [key, graph] of Object.entries(document.graphs)) {
    const graph_path = `graphs.${key}`;
    if (graph.id !== key) {
      push_issue(issues, `${graph_path}.id`, `graph key '${key}' does not match graph.id '${graph.id}'`);
    }
    if (graph_ids.has(graph.id)) {
      push_issue(issues, `${graph_path}.id`, `duplicate graph id '${graph.id}'`);
    }
    graph_ids.add(graph.id);

    if (graph.kind !== 'root' && graph.kind !== 'subgraph') {
      push_issue(
        issues,
        `${graph_path}.kind`,
        `graph kind '${String(graph.kind)}' must be 'root' or 'subgraph'`,
      );
      continue;
    }

    if (graph.kind === 'root') {
      if (graph.id !== document.root_graph_id) {
        push_issue(
          issues,
          `${graph_path}.kind`,
          `graph '${graph.id}' must not use kind root because root_graph_id is '${document.root_graph_id}'`,
        );
      }
      continue;
    }

    if (graph.parent_graph_id == null) {
      push_issue(issues, `${graph_path}.parent_graph_id`, 'subgraph must have a parent_graph_id');
    } else if (document.graphs[graph.parent_graph_id] == null) {
      push_issue(
        issues,
        `${graph_path}.parent_graph_id`,
        `parent graph '${graph.parent_graph_id}' does not exist`,
      );
    }

    const seen_input_slot_ids = new Set<string>();
    for (const [index, slot] of graph.input_slots.entries()) {
      if (seen_input_slot_ids.has(slot.id)) {
        push_duplicate_slot_issue(
          issues,
          `${graph_path}.input_slots.${index}.id`,
          'input',
          slot.id,
        );
      }
      seen_input_slot_ids.add(slot.id);
    }

    const seen_output_slot_ids = new Set<string>();
    for (const [index, slot] of graph.output_slots.entries()) {
      if (seen_output_slot_ids.has(slot.id)) {
        push_duplicate_slot_issue(
          issues,
          `${graph_path}.output_slots.${index}.id`,
          'output',
          slot.id,
        );
      }
      seen_output_slot_ids.add(slot.id);
    }
  }

  const visited_graphs = new Set<string>();
  for (const start_id of Object.keys(document.graphs)) {
    if (visited_graphs.has(start_id)) {
      continue;
    }

    const local_order = new Map<GraphId, number>();
    const trail: GraphId[] = [];
    let current: GraphId | undefined = start_id;
    while (current != null && document.graphs[current] != null) {
      if (local_order.has(current)) {
        const cycle_start = local_order.get(current) ?? 0;
        const cycle = trail.slice(cycle_start);
        cycle.push(current);
        push_issue(
          issues,
          `graphs.${cycle[0]}.parent_graph_id`,
          `scope hierarchy contains a cycle: ${cycle.join(' -> ')}`,
        );
        break;
      }
      local_order.set(current, trail.length);
      trail.push(current);
      current = document.graphs[current].parent_graph_id;
    }
    for (const graph_id of local_order.keys()) {
      visited_graphs.add(graph_id);
    }
  }

  const node_ids = new Set<string>();
  for (const [key, node] of Object.entries(document.nodes)) {
    const node_path = `nodes.${key}`;
    if (node.id !== key) {
      push_issue(issues, `${node_path}.id`, `node key '${key}' does not match node.id '${node.id}'`);
    }
    if (node_ids.has(node.id)) {
      push_issue(issues, `${node_path}.id`, `duplicate node id '${node.id}'`);
    }
    node_ids.add(node.id);

    if (!graph_ids.has(node.graph_id)) {
      push_issue(
        issues,
        `${node_path}.graph_id`,
        `node graph '${node.graph_id}' does not exist`,
      );
    }
    if (node.nested_graph_id != null && !graph_ids.has(node.nested_graph_id)) {
      push_issue(
        issues,
        `${node_path}.nested_graph_id`,
        `host graph '${node.nested_graph_id}' does not exist`,
      );
    }
  }

  const binding_ids = new Set<string>();
  for (const [key, binding] of Object.entries(document.bindings)) {
    const binding_path = `bindings.${key}`;
    if (binding.id !== key) {
      push_issue(
        issues,
        `${binding_path}.id`,
        `binding key '${key}' does not match binding.id '${binding.id}'`,
      );
    }
    if (binding_ids.has(binding.id)) {
      push_issue(issues, `${binding_path}.id`, `duplicate binding id '${binding.id}'`);
    }
    binding_ids.add(binding.id);

    if (!graph_ids.has(binding.graph_id)) {
      push_issue(
        issues,
        `${binding_path}.graph_id`,
        `binding graph '${binding.graph_id}' does not exist`,
      );
    }

    const source_node = document.nodes[binding.source_id];
    if (source_node == null) {
      push_issue(
        issues,
        `${binding_path}.source_id`,
        `binding source node '${binding.source_id}' does not exist`,
      );
    } else if (source_node.graph_id !== binding.graph_id) {
      push_issue(
        issues,
        `${binding_path}.graph_id`,
        `binding graph does not match source node graph for '${binding.source_id}'`,
      );
    } else if (!find_port(source_node, 'output', binding.source_handle)) {
      push_issue(
        issues,
        `${binding_path}.source_handle`,
        `source handle '${binding.source_handle}' is not an output port of node '${binding.source_id}'`,
      );
    }

    const target_node = document.nodes[binding.target_id];
    if (target_node == null) {
      push_issue(
        issues,
        `${binding_path}.target_id`,
        `binding target node '${binding.target_id}' does not exist`,
      );
    } else if (target_node.graph_id !== binding.graph_id) {
      push_issue(
        issues,
        `${binding_path}.graph_id`,
        `binding graph does not match target node graph for '${binding.target_id}'`,
      );
    } else if (!find_port(target_node, 'input', binding.target_handle)) {
      push_issue(
        issues,
        `${binding_path}.target_handle`,
        `target handle '${binding.target_handle}' is not an input port of node '${binding.target_id}'`,
      );
    }
  }

  const boundary_ids = new Set<string>();
  const seen_boundary_mapping_keys = new Set<string>();
  for (const [key, boundary] of Object.entries(document.boundary_bindings)) {
    const boundary_path = `boundary_bindings.${key}`;
    if (boundary.id !== key) {
      push_issue(
        issues,
        `${boundary_path}.id`,
        `boundary key '${key}' does not match boundary.id '${boundary.id}'`,
      );
    }
    if (boundary_ids.has(boundary.id)) {
      push_issue(issues, `${boundary_path}.id`, `duplicate boundary id '${boundary.id}'`);
    }
    boundary_ids.add(boundary.id);

    if (boundary.direction !== 'input' && boundary.direction !== 'output') {
      push_issue(
        issues,
        `${boundary_path}.direction`,
        `boundary direction '${String(boundary.direction)}' must be 'input' or 'output'`,
      );
      continue;
    }

    if (!graph_ids.has(boundary.graph_id)) {
      push_issue(
        issues,
        `${boundary_path}.graph_id`,
        `boundary graph '${boundary.graph_id}' does not exist`,
      );
      continue;
    }

    const graph = document.graphs[boundary.graph_id];
    if (graph == null) {
      continue;
    }

    const mapping_key = `${boundary.graph_id}:${boundary.direction}:${boundary.slot_id}`;
    if (seen_boundary_mapping_keys.has(mapping_key)) {
      push_issue(
        issues,
        `${boundary_path}.slot_id`,
        `duplicate boundary mapping for graph '${boundary.graph_id}' ${boundary.direction} slot '${boundary.slot_id}'`,
      );
    }
    seen_boundary_mapping_keys.add(mapping_key);

    if (!has_slot(graph, boundary.direction, boundary.slot_id)) {
      push_issue(
        issues,
        `${boundary_path}.slot_id`,
        `boundary slot '${boundary.slot_id}' is not an ${boundary.direction} slot of graph '${boundary.graph_id}'`,
      );
    }

    const node = document.nodes[boundary.node_id];
    if (node == null) {
      push_issue(
        issues,
        `${boundary_path}.node_id`,
        `boundary node '${boundary.node_id}' does not exist`,
      );
    } else {
      if (node.graph_id !== boundary.graph_id) {
        push_issue(
          issues,
          `${boundary_path}.graph_id`,
          `boundary node '${boundary.node_id}' is not in graph '${boundary.graph_id}'`,
        );
      }
      if (!find_port(node, boundary.direction, boundary.port_id)) {
        push_issue(
          issues,
          `${boundary_path}.port_id`,
          `boundary ${boundary.direction} port '${boundary.port_id}' is not a ${boundary.direction} port of node '${boundary.node_id}'`,
        );
      }
    }
  }

  for (const node of Object.values(document.nodes)) {
    if (node.nested_graph_id == null) {
      continue;
    }
    const nested_graph = document.graphs[node.nested_graph_id];
    if (nested_graph == null) {
      continue;
    }

    if (nested_graph.id === document.root_graph_id) {
      push_issue(
        issues,
        `nodes.${node.id}.nested_graph_id`,
        `host must not reference root graph '${nested_graph.id}'`,
      );
    } else if (nested_graph.kind !== 'subgraph') {
      push_issue(
        issues,
        `nodes.${node.id}.nested_graph_id`,
        `host nested graph '${nested_graph.id}' must have kind subgraph, got '${String(nested_graph.kind)}'`,
      );
    }
    if (nested_graph.parent_graph_id !== node.graph_id) {
      push_issue(
        issues,
        `nodes.${node.id}.nested_graph_id`,
        `host nested graph parent '${String(nested_graph.parent_graph_id)}' does not match node graph '${node.graph_id}'`,
      );
    }

    const host_input_ids = node.inputs.map(port => port.id);
    const scope_input_ids = nested_graph.input_slots.map(slot => slot.id);
    if (!has_same_ids(host_input_ids, scope_input_ids)) {
      push_issue(
        issues,
        `nodes.${node.id}.inputs`,
        `host input port ids do not align with scope input_slots for '${node.nested_graph_id}'`,
      );
    }

    const host_output_ids = node.outputs.map(port => port.id);
    const scope_output_ids = nested_graph.output_slots.map(slot => slot.id);
    if (!has_same_ids(host_output_ids, scope_output_ids)) {
      push_issue(
        issues,
        `nodes.${node.id}.outputs`,
        `host output port ids do not align with scope output_slots for '${node.nested_graph_id}'`,
      );
    }
  }

  if (issues.length > 0) {
    return E.left(issues);
  }

  return E.right(true);
};
