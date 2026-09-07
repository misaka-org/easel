/**
 * WireTool — 连线交互工具（插件版）。
 *
 * 从 src/core/tools/wire_tool.ts 迁移，适配为使用 plugin API。
 * 连线状态存储在插件闭包 wire_state 中，不再依赖 state.interaction.mode === 'wiring'。
 */

import type { Easel } from '@/runtime/easel';
import type { State, Port, Widget } from '@/core/types';
import type { Tool, ToolResult } from '@/core/tool';
import type { PointerEventParams } from '@/core/interactions';
import { create_data_flow_binding } from './index';
import { is_binding_locked } from './lock';
import * as O from 'fp-ts/Option';
import { pipe } from 'fp-ts/function';
// ── WireState（临时连线状态，替代 interaction.mode === 'wiring'）───

export type WireState = {
  is_wiring: boolean;
  source_node_id: string;
  source_port_id: string;
  target_pos: { x: number; y: number };
};

// ── 工厂函数 ────────────────────────────────────────────────────

export const wire_tool = (easel: Easel, wire_state: WireState): Tool => {

  // ── Pure helpers ──────────────────────────────────────────────

  const start_wiring = (
    state: State,
    source_node_id: string,
    source_port_id: string,
    event: PointerEventParams,
  ): State => {
    wire_state.is_wiring = true;
    wire_state.source_node_id = source_node_id;
    wire_state.source_port_id = source_port_id;
    wire_state.target_pos = event.screen_position;
    return state;
  };

  /** 在 subgraph_input 上自动创建 output port 并开始连线。 */
  const try_grab_subgraph_input = (state: State, event: PointerEventParams): O.Option<State> =>
    pipe(
      event.target_node_id,
      O.filter(nid => {
        const n = state.nodes[nid];
        return !!n && n.type === 'subgraph_input';
      }),
      O.chain(nid => {
        const n = state.nodes[nid]!;
        const new_port: Port = {
          id: `sgi_out_auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          label: `Input ${n.outputs.length + 1}`,
          type: 'output',
        };
        const new_node = { ...n, outputs: [...n.outputs, new_port] };
        const new_state = { ...state, nodes: { ...state.nodes, [nid]: new_node } };
        return O.some(start_wiring(new_state, nid, new_port.id, event));
      }),
    );

  const try_grab_wire = (state: State, event: PointerEventParams): O.Option<State> =>
    pipe(
      O.Do,
      O.bind('node_id', () => event.target_node_id),
      O.bind('port_id', () => event.target_port_id),
      O.bind('port_type', () => event.target_port_type),
      O.chain(({ node_id, port_id, port_type }) => {
        if (port_type === 'input') {
          const b = easel.plugin_data.wire!.find_by_target(node_id, port_id);
          if (b) {
            if (is_binding_locked(state.nodes, b)) return O.none;
            easel.plugin_data.wire!.remove_binding(b.id);
            return O.some(start_wiring(state, b.source_id, b.source_handle, event));
          }
        } else if (port_type === 'output') {
          return O.some(start_wiring(state, node_id, port_id, event));
        }
        return O.none;
      }),
      O.alt(() => try_grab_subgraph_input(state, event)),
    );

  const try_connect_wire = (state: State, event: PointerEventParams): State =>
    pipe(
      O.Do,
      O.bind('target_node_id', () => event.target_node_id),
      O.chain(({ target_node_id }) => {
        if (target_node_id === wire_state.source_node_id) return O.none;
        const source_port = state.nodes[wire_state.source_node_id]?.outputs.find((p: Port) => p.id === wire_state.source_port_id,
        );
        const target_node = state.nodes[target_node_id];
        if (!source_port || !target_node) return O.none;

        const source_type = source_port.value_type || 'any';
        let target_port_id: string | undefined;
        let target_accepts: readonly string[] = ['any'];

        if (
          O.isSome(event.target_port_id) &&
          O.isSome(event.target_port_type) &&
          event.target_port_type.value === 'input'
        ) {
          target_port_id = event.target_port_id.value;
          const tp = target_node.inputs.find((p: Port) => p.id === target_port_id);
      const tw = target_node.widgets?.find((w: Widget) => w.id === target_port_id);
          if (!tp && !tw) return O.none;
          target_accepts = tp
            ? (tp.accepts || [tp.value_type || 'any'])
            : (tw!.accepts || [tw!.value_type || 'any']);
        } else {
          const is_free = (id: string) => !easel.plugin_data.wire!.find_by_target(target_node_id, id);

          const compatible_input = target_node.inputs.find((p: Port) => {
            if (!is_free(p.id)) return false;
            const accepts = p.accepts || [p.value_type || 'any'];
            return accepts.includes('any') || source_type === 'any' || accepts.includes(source_type);
          });
          if (compatible_input) {
            target_port_id = compatible_input.id;
            target_accepts = compatible_input.accepts || [compatible_input.value_type || 'any'];
          } else {
            const compatible_widget = target_node.widgets?.find((w: Widget) => {
              if (!is_free(w.id)) return false;
              const accepts = w.accepts || [w.value_type || 'any'];
              return (
                accepts.includes('any') || source_type === 'any' || accepts.includes(source_type)
              );
            });
            if (compatible_widget) {
              target_port_id = compatible_widget.id;
              target_accepts = compatible_widget.accepts || [compatible_widget.value_type || 'any'];
            }
          }
        }

        // 自动创建 port：拖线到 subgraph_output body 且无兼容 port
        if (!target_port_id && target_node.type === 'subgraph_output') {
          const new_port: Port = {
            id: `sgo_in_auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            label: `Output ${target_node.inputs.length + 1}`,
            type: 'input',
            accepts: [source_type === 'any' ? 'any' : source_type],
            value_type: source_type === 'any' ? undefined : source_type,
          };
          state = {
            ...state,
            nodes: {
              ...state.nodes,
              [target_node_id]: {
                ...target_node,
                inputs: [...target_node.inputs, new_port],
              },
            },
          };
          target_port_id = new_port.id;
          target_accepts = new_port.accepts!;
        }

        if (!target_port_id) return O.none;
        if (
          !(target_accepts.includes('any') || source_type === 'any' || target_accepts.includes(source_type))
        ) return O.none;

        // 删除旧 binding（如果已连接）
        const existing = easel.plugin_data.wire!.find_by_target(target_node_id, target_port_id);
        if (existing && is_binding_locked(state.nodes, existing)) return O.none;
        if (existing) easel.plugin_data.wire!.remove_binding(existing.id);

        const binding = create_data_flow_binding(
          wire_state.source_node_id,
          wire_state.source_port_id,
          target_node_id,
          target_port_id,
        );
        easel.plugin_data.wire!.add_binding(binding);

        return O.some(state);
      }),
      O.getOrElse(() => state),
    );

  // ── Tool definition ───────────────────────────────────────────

  return {
    id: 'wire',
    label: 'Wire',
    cursor: 'crosshair',

    on_pointer_down: (state, _interaction, event): ToolResult => {
      const grabbed = try_grab_wire(state, event);
      if (O.isSome(grabbed)) return { state: grabbed.value };
      return { state };
    },

    on_pointer_move: (state, _interaction, event): ToolResult => {
      if (!wire_state.is_wiring) return { state };
      wire_state.target_pos = event.screen_position;
      return { state };
    },

    on_pointer_up: (state, _interaction, event): ToolResult => {
      if (wire_state.is_wiring && event) {
        state = try_connect_wire(state, event);
      }
      wire_state.is_wiring = false;
      return { state };
    },
  };
};