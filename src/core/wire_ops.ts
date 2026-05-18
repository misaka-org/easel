import type { State } from './types';

/**
 * @deprecated Use binding_ops instead. Functions kept as no-ops for backward compat.
 */
export const add_wire = (state: State, _wire: any): State => state;
export const remove_wire = (state: State, _wire_id: string): State => state;
export const clear_wires = (state: State): State => state;
