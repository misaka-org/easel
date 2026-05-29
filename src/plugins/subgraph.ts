import type { EaselPlugin, Easel } from '@/runtime/easel';
import { create_initial_state } from '@/core/state';
import { update_node_data } from '@/core/node_ops';
import type { State, GraphNode, Port } from '@/core/types';
import { vec2_create } from '@/core/math';

// 本地 Binding 类型（与 wire 插件结构兼容）
type Binding = {
  readonly id: string;
  readonly source_id: string;
  readonly source_handle: string;
  readonly target_id: string;
  readonly target_handle: string;
};

declare module '@/runtime/easel' {
  interface EaselPluginData {
    subgraph?: {
      exit: () => void;
      clear: () => void;
      stack_depth: () => number;
      create_from_selection: () => void;
      expand: (subgraph_id: string) => void;
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────

const make_binding = (
  source_id: string,
  source_handle: string,
  target_id: string,
  target_handle: string,
): Binding => ({
  id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  source_id,
  source_handle,
  target_id,
  target_handle,
});

// ── create_subgraph_from_selection ───────────────────────────────

const create_subgraph_from_selection = (easel: Easel): void => {
  const state = easel.state.value;
  const wire_api = easel.plugin_data.wire!;

  // 1. 过滤选中节点（排除 stub 类型）
  const selected_ids = state.selected_node_ids.filter(id => {
    const n = state.nodes[id];
    return n && n.type !== 'subgraph_input' && n.type !== 'subgraph_output';
  });
  if (selected_ids.length === 0) return;

  const selected_set = new Set(selected_ids);
  const all_bindings = wire_api.get_bindings();

  // 2. 分类连线
  const external_inputs: Binding[] = [];  // 外部→内部
  const external_outputs: Binding[] = []; // 内部→外部
  const internal_bindings: Binding[] = []; // 内部↔内部

  for (const b of all_bindings) {
    const src_in = selected_set.has(b.source_id);
    const tgt_in = selected_set.has(b.target_id);
    if (src_in && tgt_in) {
      internal_bindings.push(b);
    } else if (src_in && !tgt_in) {
      external_outputs.push(b);
    } else if (!src_in && tgt_in) {
      external_inputs.push(b);
    }
  }

  // 3. 创建 subgraph 节点
  const sg_id = `subgraph_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // 计算包围盒
  let min_x = Infinity, min_y = Infinity;
  let max_x = -Infinity, max_y = -Infinity;
  for (const id of selected_ids) {
    const n = state.nodes[id];
    if (!n) continue;
    if (n.position.x < min_x) min_x = n.position.x;
    if (n.position.y < min_y) min_y = n.position.y;
    if (n.position.x + n.size.x > max_x) max_x = n.position.x + n.size.x;
    if (n.position.y + n.size.y > max_y) max_y = n.position.y + n.size.y;
  }
  const sg_pos = vec2_create(min_x, min_y);
  const sg_size = vec2_create(max_x - min_x, Math.max(100, max_y - min_y));

  // subgraph 端口
  // external_inputs（外部→内部）：subgraph 是 target → INPUT 端口
  // external_outputs（内部→外部）：subgraph 是 source → OUTPUT 端口
  const input_ports: Port[] = external_outputs.map((_b, i) => ({
    id: `sg_in_${i}`,
    label: `Output ${i + 1}`,
    type: 'input',
  }));
  const output_ports: Port[] = external_inputs.map((_b, i) => ({
    id: `sg_out_${i}`,
    label: `Input ${i + 1}`,
    type: 'output',
  }));

  // 内部节点克隆
  const internal_nodes: Record<string, GraphNode> = {};
  for (const id of selected_ids) {
    const n = state.nodes[id];
    if (n) internal_nodes[id] = { ...n };
  }

  // stub 节点
  const stub_input_id = `sgi_${sg_id}`;
  const stub_output_id = `sgo_${sg_id}`;

  // subgraph_input：外部数据流入内部中转
  const stub_input_ports: Port[] = external_inputs.map((_b, i) => ({
    id: `sgi_out_${i}`,
    label: `In ${i + 1}`,
    type: 'output',
  }));

  // subgraph_output：内部数据流出到外部中转
  const stub_output_ports: Port[] = external_outputs.map((_b, i) => ({
    id: `sgo_in_${i}`,
    label: `Out ${i + 1}`,
    type: 'input',
  }));

  const stub_input_node: GraphNode = {
    id: stub_input_id,
    type: 'subgraph_input',
    position: vec2_create(0, 0),
    size: vec2_create(20, 20),
    title: 'Input',
    inputs: [],
    outputs: stub_input_ports,
    widgets: [],
    custom_data: {},
  };

  const stub_output_node: GraphNode = {
    id: stub_output_id,
    type: 'subgraph_output',
    position: vec2_create(0, 0),
    size: vec2_create(20, 20),
    title: 'Output',
    inputs: stub_output_ports,
    outputs: [],
    widgets: [],
    custom_data: {},
  };

  internal_nodes[stub_input_id] = stub_input_node;
  internal_nodes[stub_output_id] = stub_output_node;

  // 5. 内部连线
  const internal_bindings_list: Binding[] = [
    ...internal_bindings.map(b => ({ ...b })),
  ];

  // external_inputs（外部→内部）：stub_input.output → 内部目标
  for (let i = 0; i < external_inputs.length; i++) {
    const b = external_inputs[i];
    internal_bindings_list.push(make_binding(
      stub_input_id,
      stub_input_ports[i]!.id,
      b.target_id,
      b.target_handle,
    ));
  }

  // external_outputs（内部→外部）：内部源 → stub_output.input
  for (let i = 0; i < external_outputs.length; i++) {
    const b = external_outputs[i];
    internal_bindings_list.push(make_binding(
      b.source_id,
      b.source_handle,
      stub_output_id,
      stub_output_ports[i]!.id,
    ));
  }

  // subgraph 节点
  const subgraph_node: GraphNode = {
    id: sg_id,
    type: 'subgraph',
    position: sg_pos,
    size: sg_size,
    title: 'Subgraph',
    inputs: input_ports,
    outputs: output_ports,
    widgets: [],
    custom_data: {
      graph: {
        nodes: internal_nodes,
        bindings: internal_bindings_list,
      },
    },
  };

  // 7-8. 事务更新
  easel.store.transact(() => {
    // 删除内部节点
    for (const id of selected_ids) {
      easel.store.nodes.delete(id);
    }

    // 删除所有涉及内部节点的连线
    for (const b of all_bindings) {
      if (selected_set.has(b.source_id) || selected_set.has(b.target_id)) {
        wire_api.remove_binding(b.id);
      }
    }

    // 添加 subgraph 节点
    easel.store.nodes.put(sg_id, subgraph_node);

    // 外部重连
    for (let i = 0; i < external_inputs.length; i++) {
      const b = external_inputs[i];
      wire_api.add_binding(make_binding(
        b.source_id,
        b.source_handle,
        sg_id,
        output_ports[i]!.id,
      ));
    }

    for (let i = 0; i < external_outputs.length; i++) {
      const b = external_outputs[i];
      wire_api.add_binding(make_binding(
        sg_id,
        input_ports[i]!.id,
        b.target_id,
        b.target_handle,
      ));
    }

    // 更新选中
    easel.dispatch(s => ({
      ...s,
      selected_node_ids: [sg_id],
    }));
  });
};

// ── expand_subgraph ─────────────────────────────────────────────

const expand_subgraph = (easel: Easel, subgraph_id: string): void => {
  const state = easel.state.value;
  const wire_api = easel.plugin_data.wire!;

  const sg_node = state.nodes[subgraph_id];
  if (!sg_node || sg_node.type !== 'subgraph') return;

  const graph = sg_node.custom_data?.['graph'] as
    | { nodes: Record<string, GraphNode>; bindings: Binding[] }
    | undefined;
  if (!graph) return;

  const { nodes: internal_nodes, bindings: internal_bindings } = graph;

  // 计算偏移
  const first_real = Object.values(internal_nodes).find(
    n => n.type !== 'subgraph_input' && n.type !== 'subgraph_output',
  );
  const offset = first_real
    ? vec2_create(
        sg_node.position.x - first_real.position.x,
        sg_node.position.y - first_real.position.y,
      )
    : vec2_create(sg_node.position.x, sg_node.position.y);

  // 恢复的非 stub 节点
  const restored_nodes: Record<string, GraphNode> = {};
  for (const [id, n] of Object.entries(internal_nodes)) {
    if (n.type === 'subgraph_input' || n.type === 'subgraph_output') continue;
    restored_nodes[id] = {
      ...n,
      position: vec2_create(n.position.x + offset.x, n.position.y + offset.y),
    };
  }

  const stub_input = Object.values(internal_nodes).find(n => n.type === 'subgraph_input');
  const stub_output = Object.values(internal_nodes).find(n => n.type === 'subgraph_output');

  // 清理 subgraph 相关外部连线
  const all_bindings = wire_api.get_bindings();
  const external_removals: string[] = [];
  const external_output_bindings: { b: Binding; port_idx: number }[] = [];
  const external_input_bindings: { b: Binding; port_idx: number }[] = [];

  for (const b of all_bindings) {
    if (b.source_id === subgraph_id) {
      const port_idx = sg_node.outputs.findIndex(p => p.id === b.source_handle);
      if (port_idx >= 0) external_output_bindings.push({ b, port_idx });
      external_removals.push(b.id);
    } else if (b.target_id === subgraph_id) {
      const port_idx = sg_node.inputs.findIndex(p => p.id === b.target_handle);
      if (port_idx >= 0) external_input_bindings.push({ b, port_idx });
      external_removals.push(b.id);
    }
  }

  // 事务更新
  easel.store.transact(() => {
    // 删除 subgraph 节点
    easel.store.nodes.delete(subgraph_id);

    // 删除 subgraph 相关外部连线
    for (const id of external_removals) {
      wire_api.remove_binding(id);
    }

    // 添加恢复的节点
    for (const [id, node] of Object.entries(restored_nodes)) {
      easel.store.nodes.put(id, node);
    }

    // 恢复内部节点间连线（排除 stub 相关）
    for (const b of internal_bindings) {
      const is_stub_wire =
        (stub_input && (b.source_id === stub_input.id || b.target_id === stub_input.id)) ||
        (stub_output && (b.source_id === stub_output.id || b.target_id === stub_output.id));
      if (!is_stub_wire && restored_nodes[b.source_id] && restored_nodes[b.target_id]) {
        wire_api.add_binding(make_binding(
          b.source_id, b.source_handle,
          b.target_id, b.target_handle,
        ));
      }
    }

    // 外部→内部重连
    for (const { b, port_idx } of external_input_bindings) {
      const stub_port_id = stub_input?.outputs[port_idx]?.id;
      if (stub_port_id) {
        const internal_wire = internal_bindings.find(
          ib => ib.source_id === stub_input!.id && ib.source_handle === stub_port_id,
        );
        if (internal_wire) {
          wire_api.add_binding(make_binding(
            b.source_id, b.source_handle,
            internal_wire.target_id, internal_wire.target_handle,
          ));
        }
      }
    }

    // 内部→外部重连
    for (const { b, port_idx } of external_output_bindings) {
      const stub_port_id = stub_output?.inputs[port_idx]?.id;
      if (stub_port_id) {
        const internal_wire = internal_bindings.find(
          ib => ib.target_id === stub_output!.id && ib.target_handle === stub_port_id,
        );
        if (internal_wire) {
          wire_api.add_binding(make_binding(
            internal_wire.source_id, internal_wire.source_handle,
            b.target_id, b.target_handle,
          ));
        }
      }
    }

    // 选中恢复的节点
    easel.dispatch(s => ({
      ...s,
      selected_node_ids: Object.keys(restored_nodes),
    }));
  });
};

// ── Plugin ──────────────────────────────────────────────────────

export const subgraph_plugin: EaselPlugin = easel => {
  type StackItem = { parent_node_id: string; parent_state: State };
  const graph_stack: StackItem[] = [];

  // Enter subgraph
  easel.app_events.on('enter_subgraph', ({ node_id }) => {
    const node = easel.state.value.nodes[node_id];
    if (!node) return;

    graph_stack.push({ parent_node_id: node_id, parent_state: easel.state.value });

    const inner_graph = (node.custom_data?.['graph'] as
      | { nodes: any; edges: any }
      | undefined) || { nodes: {}, edges: [] };

    // TODO: also restore internal bindings to wire extension table
    easel.dispatch(() => ({
      ...create_initial_state(),
      nodes: inner_graph.nodes,
    }));
  });

  // Exit subgraph
  const exit_subgraph = () => {
    if (graph_stack.length === 0) return;
    const parent = graph_stack.pop()!;
    const inner_nodes = easel.state.value.nodes;
    const inner_edges = easel.plugin_data.wire?.get_bindings() ?? [];

    const parent_state = update_node_data(
      parent.parent_state,
      parent.parent_node_id,
      n => ({
        ...n,
        custom_data: {
          ...n.custom_data,
          graph: { nodes: inner_nodes, edges: inner_edges },
        },
      }),
    );

    easel.dispatch(() => parent_state);
  };

  const clear_stack = () => { graph_stack.length = 0; };

  easel.plugin_data.subgraph = {
    exit: exit_subgraph,
    clear: clear_stack,
    stack_depth: () => graph_stack.length,
    create_from_selection: () => create_subgraph_from_selection(easel),
    expand: (id) => expand_subgraph(easel, id),
  };

  // Escape → exit subgraph
  easel.keybindings.register({
    id: 'subgraph.exit',
    key: 'Escape',
    handler: exit_subgraph,
    description: 'Exit current subgraph',
  });

  // Ctrl+Shift+G → create subgraph from selection
  easel.keybindings.register({
    id: 'subgraph.create',
    key: 'g',
    ctrl: true,
    shift: true,
    handler: () => {
      create_subgraph_from_selection(easel);
    },
    description: 'Create subgraph from selection',
  });

  // Ctrl+Shift+E → expand subgraph
  easel.keybindings.register({
    id: 'subgraph.expand',
    key: 'e',
    ctrl: true,
    shift: true,
    handler: () => {
      const selected = easel.state.value.selected_node_ids;
      if (selected.length === 1) {
        expand_subgraph(easel, selected[0]);
      }
    },
    description: 'Expand selected subgraph',
  });
};