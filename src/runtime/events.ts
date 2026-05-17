import { vec2_create } from '@/core/math';
import { pointer_down, pointer_move, pointer_up, wheel_zoom, update_modifiers } from '@/core/interactions';
import type { State, Modifiers } from '@/core/types';
import * as O from 'fp-ts/Option';
import type { KeybindingManager } from './keybindings';

type Dispatch = (updater: (state: State) => State) => void;

export const setup_events = (container: HTMLElement, dispatch: Dispatch, app_events: any, keybindings?: KeybindingManager): void => {
  const forward = (name: string) => (e: Event) => app_events.emit(name, e);
  container.addEventListener('contextmenu', forward('contextmenu'));
  
  const get_modifiers = (e: MouseEvent | KeyboardEvent | WheelEvent): Modifiers => ({
    ctrl: e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
    meta: e.metaKey
  });

  const get_pointer_params = (e: PointerEvent | WheelEvent) => {
    const rect = container.getBoundingClientRect();
    const position = vec2_create(e.clientX - rect.left, e.clientY - rect.top);
    
    let target = (e.composedPath()[0] || e.target) as HTMLElement;
    if (e.type === 'pointerup') {
      const root = container.getRootNode() as ShadowRoot | Document;
      const el = root.elementFromPoint(e.clientX, e.clientY);
      if (el) target = el as HTMLElement;
    }
    
    const node_element = target.closest('.node') as HTMLElement | null;
    const port_element = target.closest('.port') as HTMLElement | null;
    
    const target_node_id = node_element?.dataset['id'];
    const target_port_id = port_element?.dataset['portId'];
    const target_port_type = port_element?.dataset['portType'] as 'input' | 'output' | undefined;
    const target_action = target.dataset['action'];

    return {
      screen_position: position,
      target_node_id: O.fromNullable(target_node_id),
      target_port_id: O.fromNullable(target_port_id),
      target_port_type: O.fromNullable(target_port_type),
      target_action: O.fromNullable(target_action),
      modifiers: get_modifiers(e)
    };
  };

  window.addEventListener('keydown', (e) => {
    app_events.emit('keydown', e);
    const target = (e.composedPath()[0] || e.target) as HTMLElement;
    const is_input = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

    // 通过 KeybindingManager 分派快捷键
    keybindings?.dispatch(e, !!is_input);

    dispatch(state => update_modifiers(state, get_modifiers(e)));
  });

  window.addEventListener('keyup', (e) => {
    app_events.emit('keyup', e);
    dispatch(state => update_modifiers(state, get_modifiers(e)));
  });

  container.addEventListener('pointerdown', (e) => {
    app_events.emit('pointerdown', e);
    const target = (e.composedPath()[0] || e.target) as HTMLElement;
    const action_el = target.closest('[data-action]');
    // 一劳永逸：如果点击落在 plugin UI、交互元素或非 resize 的 data-action 内，不触发画布事件
    if (
      target.closest('button, input, textarea, select') ||
      target.closest('.easel-controls, .easel-history-panel, .easel-minimap, .easel-node-picker-overlay, .easel-context-menu, .easel-executor-panel, .executor-overlays') ||
      (action_el && (action_el as HTMLElement).dataset['action'] !== 'resize')
    ) {
      return;
    }
    container.setPointerCapture(e.pointerId);
    dispatch((state) => pointer_down(state, get_pointer_params(e)));
  });

  // rAF-gate: first pointermove in a frame dispatches immediately,
  // subsequent moves within the same frame coalesce into one dispatch.
  let move_raf = 0;
  let pending_move_params: ReturnType<typeof get_pointer_params> | null = null;

  container.addEventListener('pointermove', (e) => {
    app_events.emit('pointermove', e);
    const params = get_pointer_params(e);

    if (move_raf) {
      pending_move_params = params;
      return;
    }

    // First move in frame: immediate dispatch for responsive feel
    dispatch((state) => pointer_move(state, params));

    move_raf = requestAnimationFrame(() => {
      move_raf = 0;
      if (pending_move_params) {
        dispatch((state) => pointer_move(state, pending_move_params!));
        pending_move_params = null;
      }
    });
  });

  container.addEventListener('dblclick', (e) => {
    const root = container.getRootNode() as ShadowRoot | Document;
    const el = root.elementFromPoint(e.clientX, e.clientY);
    const target = (el || e.target) as HTMLElement;
    
    const node_element = target.closest('.node') as HTMLElement | null;
    const node_id = node_element?.dataset['id'];
    if (node_id) {
      app_events.emit('node_dblclick', { node_id, target });
    }
  });

  container.addEventListener('pointerup', (e) => {
    app_events.emit('pointerup', e);
    container.releasePointerCapture(e.pointerId);
    dispatch((state) => {
      const mode = state.interaction.mode;
      const dragging_nodes = mode === 'dragging' ? state.interaction.node_ids : [];
      const resizing_node = mode === 'resizing' ? state.interaction.node_id : null;
      
      const next_state = pointer_up(state, get_pointer_params(e));
      
      if (mode === 'dragging' && dragging_nodes.length > 0) {
        setTimeout(() => app_events.emit('nodes_dropped', dragging_nodes), 0);
      }
      if (mode === 'resizing' && resizing_node) {
        setTimeout(() => app_events.emit('nodes_dropped', [resizing_node]), 0);
      }
      
      return next_state;
    });
  });
  
  /** True when the wheel event originated inside a scrollable element that has
   *  overflow content.  Prevents the canvas from stealing scroll events from
   *  plugin panels, pickers, and other overlay UIs. */
  const is_over_scrollable = (e: WheelEvent): boolean => {
    const path = e.composedPath();
    for (const el of path) {
      if (!(el instanceof HTMLElement)) continue;
      if (el === container) break;
      const style = getComputedStyle(el);
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
        return true;
      }
    }
    return false;
  };

  container.addEventListener('wheel', (e) => {
    // Don't zoom when the event targets a scrollable element inside a plugin
    // panel — let native scroll happen instead.
    if (is_over_scrollable(e)) return;

    e.preventDefault();
    dispatch((state) => wheel_zoom(state, {
      screen_position: get_pointer_params(e).screen_position,
      delta_x: e.deltaX,
      delta_y: e.deltaY,
      modifiers: get_modifiers(e)
    }));
  }, { passive: false });
};
