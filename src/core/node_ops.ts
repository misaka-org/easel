import type { State, GraphNode, Binding, Port } from './types';
import type { Vec2 } from './math';
import { vec2_add, vec2_create } from './math';
import * as O from 'fp-ts/Option';
import { pipe } from 'fp-ts/function';
import { create_data_flow_binding } from './types';
import { auto_layout } from '@/runtime/auto_layout';

export const get_node = (state: State, node_id: string): O.Option<GraphNode> => {
  return O.fromNullable(state.nodes[node_id]);
};

export const add_node = (state: State, node: GraphNode): State => ({
  ...state,
  nodes: { ...state.nodes, [node.id]: node },
});

/** 从 bindings 中获取 node_id 的所有 group-child / subgraph-child 子节点 ID。 */
export const get_children_ids = (
  bindings: Record<string, Binding>,
  node_id: string,
): string[] =>
  Object.values(bindings)
    .filter(b => (b.type === 'group-child' || b.type === 'subgraph-child') && b.source_id === node_id)
    .map(b => b.target_id);

/**
 * 检查 parent_id 是否是 child_id 在组层次结构中的祖先。
 * 用于防止循环嵌套（A -> B -> A）。
 */
export const is_ancestor = (
  nodes: Record<string, GraphNode>,
  bindings: Record<string, Binding>,
  parent_id: string,
  child_id: string,
  visited = new Set<string>(),
): boolean => {
  if (visited.has(child_id)) return false;
  visited.add(child_id);
  const child = nodes[child_id];
  if (!child) return false;
  const children = get_children_ids(bindings, child_id);
  if (children.length === 0) return false;
  if (children.includes(parent_id)) return true;
  return children.some(c => is_ancestor(nodes, bindings, parent_id, c, visited));
};

export const move_node = (
  state: State,
  node_id: string,
  delta: Vec2,
  visited = new Set<string>(),
): State => {
  if (visited.has(node_id)) return state;
  visited.add(node_id);

  return pipe(
    get_node(state, node_id),
    O.map(node => {
      let next_state = {
        ...state,
        nodes: {
          ...state.nodes,
          [node_id]: {
            ...node,
            position: vec2_add(node.position, delta),
          },
        },
      };

      const children = get_children_ids(state.bindings, node_id);
      for (const child_id of children) {
        // 跳过会导致循环引用的 child（parent 是 child 的祖先）
        if (!is_ancestor(state.nodes, state.bindings, node_id, child_id)) {
          next_state = move_node(next_state, child_id, delta, visited);
        }
      }
      return next_state;
    }),
    O.getOrElse(() => state),
  );
};

export const move_nodes = (state: State, node_ids: readonly string[], delta: Vec2): State => {
  const visited = new Set<string>();
  return node_ids.reduce((acc, id) => move_node(acc, id, delta, visited), state);
};

export const update_node_data = (
  state: State,
  node_id: string,
  updater: (node: GraphNode) => GraphNode,
): State => {
  return pipe(
    get_node(state, node_id),
    O.map(node => ({
      ...state,
      nodes: {
        ...state.nodes,
        [node_id]: updater(node),
      },
    })),
    O.getOrElse(() => state),
  );
};

export const update_widget_value = (
  state: State,
  node_id: string,
  widget_id: string,
  value: string | number | boolean,
): State => {
  return update_node_data(state, node_id, node => {
    if (!node.widgets) return node;
    const widgets = node.widgets.map(w => (w.id === widget_id ? { ...w, value } : w));
    return { ...node, widgets };
  });
};

export const remove_node = (state: State, node_id: string): State => {
  const { [node_id]: _, ...rest_nodes } = state.nodes;

  const bindings = Object.fromEntries(
    Object.entries(state.bindings).filter(
      ([_, b]) => b.source_id !== node_id && b.target_id !== node_id,
    ),
  );

  return {
    ...state,
    nodes: rest_nodes,
    bindings,
    selected_node_ids: state.selected_node_ids.filter(id => id !== node_id),
  };
};

