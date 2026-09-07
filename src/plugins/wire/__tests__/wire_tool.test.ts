import { describe, expect, it } from 'vitest';
import * as O from 'fp-ts/Option';
import { add_node } from '@/core/node_ops';
import { create_initial_state } from '@/core/state';
import type { PointerEventParams } from '@/core/interactions';
import type { Easel } from '@/runtime/easel';
import type { GraphNode, State } from '@/core/types';
import type { DataFlowBinding } from '../index';
import { wire_tool } from '../wire_tool';
import type { WireState } from '../wire_tool';

const make_node = (id: string, port_type: 'input' | 'output', locked = false): GraphNode => ({
  id,
  type: 'default',
  position: { x: 0, y: 0 },
  size: { x: 100, y: 80 },
  title: id,
  inputs: port_type === 'input' ? [{ id: 'in', label: 'In', type: 'input', accepts: ['any'] }] : [],
  outputs:
    port_type === 'output' ? [{ id: 'out', label: 'Out', type: 'output', value_type: 'any' }] : [],
  custom_data: {},
  ...(locked ? { locked: true } : {}),
});

const make_state = (nodes: readonly GraphNode[]): State =>
  nodes.reduce((state, node) => add_node(state, node), create_initial_state());

const make_binding = (id: string, source_id: string, target_id: string): DataFlowBinding => ({
  id,
  source_id,
  source_handle: 'out',
  target_id,
  target_handle: 'in',
});

const make_input_event = (node_id: string): PointerEventParams => ({
  screen_position: { x: 0, y: 0 },
  target_node_id: O.some(node_id),
  target_port_id: O.some('in'),
  target_port_type: O.some('input'),
  target_action: O.none,
  modifiers: { ctrl: false, shift: false, alt: false, meta: false },
});

type FakeWireApi = {
  find_by_target(node_id: string, port_id: string): DataFlowBinding | undefined;
  find_by_source(node_id: string, port_id: string): DataFlowBinding | undefined;
  remove_binding(binding_id: string): void;
  add_binding(binding: DataFlowBinding): void;
};

type WireHarness = {
  tool: ReturnType<typeof wire_tool>;
  wire_state: WireState;
  bindings: Record<string, DataFlowBinding>;
  removed_ids: string[];
  added_bindings: DataFlowBinding[];
};

const create_harness = (): WireHarness => {
  const wire_state: WireState = {
    is_wiring: false,
    source_node_id: '',
    source_port_id: '',
    target_pos: { x: 0, y: 0 },
  };
  const bindings: Record<string, DataFlowBinding> = {};
  const removed_ids: string[] = [];
  const added_bindings: DataFlowBinding[] = [];
  const wire: FakeWireApi = {
    find_by_target: (node_id, port_id) =>
      Object.values(bindings).find(
        binding => binding.target_id === node_id && binding.target_handle === port_id,
      ),
    find_by_source: (node_id, port_id) =>
      Object.values(bindings).find(
        binding => binding.source_id === node_id && binding.source_handle === port_id,
      ),
    remove_binding: binding_id => {
      removed_ids.push(binding_id);
      delete bindings[binding_id];
    },
    add_binding: binding => {
      added_bindings.push(binding);
      bindings[binding.id] = binding;
    },
  };
  const easel = { plugin_data: { wire } } as unknown as Easel;
  const tool = wire_tool(easel, wire_state);
  return { tool, wire_state, bindings, removed_ids, added_bindings };
};

const start_wiring_from = (wire_state: WireState, source_node_id: string): void => {
  wire_state.is_wiring = true;
  wire_state.source_node_id = source_node_id;
  wire_state.source_port_id = 'out';
  wire_state.target_pos = { x: 0, y: 0 };
};

