import type { State, Wire } from './types';

export const add_wire = (state: State, wire: Wire): State => ({
  ...state,
  wires: { ...state.wires, [wire.id]: wire },
});

export const remove_wire = (state: State, wire_id: string): State => {
  const { [wire_id]: _, ...rest_wires } = state.wires;
  return {
    ...state,
    wires: rest_wires,
  };
};

export const clear_wires = (state: State): State => ({
  ...state,
  wires: {},
});