/** 选中节点 → 创建 subgraph（内部节点存入 custom_data.graph，不在主图里渲染）。 */
export const create_subgraph_from_selection = (state: State): State => {
  const node_ids = state.selected_node_ids.filter(id => {
    const n = state.nodes[id];
    return n && n.type !== 'subgraph_input' && n.type !== 'subgraph_output';
  });
  if (node_ids.length === 0) return state;

  // subgraph 位置：取第一个选中节点的位置
  const first = state.nodes[node_ids[0]];
  const sx = first.position.x + 20;
  const sy = first.position.y + 20;

  const subgraph_id = `subgraph_${Date.now()}`;
  const stub_in_id = `subgraph_input_${Date.now()}`;
  const stub_out_id = `subgraph_output_${Date.now()}`;

  // 收集跨越边界的连接
  type XBound = { src_id: string; src_port: string; src_label: string; tgt_id: string; tgt_port: string; tgt_label: string; vtype?: string };

  const external_inputs: XBound[] = [];
  const external_outputs: XBound[] = [];
  const sel = new Set(node_ids);

  for (const b of Object.values(state.bindings)) {
    if (b.type !== 'data-flow') continue;
    const in_s = sel.has(b.source_id);
    const in_t = sel.has(b.target_id);
    if (in_s && in_t) continue;
    if (!in_s && !in_t) continue;

    if (!in_s && in_t) {
      const tp = state.nodes[b.target_id]?.inputs.find(p => p.id === b.target_handle);
      if (tp) {
        const sp = state.nodes[b.source_id]?.outputs.find(p => p.id === b.source_handle);
        external_inputs.push({
          src_id: b.source_id, src_port: b.source_handle,
          src_label: sp?.label || b.source_handle,
          tgt_id: b.target_id, tgt_port: b.target_handle,
          tgt_label: tp.label,
          vtype: tp.value_type,
        });
      }
    } else {
      const sp = state.nodes[b.source_id]?.outputs.find(p => p.id === b.source_handle);
      if (sp) {
        const tp = state.nodes[b.target_id]?.inputs.find(p => p.id === b.target_handle);
        external_outputs.push({
          src_id: b.source_id, src_port: b.source_handle,
          src_label: sp.label,
          tgt_id: b.target_id, tgt_port: b.target_handle,
          tgt_label: tp?.label || b.target_handle,
          vtype: sp.value_type,
        });
      }
    }
  }

  // subgraph 大小按 port 数量决定
  const sg_pc = Math.max(external_inputs.length, external_outputs.length, 1);
  const sw = 200;
  const sh = 40 + sg_pc * 22 + 20;

  // 1) subgraph 边界端口
  const input_ports: Port[] = external_inputs.map((e, i) => ({
    id: `sg_in_${i}`, label: e.src_label, type: 'input' as const, value_type: e.vtype,
  }));
  const output_ports: Port[] = external_outputs.map((e, i) => ({
    id: `sg_out_${i}`, label: e.tgt_label, type: 'output' as const, value_type: e.vtype,
  }));

  // 2) stub input（内部可见）：output 代表从外部流入的数据
  const stub_in_ports: Port[] = external_inputs.map((e, i) => ({
    id: `sgi_out_${i}`, label: e.src_label, type: 'output' as const, value_type: e.vtype,
  }));
  const stub_in_node: GraphNode = {
    id: stub_in_id, type: 'subgraph_input',
    position: vec2_create(10, 60),
    size: vec2_create(20, Math.max(20, stub_in_ports.length * 22 + 20)),
    title: 'Inputs', inputs: [], outputs: stub_in_ports,
    widgets: [], custom_data: {}, resizable: false,
  };

  // stub output（内部可见）：input 代表输出到外部的数据
  const stub_out_ports: Port[] = external_outputs.map((e, i) => ({
    id: `sgo_in_${i}`, label: e.tgt_label, type: 'input' as const, value_type: e.vtype,
  }));
  const stub_out_node: GraphNode = {
    id: stub_out_id, type: 'subgraph_output',
    position: vec2_create(sw - 40, 60),
    size: vec2_create(20, Math.max(20, stub_out_ports.length * 22 + 20)),
    title: 'Outputs', inputs: stub_out_ports, outputs: [],
    widgets: [], custom_data: {}, resizable: false,
  };

  // 3) 内部 binding（stub ↔ 内部节点 + 内部节点之间的连接）
  const internal_bindings: Record<string, Binding> = {};
  const mk_int = (src: string, sph: string, tgt: string, tph: string) => {
    const b = create_data_flow_binding(src, sph, tgt, tph);
    internal_bindings[b.id] = b;
  };
  for (let i = 0; i < external_inputs.length; i++) {
    const e = external_inputs[i];
    mk_int(stub_in_id, `sgi_out_${i}`, e.tgt_id, e.tgt_port);
  }
  for (let i = 0; i < external_outputs.length; i++) {
    const e = external_outputs[i];
    mk_int(e.src_id, e.src_port, stub_out_id, `sgo_in_${i}`);
  }
  // 内部节点之间的 wire
  for (const b of Object.values(state.bindings)) {
    if (b.type !== 'data-flow') continue;
    if (sel.has(b.source_id) && sel.has(b.target_id)) {
      internal_bindings[b.id] = b;
    }
  }

  // 4) subgraph 节点（内部数据存入 custom_data）
  const internal_nodes: Record<string, GraphNode> = {};
  for (const id of node_ids) {
    internal_nodes[id] = state.nodes[id];
  }
  internal_nodes[stub_in_id] = stub_in_node;
  internal_nodes[stub_out_id] = stub_out_node;

  // 内部节点自动布局
  const { positions: layout_pos } = auto_layout(internal_nodes, internal_bindings, 800, 600);
  for (const [id, pos] of Object.entries(layout_pos)) {
    if (internal_nodes[id]) {
      internal_nodes[id] = { ...internal_nodes[id], position: pos };
    }
  }

  const subgraph_node: GraphNode = {
    id: subgraph_id, type: 'subgraph',
    position: vec2_create(sx, sy), size: vec2_create(sw, sh),
    title: 'Subgraph',
    inputs: input_ports, outputs: output_ports,
    widgets: [], resizable: true,
    custom_data: {
      graph: { nodes: internal_nodes, bindings: internal_bindings },
    },
  };

  // 5) 从主图移除内部节点及其所有 binding
  let new_nodes = { ...state.nodes };
  let new_bindings = { ...state.bindings };

  for (const id of node_ids) {
    const { [id]: _, ...rest } = new_nodes;
    new_nodes = rest;
  }
  const rm_binding_ids = Object.entries(new_bindings)
    .filter(([_, b]) => b.type === 'data-flow' && (sel.has(b.source_id) || sel.has(b.target_id)))
    .map(([id]) => id);
  for (const id of rm_binding_ids) {
    const { [id]: _, ...rest } = new_bindings;
    new_bindings = rest;
  }

  // 6) 加入 subgraph 节点 + 外部 binding 直连 subgraph 端口
  new_nodes[subgraph_id] = subgraph_node;
  for (let i = 0; i < external_inputs.length; i++) {
    const e = external_inputs[i];
    const b = create_data_flow_binding(e.src_id, e.src_port, subgraph_id, `sg_in_${i}`);
    new_bindings = { ...new_bindings, [b.id]: b };
  }
  for (let i = 0; i < external_outputs.length; i++) {
    const e = external_outputs[i];
    const b = create_data_flow_binding(subgraph_id, `sg_out_${i}`, e.tgt_id, e.tgt_port);
    new_bindings = { ...new_bindings, [b.id]: b };
  }

  return {
    ...state,
    nodes: new_nodes,
    bindings: new_bindings,
    selected_node_ids: [subgraph_id],
  };
};

