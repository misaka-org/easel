import { vec2_create } from '@/core/math';
import { wheel_zoom, update_modifiers } from '@/core/interactions';
import type { State, Modifiers } from '@/core/types';
import type { ToolResult } from '@/core/tool';
import * as O from 'fp-ts/Option';
import type { KeybindingManager } from './keybindings';
import type { ToolManager } from './tool_manager';
import type { Dispatch } from './store';
import EventEmitter from "eventemitter3";
import type { EaselEvents } from "./event_types";

/** 处理 ToolResult，如果带 transition 则切换工具。 */
function apply_result(dispatch: Dispatch, tools: ToolManager, result: ToolResult, state: State): void {
  dispatch(() => result.state);
  if (result.transition && result.transition !== state.active_tool) {
    tools.activate(result.transition);
  }
}

export const setup_events = (
  container: HTMLElement,
  dispatch: Dispatch,
  app_events: EventEmitter<EaselEvents>,
  tools: ToolManager,
  keybindings?: KeybindingManager,
): void => {
  const forward = (name: keyof EaselEvents) => (e: Event) => app_events.emit(name, e);
  container.addEventListener('contextmenu', forward('contextmenu'));

  const get_modifiers = (e: MouseEvent | KeyboardEvent | WheelEvent): Modifiers => ({
    ctrl: e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
    meta: e.metaKey,
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
      modifiers: get_modifiers(e),
    };
  };

  window.addEventListener('keydown', e => {
    app_events.emit('keydown', e);
    const target = (e.composedPath()[0] || e.target) as HTMLElement;
    const is_input = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

    // 通过 KeybindingManager 分派快捷键
    keybindings?.dispatch(e, !!is_input);

    dispatch(state => update_modifiers(state, get_modifiers(e)));
  });

  window.addEventListener('keyup', e => {
    app_events.emit('keyup', e);
    dispatch(state => update_modifiers(state, get_modifiers(e)));
  });

  container.addEventListener('pointerdown', e => {
    app_events.emit('pointerdown', e);
    const target = (e.composedPath()[0] || e.target) as HTMLElement;
    const action_el = target.closest('[data-action]');
    // 如果点击落在 plugin UI、交互元素或非 resize 的 data-action 内，不触发画布事件
    if (
      target.closest('button, input, textarea, select') ||
      target.closest(
        '.easel-controls, .easel-history-panel, .easel-minimap, .easel-node-picker-overlay, .easel-context-menu, .easel-executor-panel, .executor-overlays',
      ) ||
      (action_el && (action_el as HTMLElement).dataset['action'] !== 'resize')
    ) {
      return;
    }
    container.setPointerCapture(e.pointerId);
    dispatch(state => {
      const result = tools.handle_pointer_down(state, get_pointer_params(e));
      if (result) {
        apply_result(dispatch, tools, result, state);
        return result.state;
      }
      return state;
    });
  });

  // rAF-gate
  let move_raf = 0;
  let pending_move_params: ReturnType<typeof get_pointer_params> | null = null;

  container.addEventListener('pointermove', e => {
    app_events.emit('pointermove', e);
    const params = get_pointer_params(e);

    if (move_raf) {
      pending_move_params = params;
      return;
    }

    const do_move = (p: ReturnType<typeof get_pointer_params>) => {
      dispatch(state => {
        const result = tools.handle_pointer_move(state, p);
        if (result) {
          apply_result(dispatch, tools, result, state);
          return result.state;
        }
        return state;
      });
    };

    do_move(params);

    move_raf = requestAnimationFrame(() => {
      move_raf = 0;
      if (pending_move_params) {
        do_move(pending_move_params);
        pending_move_params = null;
      }
    });
  });

  container.addEventListener('dblclick', e => {
    const root = container.getRootNode() as ShadowRoot | Document;
    const el = root.elementFromPoint(e.clientX, e.clientY);
    const target = (el || e.target) as HTMLElement;

    const node_element = target.closest('.node') as HTMLElement | null;
    const node_id = node_element?.dataset['id'];
    if (node_id) {
      app_events.emit('node_dblclick', { node_id, target });
    }
  });

  container.addEventListener('pointerup', e => {
    app_events.emit('pointerup', e);
    container.releasePointerCapture(e.pointerId);
    dispatch(state => {
      const prev_mode = state.interaction.mode;
      const dragging_nodes = prev_mode === 'dragging' ? state.interaction.node_ids : [];
      const resizing_node = prev_mode === 'resizing' ? state.interaction.node_id : null;

      const params = get_pointer_params(e);
      const result = tools.handle_pointer_up(state, params);
      const next_state: State = result ? result.state : { ...state, interaction: { mode: 'idle' } };

      if (prev_mode === 'dragging' && dragging_nodes.length > 0) {
        setTimeout(() => app_events.emit('nodes_dropped', [...dragging_nodes]), 0);
      }
      if (prev_mode === 'resizing' && resizing_node) {
        setTimeout(() => app_events.emit('nodes_dropped', [resizing_node]), 0);
      }

      return next_state;
    });
  });

  const is_over_scrollable = (e: WheelEvent): boolean => {
    const path = e.composedPath();
    for (const el of path) {
      if (!(el instanceof HTMLElement)) continue;
      if (el === container) break;
      const style = getComputedStyle(el);
      if (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        el.scrollHeight > el.clientHeight
      ) {
        return true;
      }
    }
    return false;
  };

  container.addEventListener(
    'wheel',
    e => {
      if (is_over_scrollable(e)) return;

      e.preventDefault();
      dispatch(state => {
        const wheel_params = {
          screen_position: get_pointer_params(e).screen_position,
          delta_x: e.deltaX, delta_y: e.deltaY,
          modifiers: get_modifiers(e),
        };
        const result = tools.handle_wheel(state, wheel_params);
        if (result) {
          apply_result(dispatch, tools, result, state);
          return result.state;
        }
        // 默认 wheel: zoom/pan
        return wheel_zoom(state, wheel_params);
      });
    },
    { passive: false },
  );
};
