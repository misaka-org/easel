/**
 * Store + Table unit tests.
 */
import { describe, it, expect } from 'vitest';
import { Store, Table } from '../store';
import { pointer_down } from '@/core/interactions';
import * as O from 'fp-ts/Option';
import { create_initial_state } from '@/core/state';
import { vec2_create } from '@/core/math';
import type { GraphNode } from '@/core/types';
import { create_data_flow_binding } from '@/core/types';

// ?? Helpers ????????????????????????????????????????????????????

const make_node = (id: string, overrides?: Partial<GraphNode>): GraphNode => ({
  id,
  type: 'test',
  position: vec2_create(0, 0),
  size: vec2_create(100, 50),
  title: id,
  inputs: [],
  outputs: [],
  custom_data: {},
  ...overrides,
});

// ?? Store ??????????????????????????????????????????????????????

describe('Store', () => {
  it('should create with initial state', () => {
    const store = new Store();
    expect(store.state.value.nodes).toEqual({});
    expect(store.state.value.wires).toEqual({});
    expect(store.state.value.camera.zoom).toBe(1);
  });

  it('should accept custom initial state', () => {
    const custom = { ...create_initial_state(), camera: { position: vec2_create(10, 20), zoom: 0.5 } };
    const store = new Store({ initial_state: custom });
    expect(store.state.value.camera.zoom).toBe(0.5);
    expect(store.state.value.camera.position.x).toBe(10);
  });

  it('should expose nodes as Table', () => {
    const store = new Store();
    expect(store.nodes).toBeInstanceOf(Table);
    expect(store.wires).toBeInstanceOf(Table);
  });

  it('should dispatch updates and trigger state change', () => {
    const store = new Store();
    store.dispatch(s => ({ ...s, camera: { ...s.camera, zoom: 2 } }));
    expect(store.state.value.camera.zoom).toBe(2);
  });

  it('should keep nodes and wires in sync between Table and state', () => {
    const store = new Store();
    store.nodes.put('a', make_node('a'));
    expect(store.nodes.get('a')).toBeDefined();
    expect(store.state.value.nodes['a']).toBeDefined();
    expect(store.state.value.nodes['a']!.id).toBe('a');
  });

  it('should auto-cleanup wires when a node is deleted via on_before_change', () => {
    const store = new Store();
    store.nodes.put('a', make_node('a'));
    store.nodes.put('b', make_node('b'));
    store.wires.put('w1', {
      id: 'w1',
      source_node_id: 'a',
      source_port_id: 'out1',
      target_node_id: 'b',
      target_port_id: 'in1',
    });

    store.nodes.on_before_change((event) => {
      if (event.type === 'delete' && event.prev) {
        for (const wire of store.wires.list()) {
          if (wire.source_node_id === event.id || wire.target_node_id === event.id) {
            store.wires.delete(wire.id);
          }
        }
      }
    });

    store.nodes.delete('a');
    expect(store.wires.has('w1')).toBe(false);
    expect(store.nodes.has('a')).toBe(false);
    expect(store.nodes.has('b')).toBe(true);
  });

  it('should not prevent node delete when no wires connected', () => {
    const store = new Store();
    store.nodes.put('orphan', make_node('orphan'));

    store.nodes.on_before_change((event) => {
      if (event.type === 'delete' && event.prev) {
        for (const wire of store.wires.list()) {
          if (wire.source_node_id === event.id || wire.target_node_id === event.id) {
            store.wires.delete(wire.id);
          }
        }
      }
    });

    store.nodes.delete('orphan');
    expect(store.nodes.has('orphan')).toBe(false);
  });

  it('should allow wiring from output port even when input port has a binding', () => {
    const store = new Store();
    store.nodes.put('a', make_node('a'));
    store.nodes.put('b', make_node('b'));

    const binding = create_data_flow_binding('a', 'out1', 'b', 'in1');
    store.bindings.put(binding.id, binding);

    const state = store.state.value;
    const ev = {
      screen_position: vec2_create(0, 0),
      target_node_id: O.some('b'),
      target_port_id: O.some('out1'),
      target_port_type: O.some('output' as const),
      target_action: O.none,
      modifiers: { ctrl: false, shift: false, alt: false, meta: false },
    };

    const result = pointer_down(state, ev);
    expect(result.interaction.mode).toBe('wiring');
    expect(result.interaction.source_node_id).toBe('b');
    expect(result.interaction.source_port_id).toBe('out1');
  });
});

// ?? Table ??????????????????????????????????????????????????????

