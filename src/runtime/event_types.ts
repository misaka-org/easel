import type { State } from '@/core/types';

export interface EaselEvents {
  state_changed: (payload: { prev: State; next: State }) => void;
  pointerdown: (e: PointerEvent) => void;
  pointermove: (e: PointerEvent) => void;
  pointerup: (e: PointerEvent) => void;
  keydown: (e: KeyboardEvent) => void;
  keyup: (e: KeyboardEvent) => void;
  contextmenu: (e: MouseEvent) => void;
  node_dblclick: (payload: { node_id: string; target: HTMLElement }) => void;
  nodes_dropped: (node_ids: string[]) => void;
  enter_subgraph: (payload: { node_id: string }) => void;
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  create_group: (payload: {}) => void;
}