describe('wire_tool locked binding protection', () => {
  it('does not detach or start wiring when the binding target node is locked', () => {
    const source = make_node('source', 'output');
    const target = make_node('target', 'input', true);
    const state = make_state([source, target]);
    const existing_binding = make_binding('b1', source.id, target.id);
    const harness = create_harness();
    harness.bindings[existing_binding.id] = existing_binding;

    const result = harness.tool.on_pointer_down!(
      state,
      state.interaction,
      make_input_event(target.id),
    );

    expect(result.state).toBe(state);
    expect(harness.removed_ids).toEqual([]);
    expect(harness.wire_state.is_wiring).toBe(false);
    expect(harness.bindings[existing_binding.id]).toBe(existing_binding);
  });

  it('does not detach or start wiring when the binding source node is locked', () => {
    const source = make_node('source', 'output', true);
    const target = make_node('target', 'input');
    const state = make_state([source, target]);
    const existing_binding = make_binding('b1', source.id, target.id);
    const harness = create_harness();
    harness.bindings[existing_binding.id] = existing_binding;

    const result = harness.tool.on_pointer_down!(
      state,
      state.interaction,
      make_input_event(target.id),
    );

    expect(result.state).toBe(state);
    expect(harness.removed_ids).toEqual([]);
    expect(harness.wire_state.is_wiring).toBe(false);
    expect(harness.bindings[existing_binding.id]).toBe(existing_binding);
  });

  it('detaches and starts wiring when the binding is unlocked', () => {
    const source = make_node('source', 'output');
    const target = make_node('target', 'input');
    const state = make_state([source, target]);
    const existing_binding = make_binding('b1', source.id, target.id);
    const harness = create_harness();
    harness.bindings[existing_binding.id] = existing_binding;

    const result = harness.tool.on_pointer_down!(
      state,
      state.interaction,
      make_input_event(target.id),
    );

    expect(result.state).toBe(state);
    expect(harness.removed_ids).toEqual([existing_binding.id]);
    expect(harness.wire_state.is_wiring).toBe(true);
    expect(harness.wire_state.source_node_id).toBe(source.id);
    expect(harness.wire_state.source_port_id).toBe('out');
    expect(harness.bindings[existing_binding.id]).toBeUndefined();
  });

  it('does not replace an existing binding when its source node is locked', () => {
    const new_source = make_node('new_source', 'output');
    const old_source = make_node('old_source', 'output', true);
    const target = make_node('target', 'input');
    const state = make_state([new_source, old_source, target]);
    const existing_binding = make_binding('b1', old_source.id, target.id);
    const harness = create_harness();
    harness.bindings[existing_binding.id] = existing_binding;
    start_wiring_from(harness.wire_state, new_source.id);

    const result = harness.tool.on_pointer_up!(
      state,
      state.interaction,
      make_input_event(target.id),
    );

    expect(result.state).toBe(state);
    expect(harness.removed_ids).toEqual([]);
    expect(harness.added_bindings).toEqual([]);
    expect(harness.wire_state.is_wiring).toBe(false);
    expect(harness.bindings[existing_binding.id]).toBe(existing_binding);
  });

  it('does not replace an existing binding when its target node is locked', () => {
    const new_source = make_node('new_source', 'output');
    const old_source = make_node('old_source', 'output');
    const target = make_node('target', 'input', true);
    const state = make_state([new_source, old_source, target]);
    const existing_binding = make_binding('b1', old_source.id, target.id);
    const harness = create_harness();
    harness.bindings[existing_binding.id] = existing_binding;
    start_wiring_from(harness.wire_state, new_source.id);

    const result = harness.tool.on_pointer_up!(
      state,
      state.interaction,
      make_input_event(target.id),
    );

    expect(result.state).toBe(state);
    expect(harness.removed_ids).toEqual([]);
    expect(harness.added_bindings).toEqual([]);
    expect(harness.wire_state.is_wiring).toBe(false);
    expect(harness.bindings[existing_binding.id]).toBe(existing_binding);
  });

  it('replaces an unlocked existing binding on pointer up', () => {
    const new_source = make_node('new_source', 'output');
    const old_source = make_node('old_source', 'output');
    const target = make_node('target', 'input');
    const state = make_state([new_source, old_source, target]);
    const existing_binding = make_binding('b1', old_source.id, target.id);
    const harness = create_harness();
    harness.bindings[existing_binding.id] = existing_binding;
    start_wiring_from(harness.wire_state, new_source.id);

    const result = harness.tool.on_pointer_up!(
      state,
      state.interaction,
      make_input_event(target.id),
    );

    expect(result.state).toBe(state);
    expect(harness.removed_ids).toEqual([existing_binding.id]);
    expect(harness.added_bindings).toHaveLength(1);
    expect(harness.added_bindings[0]).toMatchObject({
      source_id: new_source.id,
      source_handle: 'out',
      target_id: target.id,
      target_handle: 'in',
    });
    expect(harness.wire_state.is_wiring).toBe(false);
  });
});