describe('Table', () => {
  it('should put and get items', () => {
    let data: Record<string, GraphNode> = {};
    const table = new Table<GraphNode>(
      () => data,
      fn => { data = fn(data); },
    );

    table.put('n1', make_node('n1'));
    expect(table.get('n1')).toBeDefined();
    expect(table.get('n1')!.title).toBe('n1');
  });

  it('should list items', () => {
    let data: Record<string, GraphNode> = {};
    const table = new Table<GraphNode>(
      () => data,
      fn => { data = fn(data); },
    );

    table.put('a', make_node('a'));
    table.put('b', make_node('b'));
    expect(table.list()).toHaveLength(2);
    expect(table.keys()).toEqual(['a', 'b']);
  });

  it('should delete items', () => {
    let data: Record<string, GraphNode> = { n1: make_node('n1') };
    const table = new Table<GraphNode>(
      () => data,
      fn => { data = fn(data); },
    );

    table.delete('n1');
    expect(table.get('n1')).toBeUndefined();
    expect(table.has('n1')).toBe(false);
  });

  it('should report has() correctly', () => {
    let data: Record<string, GraphNode> = { n1: make_node('n1') };
    const table = new Table<GraphNode>(
      () => data,
      fn => { data = fn(data); },
    );

    expect(table.has('n1')).toBe(true);
    expect(table.has('n2')).toBe(false);
  });

  it('should trigger before-change hooks', () => {
    let data: Record<string, GraphNode> = {};
    const table = new Table<GraphNode>(
      () => data,
      fn => { data = fn(data); },
    );

    const events: string[] = [];
    table.on_before_change((event) => {
      events.push('before:' + event.type + ':' + event.id);
    });

    table.put('x', make_node('x'));
    expect(events).toContain('before:put:x');
  });

  it('should trigger after-change hooks', () => {
    let data: Record<string, GraphNode> = {};
    const table = new Table<GraphNode>(
      () => data,
      fn => { data = fn(data); },
    );

    const events: string[] = [];
    table.on_after_change((event) => {
      events.push('after:' + event.type + ':' + event.id);
    });

    table.put('x', make_node('x'));
    table.delete('x');
    expect(events).toContain('after:put:x');
    expect(events).toContain('after:delete:x');
  });

  it('should allow before hook to prevent change by returning false', () => {
    let data: Record<string, GraphNode> = { protected: make_node('protected') };
    const table = new Table<GraphNode>(
      () => data,
      fn => { data = fn(data); },
    );

    table.on_before_change((event) => {
      if (event.type === 'delete' && event.id === 'protected') return false;
    });

    const result = table.delete('protected');
    expect(result).toBe(false);
    expect(table.has('protected')).toBe(true);
  });

  it('should allow before hook to modify payload', () => {
    let data: Record<string, GraphNode> = {};
    const table = new Table<GraphNode>(
      () => data,
      fn => { data = fn(data); },
    );

    table.on_before_change((event) => {
      if (event.type === 'put' && event.next) {
        return { ...event, next: { ...event.next, title: 'modified' } };
      }
    });

    table.put('n', make_node('n', { title: 'original' }));
    expect(table.get('n')!.title).toBe('modified');
  });

  it('should support unsubscribe from hooks', () => {
    let data: Record<string, GraphNode> = {};
    const table = new Table<GraphNode>(
      () => data,
      fn => { data = fn(data); },
    );

    let count = 0;
    const unsub = table.on_after_change(() => { count++; });
    table.put('a', make_node('a'));
    expect(count).toBe(1);

    unsub();
    table.put('b', make_node('b'));
    expect(count).toBe(1);
  });

  it('should cascade before->after hooks in order', () => {
    let data: Record<string, GraphNode> = {};
    const table = new Table<GraphNode>(
      () => data,
      fn => { data = fn(data); },
    );

    const order: string[] = [];
    table.on_before_change(() => { order.push('before'); });
    table.on_after_change(() => { order.push('after'); });

    table.put('n', make_node('n'));
    expect(order).toEqual(['before', 'after']);
  });

  it('should skip after hooks when before hook returns false', () => {
    let data: Record<string, GraphNode> = {};
    const table = new Table<GraphNode>(
      () => data,
      fn => { data = fn(data); },
    );

    const after: string[] = [];
    table.on_before_change(() => false);
    table.on_after_change(() => { after.push('fired'); });

    table.put('n', make_node('n'));
    expect(after).toHaveLength(0);
  });
});
