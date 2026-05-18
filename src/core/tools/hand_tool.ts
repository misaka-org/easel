/**
 * HandTool — 平移画布。
 */

import type { Interaction } from '@/core/types';
import type { Tool, ToolResult } from '@/core/tool';
import { vec2_sub, vec2_add } from '@/core/math';

export const hand_tool: Tool = {
  id: 'hand',
  label: 'Hand',
  cursor: 'grab',

  on_pointer_down: (state, _interaction, event): ToolResult => ({
    state: {
      ...state,
      interaction: {
        mode: 'panning',
        start_pos: event.screen_position,
        original_camera: state.camera.position,
      },
    },
    transition: undefined,
  }),

  on_pointer_move: (state, interaction, event): ToolResult => {
    if (interaction.mode !== 'panning') return { state };
    const i = interaction as Extract<Interaction, { mode: 'panning' }>;
    return {
      state: {
        ...state,
        camera: {
          ...state.camera,
          position: vec2_add(i.original_camera, vec2_sub(event.screen_position, i.start_pos)),
        },
      },
    };
  },

  on_pointer_up: (state, _interaction, _event): ToolResult => ({
    state: { ...state, interaction: { mode: 'idle' } },
  }),

  /** HandTool 缩放与非 ctrl wheel 平移。 */
  on_wheel: (state, event) => {
    if (event.modifiers.ctrl || event.modifiers.meta) {
      const factor = event.delta_y > 0 ? 0.9 : 1.1;
      const zoom = Math.max(0.1, Math.min(10, state.camera.zoom * factor));
      const mx = event.screen_position.x;
      const my = event.screen_position.y;
      const oc = state.camera.position;
      const oz = state.camera.zoom;
      return {
        state: {
          ...state,
          camera: {
            position: { x: mx - (mx - oc.x) * (zoom / oz), y: my - (my - oc.y) * (zoom / oz) },
            zoom,
          },
        },
      };
    }
    return {
      state: {
        ...state,
        camera: {
          ...state.camera,
          position: {
            x: state.camera.position.x - event.delta_x,
            y: state.camera.position.y - event.delta_y,
          },
        },
      },
    };
  },
};
