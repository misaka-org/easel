// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import EventEmitter from 'eventemitter3';
import type { Easel } from '@/runtime/easel';
import type { EaselEvents } from '@/runtime/event_types';
import type { GraphDocument, GraphNodeRecord, NodeId } from '@/core/graph/types';
import type { GraphNode, Port } from '@/core/types';
import { add_graph, add_node, create_empty_graph_document } from '@/core/graph/document';
import type { DocumentController } from '@/runtime/document_controller';
import { create_document_controller } from '@/runtime/document_controller';
import { setup_events } from '@/runtime/events';
import { Store } from '@/runtime/store';
import { ToolManager } from '@/runtime/tool_manager';
import { wire_plugin } from '@/plugins/wire';
import {
  document_boundary_add_port_id,
  project_document_bridge_view,
  type DocumentBridgeBinding,
  type DocumentBridgeView,
} from '@/runtime/document_bridge';
import {
  commit_document_boundary_binding,
  commit_document_boundary_edit,
  diff_document_boundary_wire_changes,
  mount_document_boundary_editor,
  translate_document_boundary_binding,
} from '@/runtime/document_boundary_editor';
import * as E from 'fp-ts/Either';

const port = (id: string, kind: 'input' | 'output'): Port => {
  return { id, label: id, type: kind, value_type: 'text' };
};

const make_node = (
  id: string,
  graph_id: string,
  inputs: readonly Port[] = [],
  outputs: readonly Port[] = [],
): GraphNodeRecord => {
  return {
    id,
    graph_id,
    type: 'default',
    position: { x: 100, y: 100 },
    size: { x: 120, y: 80 },
    title: id,
    inputs,
    outputs,
    custom_data: {},
  };
};

const unwrap_document = (result: E.Either<unknown, GraphDocument>): GraphDocument => {
  if (E.isLeft(result)) {
    throw new Error(`unexpected document error: ${String(result.left)}`);
  }
  return result.right;
};

const unwrap_controller = (result: E.Either<unknown, DocumentController>): DocumentController => {
  if (E.isLeft(result)) {
    throw new Error(`unexpected controller error: ${String(result.left)}`);
  }
  return result.right;
};

const make_controller_with_internal = (internal: GraphNodeRecord): DocumentController => {
  let document = unwrap_document(
    add_graph(create_empty_graph_document(), {
      id: 'child',
      kind: 'subgraph',
      parent_graph_id: 'root',
      title: 'Child',
      input_slots: [],
      output_slots: [],
    }),
  );
  document = unwrap_document(add_node(document, internal));
  const host: GraphNodeRecord = {
    ...make_node('host', 'root'),
    nested_graph_id: 'child',
  };
  document = unwrap_document(add_node(document, host));
  const controller = unwrap_controller(create_document_controller(document));
  const enter_result = controller.enter_subgraph('host');
  if (E.isLeft(enter_result)) {
    throw new Error(`unexpected enter error: ${String(enter_result.left)}`);
  }
  return controller;
};

const get_rail_node_id = (
  view: DocumentBridgeView,
  type: 'subgraph_input' | 'subgraph_output',
): NodeId => {
  const node_id = view.view_only_node_ids.find(node_id => view.nodes[node_id]?.type === type);
  if (node_id == null) {
    throw new Error(`missing ${type} rail`);
  }
  return node_id;
};

const make_binding = (
  source_id: string,
  source_handle: string,
  target_id: string,
  target_handle: string,
  id = 'temporary_boundary_binding',
): DocumentBridgeBinding => {
  return { id, source_id, source_handle, target_id, target_handle };
};

const add_boundary = (
  controller: DocumentController,
  direction: 'input' | 'output',
  node_id = 'internal',
  port_id = direction === 'input' ? 'in' : 'out',
): string => {
  const view = project_document_bridge_view(controller.view);
  const rail_node_id =
    direction === 'input'
      ? get_rail_node_id(view, 'subgraph_input')
      : get_rail_node_id(view, 'subgraph_output');
  const binding =
    direction === 'input'
      ? make_binding(rail_node_id, document_boundary_add_port_id, node_id, port_id)
      : make_binding(node_id, port_id, rail_node_id, document_boundary_add_port_id);
  const result = commit_document_boundary_binding(controller, view, binding);
  if (E.isLeft(result)) {
    throw new Error(`unexpected boundary add error: ${String(result.left)}`);
  }
  const slots =
    direction === 'input' ? controller.view.graph.input_slots : controller.view.graph.output_slots;
  const slot_id = slots[0]?.id;
  if (slot_id == null) {
    throw new Error(`expected ${direction} slot after add`);
  }
  return slot_id;
};

