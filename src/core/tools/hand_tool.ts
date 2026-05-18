/**
 * HandTool — 平移画布。
 */

import type { State, Interaction } from '@/core/types';
import type { Tool, ToolResult } from '@/core/tool';
import type { PointerEventParams } from '@/core/interactions';
import { vec2_sub, vec2_add } from '@/core/math';

export const hand_tool: Tool = {
  id: 'hand',
  label: 'Hand',
  cursor: 'grab',

  onPointerDown: (state, _interaction, event): ToolResult => ({
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

  onPointerMove: (state, interaction, event): ToolResult => {
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

  onPointerUp: (state, _interaction, _event): ToolResult => ({
    state: { ...state, interaction: { mode: 'idle' } },
  }),
};