/** 展开 subgraph：内部节点恢复到主图，外部 wire 直连回内部节点，移除 subgraph。 */
export const expand_subgraph = (state: State, subgraph_id: string): State => {
  const sg = state.nodes[subgraph_id];
  if (!sg || sg.type !== 'subgraph') return state;

  const gd = sg.custom_data?.['graph'] as
    | { nodes: Record<string, GraphNode>; bindings: Record<string, Binding> }
    | undefined;
  if (!gd) return state;

  const inner_nodes = gd.nodes;
  const inner_bindings = gd.bindings;

  // 分离 stub 和内部节点
  const stub_ids = new Set<string>();
  const internal_ids: string[] = [];
  for (const [id, n] of Object.entries(inner_nodes)) {
    if (n.type === 'subgraph_input' || n.type === 'subgraph_output') stub_ids.add(id);
    else internal_ids.push(id);
  }

  // 移除 subgraph 节点
  let new_nodes = { ...state.nodes };
  const { [subgraph_id]: _, ...nodes_after_rm } = new_nodes;
  new_nodes = nodes_after_rm;

  // 内部节点恢复到主图（坐标相对 subgraph 偏移）
  for (const id of internal_ids) {
    const n = inner_nodes[id];
    if (!n) continue;
    new_nodes[id] = {
      ...n,
      position: vec2_create(n.position.x + sg.position.x, n.position.y + sg.position.y),
    };
  }

  // 清理 subgraph 相关的外部 binding
  let new_bindings = { ...state.bindings };
  const sub_rm = Object.entries(new_bindings)
    .filter(([_, b]) => b.type === 'data-flow' && (b.source_id === subgraph_id || b.target_id === subgraph_id))
    .map(([id]) => id);
  for (const id of sub_rm) {
    const { [id]: _, ...rest } = new_bindings;
    new_bindings = rest;
  }

  // 1) 恢复内部节点之间的 wire
  for (const b of Object.values(inner_bindings)) {
    if (b.type !== 'data-flow') continue;
    if (stub_ids.has(b.source_id) || stub_ids.has(b.target_id)) continue;
    const nb = create_data_flow_binding(b.source_id, b.source_handle, b.target_id, b.target_handle);
    new_bindings = { ...new_bindings, [nb.id]: nb };
  }

  // 2) 外部 wire 重连：通过 stub port 索引还原直连
  for (const b of Object.values(state.bindings)) {
    if (b.type !== 'data-flow') continue;

    if (b.source_id === subgraph_id) {
      // subgraph(sg_out_X) → external — 找到对应 internal → stub_out(sgo_in_X)
      const m = b.source_handle.match(/^sg_out_(\d+)$/);
      if (!m) continue;
      const idx = parseInt(m[1]);
      const stub = Object.values(inner_nodes).find(n => n.type === 'subgraph_output');
      if (!stub) continue;
      const stub_port = `sgo_in_${idx}`;
      const src_int = Object.values(inner_bindings).find(
        ib => ib.type === 'data-flow' && ib.target_id === stub.id && ib.target_handle === stub_port,
      );
      if (src_int) {
        const nb = create_data_flow_binding(src_int.source_id, src_int.source_handle, b.target_id, b.target_handle);
        new_bindings = { ...new_bindings, [nb.id]: nb };
      }
    } else if (b.target_id === subgraph_id) {
      // external → subgraph(sg_in_X) — 找到对应 stub_in(sgi_out_X) → internal
      const m = b.target_handle.match(/^sg_in_(\d+)$/);
      if (!m) continue;
      const idx = parseInt(m[1]);
      const stub = Object.values(inner_nodes).find(n => n.type === 'subgraph_input');
      if (!stub) continue;
      const stub_port = `sgi_out_${idx}`;
      const tgt_int = Object.values(inner_bindings).find(
        ib => ib.type === 'data-flow' && ib.source_id === stub.id && ib.source_handle === stub_port,
      );
      if (tgt_int) {
        const nb = create_data_flow_binding(b.source_id, b.source_handle, tgt_int.target_id, tgt_int.target_handle);
        new_bindings = { ...new_bindings, [nb.id]: nb };
      }
    }
  }

  return { ...state, nodes: new_nodes, bindings: new_bindings, selected_node_ids: internal_ids };
};
