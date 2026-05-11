import { vec2_create } from '../core/math';
import { pointer_down, pointer_move, pointer_up, wheel_zoom, update_modifiers } from '../core/interactions';
import type { State, Modifiers } from '../core/types';
import * as O from 'fp-ts/Option';

type Dispatch = (updater: (state: State) => State) => void;

export const setup_events = (container: HTMLElement, dispatch: Dispatch): void => {
  const get_modifiers = (e: MouseEvent | KeyboardEvent | WheelEvent): Modifiers => ({
    ctrl: e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
    meta: e.metaKey
  });

  const get_pointer_params = (e: PointerEvent | WheelEvent) => {
    const rect = container.getBoundingClientRect();
    const position = vec2_create(e.clientX - rect.left, e.clientY - rect.top);
    
    let target = e.target as HTMLElement;
    if (e.type === 'pointerup') {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el) target = el as HTMLElement;
    }
    
    const node_element = target.closest('.node') as HTMLElement | null;
    const port_element = target.closest('.port') as HTMLElement | null;
    
    const target_node_id = node_element?.dataset['id'];
    const target_port_id = port_element?.dataset['portId'];
    const target_port_type = port_element?.dataset['portType'] as 'input' | 'output' | undefined;

    return {
      screen_position: position,
      target_node_id: O.fromNullable(target_node_id),
      target_port_id: O.fromNullable(target_port_id),
      target_port_type: O.fromNullable(target_port_type),
      modifiers: get_modifiers(e)
    };
  };

  window.addEventListener('keydown', (e) => {
    dispatch(state => update_modifiers(state, get_modifiers(e)));
  });

  window.addEventListener('keyup', (e) => {
    dispatch(state => update_modifiers(state, get_modifiers(e)));
  });

  container.addEventListener('pointerdown', (e) => {
    const target = e.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) {
      return;
    }
    container.setPointerCapture(e.pointerId);
    dispatch((state) => pointer_down(state, get_pointer_params(e)));
  });

  container.addEventListener('pointermove', (e) => {
    dispatch((state) => pointer_move(state, get_pointer_params(e)));
  });

  container.addEventListener('pointerup', (e) => {
    container.releasePointerCapture(e.pointerId);
    dispatch((state) => pointer_up(state, get_pointer_params(e)));
  });
  
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    dispatch((state) => wheel_zoom(state, {
      screen_position: get_pointer_params(e).screen_position,
      delta_x: e.deltaX,
      delta_y: e.deltaY,
      modifiers: get_modifiers(e)
    }));
  }, { passive: false });
};