import type { State } from './types';
import { vec2_create } from './math';

export const create_initial_state = (): State => ({
  nodes: {},
  wires: {},
  bindings: {},
  camera: { position: vec2_create(0, 0), zoom: 1 },
  interaction: { mode: 'idle' },
  selected_node_ids: [],
  modifiers: { ctrl: false, shift: false, alt: false, meta: false },
  active_tool: 'select',
});
