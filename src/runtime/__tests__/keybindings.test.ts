import { describe, it, expect, vi } from 'vitest';
import { KeybindingManager } from '@/runtime/keybindings';

function mockKey(key: string, opts: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {}): KeyboardEvent {
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