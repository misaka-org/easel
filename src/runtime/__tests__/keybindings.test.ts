import { describe, it, expect, vi } from 'vitest';
import { KeybindingManager, register_core_keybindings } from '@/runtime/keybindings';
import { create_initial_state } from '@/core/state';
import { add_node } from '@/core/node_ops';
import { vec2_create } from '@/core/math';

function mockKey(
  key: string,
  opts: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {},
): KeyboardEvent {
  return {
    key,
    ctrlKey: opts.ctrl || false,
    shiftKey: opts.shift || false,
    altKey: opts.alt || false,
    metaKey: opts.meta || false,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent;
}

describe('KeybindingManager', () => {
  it('registers and dispatches a simple binding', () => {
    const kb = new KeybindingManager();
    const handler = vi.fn();
    kb.register({ id: 'test', key: 'a', handler });
    const matched = kb.dispatch(mockKey('a'), false);
    expect(matched).toBe(true);
    expect(handler).toHaveBeenCalled();
  });

  it('does not match different key', () => {
    const kb = new KeybindingManager();
    const handler = vi.fn();
    kb.register({ id: 'test', key: 'a', handler });
    const matched = kb.dispatch(mockKey('b'), false);
    expect(matched).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('matches ctrl+key binding', () => {
    const kb = new KeybindingManager();
    const handler = vi.fn();
    kb.register({ id: 'test', key: 'z', ctrl: true, handler });
    const matched = kb.dispatch(mockKey('z', { ctrl: true }), false);
    expect(matched).toBe(true);
    expect(handler).toHaveBeenCalled();
  });

  it('does not match ctrl binding without ctrl', () => {
    const kb = new KeybindingManager();
    const handler = vi.fn();
    kb.register({ id: 'test', key: 'z', ctrl: true, handler });
    const matched = kb.dispatch(mockKey('z'), false);
    expect(matched).toBe(false);
  });

  it('blocks dispatch when in input and binding is not global', () => {
    const kb = new KeybindingManager();
    const handler = vi.fn();
    kb.register({ id: 'test', key: 'a', handler });
    const matched = kb.dispatch(mockKey('a'), true);
    expect(matched).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('allows dispatch when in input and binding is global', () => {
    const kb = new KeybindingManager();
    const handler = vi.fn();
    kb.register({ id: 'test', key: 'a', global: true, handler });
    const matched = kb.dispatch(mockKey('a'), true);
    expect(matched).toBe(true);
    expect(handler).toHaveBeenCalled();
  });

  it('matches shift modifier', () => {
    const kb = new KeybindingManager();
    const handler = vi.fn();
    kb.register({ id: 'test', key: 'z', shift: true, ctrl: true, handler });
    const matched = kb.dispatch(mockKey('z', { ctrl: true, shift: true }), false);
    expect(matched).toBe(true);
    expect(handler).toHaveBeenCalled();
  });

  it('matches alt modifier', () => {
    const kb = new KeybindingManager();
    const handler = vi.fn();
    kb.register({ id: 'test', key: 'x', alt: true, handler });
    const matched = kb.dispatch(mockKey('x', { alt: true }), false);
    expect(matched).toBe(true);
  });

  it('matches meta key as ctrl', () => {
    const kb = new KeybindingManager();
    const handler = vi.fn();
    kb.register({ id: 'test', key: 'z', ctrl: true, handler });
    const matched = kb.dispatch(mockKey('z', { meta: true }), false);
    expect(matched).toBe(true);
  });

  it('unregisters a binding', () => {
    const kb = new KeybindingManager();
    const handler = vi.fn();
    kb.register({ id: 'test', key: 'a', handler });
    kb.unregister('test');
    const matched = kb.dispatch(mockKey('a'), false);
    expect(matched).toBe(false);
  });

  it('register returns an unregister function', () => {
    const kb = new KeybindingManager();
    const handler = vi.fn();
    const unreg = kb.register({ id: 'test', key: 'a', handler });
    unreg();
    expect(kb.dispatch(mockKey('a'), false)).toBe(false);
  });

  it('handles Delete/Backspace equivalence', () => {
    const kb = new KeybindingManager();
    const handler = vi.fn();
    kb.register({ id: 'test', key: 'Delete', handler });
    expect(kb.dispatch(mockKey('Backspace'), false)).toBe(true);
    expect(handler).toHaveBeenCalled();
  });

  it('calls preventDefault on match', () => {
    const kb = new KeybindingManager();
    const handler = vi.fn();
    kb.register({ id: 'test', key: 'a', handler });
    const e = mockKey('a');
    kb.dispatch(e, false);
    expect(e.preventDefault).toHaveBeenCalled();
  });
});

describe('register_core_keybindings', () => {
  it('registers Delete, Backspace, and Ctrl+G bindings', () => {
    const kb = new KeybindingManager();
    const dispatch = vi.fn();
    register_core_keybindings(kb, dispatch, { emit: vi.fn() } as any);
    expect(kb.dispatch(mockKey('Delete'), false)).toBe(true);
    expect(kb.dispatch(mockKey('Backspace'), false)).toBe(true);
    expect(kb.dispatch(mockKey('g', { ctrl: true }), false)).toBe(true);
  });

  it('Delete dispatches remove_node for selected nodes', () => {
    const kb = new KeybindingManager();
    let state = add_node(create_initial_state(), {
      id: 'n1',
      type: 'default',
      position: vec2_create(0, 0),
      size: vec2_create(100, 80),
      title: 'N1',
      inputs: [],
      outputs: [],
      widgets: [],
      custom_data: {},
    });
    state = { ...state, selected_node_ids: ['n1'] };

    let capturedState: any = null;
    const dispatch = (fn: any) => {
      capturedState = fn(state);
    };

    register_core_keybindings(kb, dispatch, { emit: vi.fn() } as any);
    const e = mockKey('Delete');
    kb.dispatch(e, false);

    expect(capturedState).not.toBeNull();
    expect(capturedState.nodes['n1']).toBeUndefined();
  });

  it('Delete handler skips subgraph_input and subgraph_output nodes', () => {
    const kb = new KeybindingManager();
    let state = add_node(create_initial_state(), {
      id: 'sub_in',
      type: 'subgraph_input',
      position: vec2_create(0, 0),
      size: vec2_create(100, 80),
      title: 'Sub In',
      inputs: [],
      outputs: [],
      widgets: [],
      custom_data: {},
    });
    state = { ...state, selected_node_ids: ['sub_in'] };

    let capturedState: any = null;
    const dispatch = (fn: any) => {
      capturedState = fn(state);
    };

    register_core_keybindings(kb, dispatch, { emit: vi.fn() } as any);
    kb.dispatch(mockKey('Delete'), false);

    expect(capturedState.nodes['sub_in']).toBeDefined();
  });

  it('Ctrl+G no-op when nothing selected', () => {
    const kb = new KeybindingManager();
    const state = create_initial_state();
    const app_events = { emit: vi.fn() };

    let capturedState: any = null;
    const dispatch = (fn: any) => {
      capturedState = fn(state);
    };

    register_core_keybindings(kb, dispatch, app_events as any);
    kb.dispatch(mockKey('g', { ctrl: true }), false);

    expect(capturedState).toBeNull();
    expect(app_events.emit).toHaveBeenCalledWith('create_group', {});
  });

  it('Ctrl+G creates a group node from selected nodes', () => {
    const kb = new KeybindingManager();
    let state = add_node(create_initial_state(), {
      id: 'n1',
      type: 'default',
      position: vec2_create(100, 100),
      size: vec2_create(100, 80),
      title: 'N1',
      inputs: [],
      outputs: [],
      widgets: [],
      custom_data: {},
    });
    state = add_node(state, {
      id: 'n2',
      type: 'default',
      position: vec2_create(300, 200),
      size: vec2_create(100, 80),
      title: 'N2',
      inputs: [],
      outputs: [],
      widgets: [],
      custom_data: {},
    });
    state = { ...state, selected_node_ids: ['n1', 'n2'] };

    const app_events = { emit: vi.fn() };

    let capturedState: any = null;
    const dispatch = (fn: any) => {
      capturedState = fn(state);
    };

    register_core_keybindings(kb, dispatch, app_events as any);
    kb.dispatch(mockKey('g', { ctrl: true }), false);

    expect(capturedState).toBeNull();
    expect(app_events.emit).toHaveBeenCalledWith('create_group', {});
  });
});
