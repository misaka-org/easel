import type { EaselPlugin } from '@/runtime/easel';
import { vec2_create, vec2_add } from '@/core/math';
import { pointer_move } from '@/core/interactions';
import * as O from 'fp-ts/Option';

export const auto_pan_plugin: EaselPlugin = easel => {
  let mouse_x = 0;
  let mouse_y = 0;
  let is_pointer_down = false;
  let raf_id: number | null = null;

  easel.app_events.on('pointerdown', () => {
    is_pointer_down = true;
    start_loop();
  });

  easel.app_events.on('pointerup', () => {
    is_pointer_down = false;
    stop_loop();
  });

  easel.app_events.on('pointermove', (e: PointerEvent) => {
    const rect = easel.container.getBoundingClientRect();
    mouse_x = e.clientX - rect.left;
    mouse_y = e.clientY - rect.top;
  });

  const start_loop = () => {
    if (raf_id === null) raf_id = requestAnimationFrame(loop);
  };
  const stop_loop = () => {
    if (raf_id !== null) {
      cancelAnimationFrame(raf_id);
      raf_id = null;
    }
  };

  const loop = () => {
    if (is_pointer_down) {
      const s = easel.state.value;
      const mode = s.interaction.mode;

      if (
        mode === 'dragging' ||
        mode === 'wiring' ||
        mode === 'resizing' ||
        mode === 'box_selecting'
      ) {
        const rect = easel.container.getBoundingClientRect();
        const edge = 40;
        const speed = 12;
        let dx = 0,
          dy = 0;

        if (mouse_x < edge) dx = speed;
        else if (mouse_x > rect.width - edge) dx = -speed;

        if (mouse_y < edge) dy = speed;
        else if (mouse_y > rect.height - edge) dy = -speed;

        if (dx !== 0 || dy !== 0) {
          easel.dispatch(state => {
            let inter = { ...state.interaction };
            if (
              inter.mode === 'dragging' ||
              inter.mode === 'resizing' ||
              inter.mode === 'box_selecting'
            ) {
              inter = {
                ...inter,
                start_pos: vec2_add(inter.start_pos, vec2_create(dx, dy)),
              } as any;
            }

            const next_state = {
              ...state,
              camera: {
                ...state.camera,
                position: vec2_add(state.camera.position, vec2_create(dx, dy)),
              },
              interaction: inter,
            };

            // Re-trigger pointer_move to recalculate logic with the new start_pos and camera
            return pointer_move(next_state, {
              screen_position: vec2_create(mouse_x, mouse_y),
              target_node_id: O.none,
              target_port_id: O.none,
              target_port_type: O.none,
              target_action: O.none,
              modifiers: state.modifiers,
            });
          });
        }
      }
    }
    if (is_pointer_down) {
      raf_id = requestAnimationFrame(loop);
    } else {
      raf_id = null;
    }
  };
};
