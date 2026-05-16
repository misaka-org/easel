import { vec2_create } from '@/core/math';
import { pointer_down, pointer_move, pointer_up, wheel_zoom, update_modifiers } from '@/core/interactions';
import { remove_node, add_node } from '@/core/node_ops';
import type { State, Modifiers } from '@/core/types';
import * as O from 'fp-ts/Option';

type Dispatch = (updater: (state: State) => State) => void;

export const setup_events = (container: HTMLElement, dispatch: Dispatch, app_events: any): void => {
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

    const is_ctrl = e.ctrlKey || e.metaKey;
    if (!is_input && (e.key === 'Delete' || e.key === 'Backspace')) {
      dispatch(state => {
        if (state.selected_node_ids.length > 0) {
          return state.selected_node_ids.reduce((acc, id) => remove_node(acc, id), state);
        }
        return state;
      });
    }

    if (!is_input && is_ctrl && e.key === 'g') {
      e.preventDefault();
      dispatch(state => {
        const selected = state.selected_node_ids;
        if (selected.length === 0) return state;

        let min_x = Infinity, min_y = Infinity, max_x = -Infinity, max_y = -Infinity;
        selected.forEach(id => {
          const n = state.nodes[id];
          if (n) {
            min_x = Math.min(min_x, n.position.x);
            min_y = Math.min(min_y, n.position.y);
            max_x = Math.max(max_x, n.position.x + n.size.x);
            max_y = Math.max(max_y, n.position.y + n.size.y);
          }
        });

        const padding = 20;
        const pos = vec2_create(min_x - padding, min_y - padding - 40);
        const size = vec2_create(max_x - min_x + padding * 2, max_y - min_y + padding * 2 + 40);

        const group_id = `group_${Date.now()}`;
        const hues = [0, 30, 60, 120, 210, 270, 315];
        const hue = hues[Math.floor(Math.random() * hues.length)];

        const new_state = add_node(state, {
          id: group_id,
          type: 'group',
          position: pos,
          size: size,
          title: 'Group',
          inputs: [],
          outputs: [],
          custom_data: { children: selected, hue },
          resizable: true
        });

        return { ...new_state, selected_node_ids: [group_id] };
      });
    }

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
    // 只阻止非 resize 操作的 data-action 元素，避免影响 resize 手柄
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName) || (action_el && (action_el as HTMLElement).dataset['action'] !== 'resize')) {
      return;
    }
    container.setPointerCapture(e.pointerId);
    dispatch((state) => pointer_down(state, get_pointer_params(e)));
  });

  container.addEventListener('pointermove', (e) => {
    app_events.emit('pointermove', e);
    dispatch((state) => pointer_move(state, get_pointer_params(e)));
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