const find_mapping_binding = (
  view: DocumentBridgeView,
  direction: 'input' | 'output',
): DocumentBridgeBinding => {
  const binding = Object.values(view.bindings).find(binding => {
    if (!view.view_only_binding_ids.includes(binding.id)) {
      return false;
    }
    if (direction === 'input') {
      return view.nodes[binding.source_id]?.custom_data['boundary_direction'] === 'input';
    }
    return view.nodes[binding.target_id]?.custom_data['boundary_direction'] === 'output';
  });
  if (binding == null) {
    throw new Error(`missing ${direction} mapping binding`);
  }
  return binding;
};

describe('document boundary editor', () => {
  it('adds an input slot when a temporary input add wire reaches an internal input', () => {
    const controller = make_controller_with_internal(
      make_node('internal', 'child', [port('in', 'input')], [port('out', 'output')]),
    );
    const view = project_document_bridge_view(controller.view);
    const input_rail_id = get_rail_node_id(view, 'subgraph_input');
    const binding = make_binding(input_rail_id, document_boundary_add_port_id, 'internal', 'in');

    const result = commit_document_boundary_binding(controller, view, binding);
    if (E.isLeft(result)) {
      throw new Error(`unexpected add error: ${String(result.left)}`);
    }
    expect(controller.view.graph.input_slots[0]).toMatchObject({
      id: 'input_internal_in',
      label: 'in',
      value_type: 'text',
    });
    expect(controller.view.boundary_bindings['child:input:input_internal_in']).toMatchObject({
      graph_id: 'child',
      direction: 'input',
      node_id: 'internal',
      port_id: 'in',
    });
    expect(controller.document.nodes['host']?.inputs.map(port => port.id)).toEqual([
      'input_internal_in',
    ]);
  });

  it('adds an output slot when an internal output reaches the output add rail', () => {
    const controller = make_controller_with_internal(
      make_node('internal', 'child', [port('in', 'input')], [port('out', 'output')]),
    );
    const view = project_document_bridge_view(controller.view);
    const output_rail_id = get_rail_node_id(view, 'subgraph_output');
    const binding = make_binding('internal', 'out', output_rail_id, document_boundary_add_port_id);

    const result = commit_document_boundary_binding(controller, view, binding);
    if (E.isLeft(result)) {
      throw new Error(`unexpected add error: ${String(result.left)}`);
    }
    expect(controller.view.graph.output_slots[0]).toMatchObject({
      id: 'output_internal_out',
      label: 'out',
      value_type: 'text',
    });
    expect(controller.view.boundary_bindings['child:output:output_internal_out']).toMatchObject({
      graph_id: 'child',
      direction: 'output',
      node_id: 'internal',
      port_id: 'out',
    });
    expect(controller.document.nodes['host']?.outputs.map(port => port.id)).toEqual([
      'output_internal_out',
    ]);
  });

  it('remaps an existing input slot instead of adding another slot', () => {
    const controller = make_controller_with_internal(
      make_node('first', 'child', [port('first_in', 'input')], [port('first_out', 'output')]),
    );
    const add_result = controller.add_node(
      make_node('second', 'child', [port('second_in', 'input')], [port('second_out', 'output')]),
    );
    if (E.isLeft(add_result)) {
      throw new Error(`unexpected add node error: ${String(add_result.left)}`);
    }

    let view = project_document_bridge_view(controller.view);
    const input_rail_id = get_rail_node_id(view, 'subgraph_input');
    const add_binding = make_binding(
      input_rail_id,
      document_boundary_add_port_id,
      'first',
      'first_in',
    );
    const add_commit = commit_document_boundary_binding(controller, view, add_binding);
    if (E.isLeft(add_commit)) {
      throw new Error(`unexpected add error: ${String(add_commit.left)}`);
    }
    const slot_id = controller.view.graph.input_slots[0]?.id;
    if (slot_id == null) {
      throw new Error('expected input slot after add');
    }

    view = project_document_bridge_view(controller.view);
    const remap_binding = make_binding(input_rail_id, slot_id, 'second', 'second_in');
    const remap_result = commit_document_boundary_binding(controller, view, remap_binding);
    if (E.isLeft(remap_result)) {
      throw new Error(`unexpected remap error: ${JSON.stringify(remap_result.left)}`);
    }
    expect(controller.view.graph.input_slots).toHaveLength(1);
    expect(controller.view.boundary_bindings[`child:input:${slot_id}`]).toMatchObject({
      node_id: 'second',
      port_id: 'second_in',
    });
    expect(controller.view.graph.output_slots).toHaveLength(0);
  });

  it('translates deleted view-only input/output wires into boundary removals', () => {
    const controller = make_controller_with_internal(
      make_node('internal', 'child', [port('in', 'input')], [port('out', 'output')]),
    );
    const input_slot_id = add_boundary(controller, 'input');
    const output_slot_id = add_boundary(controller, 'output');
    const view = project_document_bridge_view(controller.view);
    const baseline_bindings = Object.values(view.bindings);
    const input_binding = find_mapping_binding(view, 'input');
    const output_binding = find_mapping_binding(view, 'output');

    const input_changes = diff_document_boundary_wire_changes(
      view,
      baseline_bindings,
      view,
      baseline_bindings.filter(binding => binding.id !== input_binding.id),
    );
    expect(input_changes).toEqual([{ kind: 'remove', direction: 'input', slot_id: input_slot_id }]);

    const output_changes = diff_document_boundary_wire_changes(
      view,
      baseline_bindings,
      view,
      baseline_bindings.filter(binding => binding.id !== output_binding.id),
    );
    expect(output_changes).toEqual([
      { kind: 'remove', direction: 'output', slot_id: output_slot_id },
    ]);
  });

  it('treats delete-and-reconnect of the same slot as remap, not removal', () => {
    const controller = make_controller_with_internal(
      make_node('first', 'child', [port('first_in', 'input')], [port('first_out', 'output')]),
    );
    const add_result = controller.add_node(
      make_node('second', 'child', [port('second_in', 'input')], [port('second_out', 'output')]),
    );
    if (E.isLeft(add_result)) {
      throw new Error(`unexpected add node error: ${String(add_result.left)}`);
    }
    const input_slot_id = add_boundary(controller, 'input', 'first', 'first_in');
    const view = project_document_bridge_view(controller.view);
    const input_rail_id = get_rail_node_id(view, 'subgraph_input');
    const input_binding = find_mapping_binding(view, 'input');
    const replacement = make_binding(
      input_rail_id,
      input_slot_id,
      'second',
      'second_in',
      'temporary_remap_binding',
    );
    const latest_bindings = Object.values(view.bindings)
      .filter(binding => binding.id !== input_binding.id)
      .concat(replacement);

    const changes = diff_document_boundary_wire_changes(
      view,
      Object.values(view.bindings),
      view,
      latest_bindings,
    );
    expect(changes).toEqual([
      {
        kind: 'remap',
        direction: 'input',
        slot_id: input_slot_id,
        mapping: { node_id: 'second', port_id: 'second_in' },
      },
    ]);
    const first_change = changes[0];
    if (first_change == null) {
      throw new Error('expected a remap change');
    }
    const commit_result = commit_document_boundary_edit(controller, first_change);
    if (E.isLeft(commit_result)) {
      throw new Error(`unexpected remap diff error: ${String(commit_result.left)}`);
    }
    expect(controller.view.boundary_bindings[`child:input:${input_slot_id}`]).toMatchObject({
      node_id: 'second',
      port_id: 'second_in',
    });
  });

  it('does not create a removal for a deleted non-view-only wire', () => {
    const controller = make_controller_with_internal(
      make_node('first', 'child', [port('in', 'input')], [port('out', 'output')]),
    );
    const add_result = controller.add_node(make_node('second', 'child', [port('in', 'input')], []));
    if (E.isLeft(add_result)) {
      throw new Error(`unexpected add node error: ${String(add_result.left)}`);
    }
    const add_binding_result = controller.add_binding({
      id: 'real_child_binding',
      source_id: 'first',
      source_handle: 'out',
      target_id: 'second',
      target_handle: 'in',
    });
    if (E.isLeft(add_binding_result)) {
      throw new Error(`unexpected add binding error: ${String(add_binding_result.left)}`);
    }

    const view = project_document_bridge_view(controller.view);
    const baseline_bindings = Object.values(view.bindings);
    const latest_bindings = baseline_bindings.filter(binding => {
      return binding.id !== 'real_child_binding';
    });
    const changes = diff_document_boundary_wire_changes(
      view,
      baseline_bindings,
      view,
      latest_bindings,
    );
    expect(changes).toEqual([]);
  });

  it('commits removal and synchronizes slots, mapping, host ports, and projection', () => {
    const controller = make_controller_with_internal(
      make_node('internal', 'child', [port('in', 'input')], [port('out', 'output')]),
    );
    const input_slot_id = add_boundary(controller, 'input');
    const output_slot_id = add_boundary(controller, 'output');

    const input_result = commit_document_boundary_edit(controller, {
      kind: 'remove',
      direction: 'input',
      slot_id: input_slot_id,
    });
    if (E.isLeft(input_result)) {
      throw new Error(`unexpected input removal error: ${String(input_result.left)}`);
    }
    expect(controller.view.graph.input_slots).toEqual([]);
    expect(controller.view.boundary_bindings[`child:input:${input_slot_id}`]).toBeUndefined();
    expect(controller.document.nodes['host']?.inputs).toEqual([]);

    const output_result = commit_document_boundary_edit(controller, {
      kind: 'remove',
      direction: 'output',
      slot_id: output_slot_id,
    });
    if (E.isLeft(output_result)) {
      throw new Error(`unexpected output removal error: ${String(output_result.left)}`);
    }
    expect(controller.view.graph.output_slots).toEqual([]);
    expect(controller.view.boundary_bindings[`child:output:${output_slot_id}`]).toBeUndefined();
    expect(controller.document.nodes['host']?.outputs).toEqual([]);
    expect(controller.view.boundary_bindings).toEqual({});

    const projected = project_document_bridge_view(controller.view);
    expect(projected.view_only_binding_ids).toEqual([]);
    expect(Object.keys(projected.bindings)).toEqual([]);
  });

  it('returns an error and keeps the controller unchanged for an invalid internal port', () => {
    const controller = make_controller_with_internal(
      make_node('internal', 'child', [port('in', 'input')], [port('out', 'output')]),
    );
    const view = project_document_bridge_view(controller.view);
    const input_rail_id = get_rail_node_id(view, 'subgraph_input');
    const snapshot = JSON.stringify(controller.document);
    const binding = make_binding(
      input_rail_id,
      document_boundary_add_port_id,
      'internal',
      'missing',
    );

    const translation = translate_document_boundary_binding(view, binding);
    expect(E.isLeft(translation)).toBe(true);
    const result = commit_document_boundary_binding(controller, view, binding);
    expect(E.isLeft(result)).toBe(true);
    expect(JSON.stringify(controller.document)).toBe(snapshot);
  });

  it('mounts a pointer gesture so deleting a projected boundary wire cascades the host binding', async () => {
    const controller = make_controller_with_internal(
      make_node('internal', 'child', [port('in', 'input')], [port('out', 'output')]),
    );
    const input_slot_id = add_boundary(controller, 'input');
    if (E.isLeft(controller.exit_subgraph())) {
      throw new Error('expected exit from child before adding parent binding');
    }
    const source_add = controller.add_node(
      make_node('root_source', 'root', [], [port('source_out', 'output')]),
    );
    if (E.isLeft(source_add)) {
      throw new Error(`unexpected root source add error: ${String(source_add.left)}`);
    }
    const parent_binding_add = controller.add_binding({
      id: 'root_to_host_input',
      source_id: 'root_source',
      source_handle: 'source_out',
      target_id: 'host',
      target_handle: input_slot_id,
    });
    if (E.isLeft(parent_binding_add)) {
      throw new Error(`unexpected parent binding add error: ${String(parent_binding_add.left)}`);
    }
    if (E.isLeft(controller.enter_subgraph('host'))) {
      throw new Error('expected re-entry into child after adding parent binding');
    }
    const view = project_document_bridge_view(controller.view);
    const binding = find_mapping_binding(view, 'input');
    let current_bindings = Object.values(view.bindings);
    const wire = {
      get_bindings: () => current_bindings.slice(),
      remove_binding: (binding_id: string) => {
        current_bindings = current_bindings.filter(candidate => candidate.id !== binding_id);
      },
      add_binding: (next: DocumentBridgeBinding) => {
        current_bindings = [...current_bindings, next];
      },
    };
    const container = document.createElement('div');
    const app_events = new EventEmitter<EaselEvents>();
    const easel = {
      container,
      app_events,
      plugin_data: { wire },
    } as unknown as Easel;
    const stop = mount_document_boundary_editor(easel, controller);
    try {
      window.dispatchEvent(new Event('pointerdown'));
      wire.remove_binding(binding.id);
      app_events.emit('pointerup', new Event('pointerup') as PointerEvent);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(controller.view.graph.input_slots).toEqual([]);
      expect(controller.view.boundary_bindings[`child:input:${input_slot_id}`]).toBeUndefined();
      expect(controller.document.nodes['host']?.inputs).toEqual([]);
      expect(controller.document.bindings['root_to_host_input']).toBeUndefined();
    } finally {
      stop();
    }
  });
});

