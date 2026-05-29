
import { remove_node } from '@/core/node_ops';
import type { Dispatch } from './store';
import EventEmitter from 'eventemitter3';
import type { EaselEvents } from './event_types';

export type KeybindingDef = {
  id: string;
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** 即使焦点在 INPUT/TEXTAREA/SELECT 中也触发。默认 false。 */
  global?: boolean;
  handler: (e: KeyboardEvent) => void;
  description?: string;
};

/** 键盘快捷键管理器。插件通过 easel.keybindings.register() 注册。 */
export class KeybindingManager {
  private bindings: KeybindingDef[] = [];

  register(def: KeybindingDef): () => void {
    this.bindings.push(def);
    return () => this.unregister(def.id);
  }

  unregister(id: string): void {
    this.bindings = this.bindings.filter(b => b.id !== id);
  }

  /** 由 events.ts keydown 处理器调用。返回 true 表示有匹配的绑定。 */
  dispatch(e: KeyboardEvent, in_input: boolean): boolean {
    let matched = false;
    for (const b of this.bindings) {
      if (
        e.key !== b.key &&
        !(b.key === 'Delete' && e.key === 'Backspace') &&
        !(b.key === 'Backspace' && e.key === 'Delete')
      )
        continue;

      const ctrl_ok = b.ctrl ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.metaKey;
      if (!ctrl_ok) continue;
      if (b.shift && !e.shiftKey) continue;
      if (!b.shift && e.shiftKey) continue;
      if (b.alt && !e.altKey) continue;
      if (!b.alt && e.altKey) continue;

      if (!in_input || b.global) {
        e.preventDefault();
        b.handler(e);
        matched = true;
      }
    }
    return matched;
  }
}

// ===== 内置快捷键注册 =====

export function register_core_keybindings(kb: KeybindingManager, dispatch: Dispatch, app_events: EventEmitter<EaselEvents>): void {
  const delete_handler = () => (s: any) => {
    if (s.selected_node_ids.length === 0) return s;
    return s.selected_node_ids.reduce((acc: any, id: string) => {
      const node = acc.nodes[id];
      if (node && (node.type === 'subgraph_input' || node.type === 'subgraph_output')) return acc;
      return remove_node(acc, id);
    }, s);
  };

  kb.register({
    id: 'core.delete_nodes',
    key: 'Delete',
    handler: () => dispatch(delete_handler()),
    description: 'Delete selected nodes',
  });
  kb.register({
    id: 'core.delete_nodes_backspace',
    key: 'Backspace',
    handler: () => dispatch(delete_handler()),
    description: 'Delete selected nodes (Backspace)',
  });
  kb.register({
    id: 'core.group_selection',
    key: 'g',
    ctrl: true,
    handler: () => {
      app_events.emit('create_group', {});
    },
    description: 'Group selected nodes (Ctrl+G)',
  });
}
