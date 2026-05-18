/**
 * WireTool — 连线模式（点击 port 开始/结束连线）。
 */

import type { State, Interaction } from '@/core/types';
import type { Tool, ToolResult } from '@/core/tool';
import type { PointerEventParams } from '@/core/interactions';
import { add_wire, remove_wire } from '@/core/wire_ops';
import { remove_binding, find_binding_by_target } from '@/core/binding_ops';
import * as O from 'fp-ts/Option';
import { pipe } from 'fp-ts/function';

// ── Pure helpers ────────────────────────────────────────────────

const start_wiring = (state: State, source_node_id: string, source_port_id: string, event: PointerEventParams): State => ({
  ...state,
  interaction: { mode: 'wiring', source_node_id, source_port_id, target_pos: event.screen_position },
});

export const try_grab_wire = (state: State, event: PointerEventParams): O.Option<State> =>
  pipe(
    O.Do,
    O.bind('node_id', () => event.target_node_id),
    O.bind('port_id', () => event.target_port_id),
    O.bind('port_type', () => event.target_port_type),
    O.chain(({ node_id, port_id, port_type }) => {
      if (port_type === 'input') {
        const connected = Object.values(state.wires).find(
          w => w.target_node_id === node_id && w.target_port_id === port_id,
        ) ?? find_binding_by_target(state, node_id, port_id);
        if (connected) {
          const is_wire = 'source_node_id' in connected;
          const clean = is_wire ? remove_wire(state, connected.id) : remove_binding(state, connected.id);
          return O.some(
            start_wiring(clean, is_wire ? connected.source_node_id : connected.source_id,
              is_wire ? connected.source_port_id : connected.source_handle, event),
          );
        }
      } else if (port_type === 'output') {
        return O.some(start_wiring(state, node_id, port_id, event));
      }
      return O.none;
    }),
  );

export const try_connect_wire = (state: State, source_node_id: string, source_port_id: string, event: PointerEventParams): State =>
  pipe(
    O.Do,
    O.bind('target_node_id', () => event.target_node_id),
    O.chain(({ target_node_id }) => {
      if (target_node_id === source_node_id) return O.none;
      const source_port = state.nodes[source_node_id]?.outputs.find(p => p.id === source_port_id);
      const target_node = state.nodes[target_node_id];
      if (!source_port || !target_node) return O.none;

      const source_type = source_port.value_type || 'any';
      let target_port_id: string | undefined;
      let target_accepts: readonly string[] = ['any'];

      if (O.isSome(event.target_port_id) && O.isSome(event.target_port_type) && event.target_port_type.value === 'input') {
        target_port_id = event.target_port_id.value;
        const tp = target_node.inputs.find(p => p.id === target_port_id);
        const tw = target_node.widgets?.find(w => w.id === target_port_id);
        if (!tp && !tw) return O.none;
        target_accepts = tp ? (tp.accepts || [tp.value_type || 'any']) : (tw!.accepts || [tw!.value_type || 'any']);
      } else {
        const is_free = (id: string) =>
          !Object.values(state.wires).some(w => w.target_node_id === target_node_id && w.target_port_id === id) &&
          !find_binding_by_target(state, target_node_id, id);

        const compatible_input = target_node.inputs.find(p => {
          if (!is_free(p.id)) return false;
          const accepts = p.accepts || [p.value_type || 'any'];
          return accepts.includes('any') || source_type === 'any' || accepts.includes(source_type);
        });
        if (compatible_input) {
          target_port_id = compatible_input.id;
          target_accepts = compatible_input.accepts || [compatible_input.value_type || 'any'];
        } else {
          const compatible_widget = target_node.widgets?.find(w => {
            if (!is_free(w.id)) return false;
            const accepts = w.accepts || [w.value_type || 'any'];
            return accepts.includes('any') || source_type === 'any' || accepts.includes(source_type);
          });
          if (compatible_widget) {
            target_port_id = compatible_widget.id;
            target_accepts = compatible_widget.accepts || [compatible_widget.value_type || 'any'];
          }
        }
      }

      if (!target_port_id) return O.none;
      if (!(target_accepts.includes('any') || source_type === 'any' || target_accepts.includes(source_type))) return O.none;

      const existing = Object.values(state.wires).find(
        w => w.target_node_id === target_node_id && w.target_port_id === target_port_id,
      ) ?? find_binding_by_target(state, target_node_id, target_port_id);
      const clean = existing
        ? ('target_node_id' in existing ? remove_wire(state, existing.id) : remove_binding(state, existing.id))
        : state;

      return O.some(add_wire(clean, {
        id: `wire_${Date.now()}`,
        source_node_id, source_port_id,
        target_node_id, target_port_id,
      }));
    }),
    O.getOrElse(() => state),
  );

// ── Tool definition ─────────────────────────────────────────────

export const wire_tool: Tool = {
  id: 'wire',
  label: 'Wire',
  cursor: 'crosshair',

  onPointerDown: (state, _interaction, event): ToolResult => {
    const grabbed = try_grab_wire(state, event);
    if (O.isSome(grabbed)) return { state: grabbed.value };
    return { state };
  },

  onPointerMove: (state, interaction, event): ToolResult => {
    if (interaction.mode !== 'wiring') return { state };
    return {
      state: {
        ...state,
        interaction: { ...(interaction as Extract<Interaction, { mode: 'wiring' }>), target_pos: event.screen_position },
      },
    };
  },

  onPointerUp: (state, interaction, event): ToolResult => {
    let next = state;
    if (interaction.mode === 'wiring' && event) {
      const i = interaction as Extract<Interaction, { mode: 'wiring' }>;
      next = try_connect_wire(state, i.source_node_id, i.source_port_id, event);
    }
    return { state: { ...next, interaction: { mode: 'idle' } } };
  },
};