describe('document boundary rail interaction', () => {
  const make_rail_node = (): GraphNode => {
    return {
      id: 'rail',
      type: 'subgraph_input',
      position: { x: 100, y: 100 },
      size: { x: 180, y: 80 },
      title: 'Rail',
      inputs: [],
      outputs: [{ id: '__easel_boundary_add__', label: 'Add', type: 'output' }],
      custom_data: { view_only: true, boundary_direction: 'input' },
    };
  };

  const make_event_easel = (): {
    readonly easel: Easel;
    readonly container: HTMLElement;
    readonly store: Store;
  } => {
    if (typeof globalThis.requestAnimationFrame === 'undefined') {
      Object.assign(globalThis, {
        requestAnimationFrame: (callback: FrameRequestCallback) =>
          window.setTimeout(() => callback(performance.now()), 0),
        cancelAnimationFrame: (handle: number) => window.clearTimeout(handle),
      });
    }
    const container = document.createElement('div');
    const store = new Store();
    const tools = new ToolManager(store.dispatch);
    const app_events = new EventEmitter<EaselEvents>();
    const easel = {
      container,
      store,
      state: store.state,
      dispatch: store.dispatch,
      app_events,
      plugin_data: {},
      tools,
    } as unknown as Easel;
    container.setPointerCapture = () => undefined;
    container.releasePointerCapture = () => undefined;
    wire_plugin.setup(easel);
    setup_events(container, store.dispatch, app_events, tools);
    return { easel, container, store };
  };

  it('starts an ordinary select drag from rail header/blank body', () => {
    const { container, store } = make_event_easel();
    store.dispatch(state => ({
      ...state,
      nodes: { ...state.nodes, rail: make_rail_node() },
    }));
    const node_el = document.createElement('div');
    node_el.className = 'node';
    node_el.dataset['id'] = 'rail';
    const header = document.createElement('div');
    header.className = 'boundary-rail-header';
    header.textContent = 'INPUTS';
    node_el.appendChild(header);
    container.appendChild(node_el);

    const down = new PointerEvent('pointerdown', {
      bubbles: true,
      composed: true,
      clientX: 110,
      clientY: 110,
      pointerId: 1,
    });
    header.dispatchEvent(down);
    expect(store.state.value.interaction.mode).toBe('dragging');
    expect(store.state.value.selected_node_ids).toContain('rail');

    const move = new PointerEvent('pointermove', {
      bubbles: true,
      composed: true,
      clientX: 160,
      clientY: 170,
      pointerId: 1,
    });
    header.dispatchEvent(move);
    expect(store.state.value.nodes['rail']?.position).toEqual({ x: 150, y: 160 });
  });

  it('keeps rail port capture on the wire plugin instead of starting a drag', () => {
    const { easel, container, store } = make_event_easel();
    store.dispatch(state => ({
      ...state,
      nodes: { ...state.nodes, rail: make_rail_node() },
    }));
    const node_el = document.createElement('div');
    node_el.className = 'node';
    node_el.dataset['id'] = 'rail';
    const port_el = document.createElement('div');
    port_el.className = 'port boundary-rail-port';
    port_el.dataset['portId'] = '__easel_boundary_add__';
    port_el.dataset['portType'] = 'output';
    node_el.appendChild(port_el);
    container.appendChild(node_el);

    const down = new PointerEvent('pointerdown', {
      bubbles: true,
      composed: true,
      clientX: 110,
      clientY: 130,
      pointerId: 1,
    });
    port_el.dispatchEvent(down);
    const wire = easel.plugin_data.wire;
    expect(wire?._wire_state.is_wiring).toBe(true);
    expect(wire?._wire_state.source_node_id).toBe('rail');
    expect(wire?._wire_state.source_port_id).toBe('__easel_boundary_add__');
    expect(store.state.value.active_tool).toBe('wire');
    expect(store.state.value.interaction.mode).toBe('idle');
  });
});
