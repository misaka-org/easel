import type { EaselPlugin, Easel } from '@/runtime/easel';
import { wire_tool } from './wire_tool';
import type { WireState } from './wire_tool';
import { render_wires } from './render';
import { reactive } from '@vue/reactivity';

// ── DataFlowBinding 类型 ────────────────────────────────────────

export type DataFlowBinding = {
  readonly id: string;
  readonly source_id: string;
  readonly source_handle: string;
  readonly target_id: string;
  readonly target_handle: string;
};

// ── 工厂函数 ────────────────────────────────────────────────────

export const create_data_flow_binding = (
  source_node_id: string,
  source_port_id: string,
  target_node_id: string,
  target_port_id: string,
): DataFlowBinding => ({
  id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  source_id: source_node_id,
  source_handle: source_port_id,
  target_id: target_node_id,
  target_handle: target_port_id,
});

// ── Binding 操作（纯函数）────────────────────────────────────────

export const find_binding_by_target = (
  bindings: Record<string, DataFlowBinding>,
  target_node_id: string,
  target_port_id: string,
): DataFlowBinding | undefined => {
  return Object.values(bindings).find(
    b => b.target_id === target_node_id && b.target_handle === target_port_id,
  );
};

export const find_binding_by_source = (
  bindings: Record<string, DataFlowBinding>,
  source_node_id: string,
  source_port_id: string,
): DataFlowBinding | undefined => {
  return Object.values(bindings).find(
    b => b.source_id === source_node_id && b.source_handle === source_port_id,
  );
};

export const is_port_connected = (
  bindings: Record<string, DataFlowBinding>,
  node_id: string,
  port_id: string,
  port_type: 'input' | 'output',
): boolean => {
  if (port_type === 'input') return !!find_binding_by_target(bindings, node_id, port_id);
  return !!find_binding_by_source(bindings, node_id, port_id);
};

// ── Wire Plugin API（暴露给其他插件使用）──────────────────────────

export type WirePluginAPI = {
  /** 获取所有连线 */
  get_bindings(): DataFlowBinding[];
  /** 添加连线 */
  add_binding(binding: DataFlowBinding): void;
  /** 删除连线 */
  remove_binding(binding_id: string): void;
  /** 按目标端口查找连线 */
  find_by_target(node_id: string, port_id: string): DataFlowBinding | undefined;
  /** 按源端口查找连线 */
  find_by_source(node_id: string, port_id: string): DataFlowBinding | undefined;
  /** 检查端口是否已连接 */
  is_connected(node_id: string, port_id: string, port_type: 'input' | 'output'): boolean;
  /** 内部连线拖拽状态（供 render/auto_pan 读取） */
  readonly _wire_state: WireState;
};

declare module '@/runtime/easel' {
  interface EaselPluginData {
    wire?: WirePluginAPI;
  }
}

// ── 插件主体 ────────────────────────────────────────────────────

export const wire_plugin: EaselPlugin = (easel: Easel) => {
  // 1. 创建扩展表
  const bindings_table = easel.store.create_extension_table<DataFlowBinding>('bindings');

  // 2. 创建连线拖拽状态（reactive，供 wire_tool/render/auto_pan 共享）
  const wire_state: WireState = reactive({
    is_wiring: false,
    source_node_id: '',
    source_port_id: '',
    target_pos: { x: 0, y: 0 },
  });

  // 3. 构建 API 对象（先于 wire_tool/render，确保初始化时序正确）
  const api: WirePluginAPI = {
    get_bindings: () => bindings_table.list(),
    add_binding: (b) => { bindings_table.put(b.id, b); },
    remove_binding: (id) => { bindings_table.delete(id); },
    find_by_target: (node_id, port_id) =>
      find_binding_by_target(
        Object.fromEntries(bindings_table.list().map(b => [b.id, b])),
        node_id, port_id,
      ),
    find_by_source: (node_id, port_id) =>
      find_binding_by_source(
        Object.fromEntries(bindings_table.list().map(b => [b.id, b])),
        node_id, port_id,
      ),
    is_connected: (node_id, port_id, port_type) => {
      const bindings = Object.fromEntries(bindings_table.list().map(b => [b.id, b]));
      return is_port_connected(bindings, node_id, port_id, port_type);
    },
    _wire_state: wire_state,
  };
  easel.plugin_data.wire = api;

  // 4. 注册 wire_tool（传入 wire_state，不再由 wire_tool 内部创建）
  easel.tools.register(wire_tool(easel, wire_state));

  // 4. 节点删除时自动清理连线
  easel.store.nodes.on_before_change((event) => {
    if (event.type === 'delete' && event.prev) {
      const node_id = event.id;
      for (const b of bindings_table.list()) {
        if (b.source_id === node_id || b.target_id === node_id) {
          bindings_table.delete(b.id);
        }
      }
    }
  });

  // 5. 渲染连线
  render_wires(easel);

  // 6. select 模式下点端口自动连线（capture phase，优先于 tool 系统）
  easel.container.addEventListener('pointerdown', (e) => {
    const active_tool = easel.state.value.active_tool;
    if (active_tool !== 'select' && active_tool !== 'wire') return;

    const target = (e.composedPath()[0] || e.target) as HTMLElement;
    const port_el = target.closest('.port') as HTMLElement | null;
    if (!port_el) return;

    const node_el = target.closest('.node') as HTMLElement | null;
    const target_node_id = node_el?.dataset['id'];
    const target_port_id = port_el.dataset['portId'];
    const target_port_type = port_el.dataset['portType'] as 'input' | 'output';

    if (!target_node_id || !target_port_id) return;

    const wire_state = easel.plugin_data.wire?._wire_state;
    if (!wire_state) return;

    let should_start_wiring = false;

    if (target_port_type === 'input') {
      const existing = api.find_by_target(target_node_id, target_port_id);
      if (existing) {
        api.remove_binding(existing.id);
        wire_state.is_wiring = true;
        wire_state.source_node_id = existing.source_id;
        wire_state.source_port_id = existing.source_handle;
        should_start_wiring = true;
      }
    } else {
      wire_state.is_wiring = true;
      wire_state.source_node_id = target_node_id;
      wire_state.source_port_id = target_port_id;
      should_start_wiring = true;
    }

    if (!should_start_wiring) return;

    const rect = easel.container.getBoundingClientRect();
    wire_state.target_pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    e.stopPropagation();
    e.preventDefault();
    easel.container.setPointerCapture(e.pointerId);

    const prev_tool = active_tool;
    if (active_tool !== 'wire') {
      easel.dispatch(s => ({ ...s, active_tool: 'wire' }));
    }

    const on_up = () => {
      if (prev_tool !== 'wire') {
        easel.dispatch(s => ({ ...s, active_tool: prev_tool }));
      }
      easel.container.removeEventListener('pointerup', on_up);
    };
    easel.container.addEventListener('pointerup', on_up);
  }, true);
};