import type { EaselPlugin, Easel } from '@/runtime/easel';
import type { State } from '@/core/types';
import { add_node } from '@/core/node_ops';
import { vec2_create } from '@/core/math';

// ── GroupChildBinding 类型 ──────────────────────────────────────

export type GroupChildBinding = {
  readonly id: string;
  readonly parent_id: string;
  readonly child_id: string;
};

// ── 工厂函数 ────────────────────────────────────────────────────

export const create_group_binding = (
  parent_id: string,
  child_id: string,
): GroupChildBinding => ({
  id: `gc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  parent_id,
  child_id,
});

// ── Group Plugin API ────────────────────────────────────────────

export type GroupPluginAPI = {
  get_children(parent_id: string): string[];
  get_parent(child_id: string): string | undefined;
  add_child(parent_id: string, child_id: string): void;
  remove_child(child_id: string): void;
};

declare module '@/runtime/easel' {
  interface EaselPluginData {
    group?: GroupPluginAPI;
  }
}

// ── 插件主体 ────────────────────────────────────────────────────

export const group_plugin: EaselPlugin = (easel: Easel) => {
  // 1. 创建扩展表
  const table = easel.store.create_extension_table<GroupChildBinding>('group_children');

  // 2. 构建 API
  const api: GroupPluginAPI = {
    get_children: (parent_id) =>
      table.list().filter(b => b.parent_id === parent_id).map(b => b.child_id),
    get_parent: (child_id) =>
      table.list().find(b => b.child_id === child_id)?.parent_id,
    add_child: (parent_id, child_id) => {
      const binding = create_group_binding(parent_id, child_id);
      table.put(binding.id, binding);
    },
    remove_child: (child_id) => {
      const b = table.list().find(x => x.child_id === child_id);
      if (b) table.delete(b.id);
    },
  };
  easel.plugin_data.group = api;

  // 3. nodes_dropped: 拖放节点到 group 区域内时自动建立关系
  easel.app_events.on('nodes_dropped', (dropped_ids: string[]) => {
    const state = easel.state.value;
    for (const child_id of dropped_ids) {
      const child = state.nodes[child_id];
      if (!child) continue;
      for (const node of Object.values(state.nodes)) {
        if (node.type !== 'group' || node.id === child_id) continue;
        const child_cx = child.position.x + child.size.x / 2;
        const child_cy = child.position.y + child.size.y / 2;
        if (
          child_cx >= node.position.x &&
          child_cx <= node.position.x + node.size.x &&
          child_cy >= node.position.y &&
          child_cy <= node.position.y + node.size.y
        ) {
          const binding = create_group_binding(node.id, child_id);
          table.put(binding.id, binding);
        }
      }
    }
  });

  // 4. state_changed: group 移动时递归移动子节点
  easel.app_events.on('state_changed', ({ prev, next }: { prev: State; next: State }) => {
    for (const [id, next_node] of Object.entries(next.nodes)) {
      const prev_node = prev.nodes[id];
      if (!prev_node || next_node.type !== 'group') continue;
      if (prev_node.position.x === next_node.position.x && prev_node.position.y === next_node.position.y) continue;

      const dx = next_node.position.x - prev_node.position.x;
      const dy = next_node.position.y - prev_node.position.y;
      move_children_recursive(id, dx, dy, new Set());
    }

    function move_children_recursive(parent_id: string, dx: number, dy: number, visited: Set<string>) {
      if (visited.has(parent_id)) return;
      visited.add(parent_id);
      for (const b of table.list()) {
        if (b.parent_id === parent_id) {
          easel.dispatch(s => {
            const child = s.nodes[b.child_id];
            if (!child) return s;
            return {
              ...s,
              nodes: {
                ...s.nodes,
                [b.child_id]: {
                  ...child,
                  position: {
                    x: child.position.x + dx,
                    y: child.position.y + dy,
                  },
                },
              },
            };
          });
          move_children_recursive(b.child_id, dx, dy, visited);
        }
      }
    }
  });

  // 5. 节点删除时自动清理 group-child 关系
  easel.store.nodes.on_before_change((event) => {
    if (event.type === 'delete') {
      for (const b of table.list()) {
        if (b.parent_id === event.id || b.child_id === event.id) {
          table.delete(b.id);
        }
      }
    }
  });

  // 6. 监听 create_group 事件（来自 Ctrl+G）
  easel.app_events.on('create_group', () => {
    const state = easel.state.value;
    const selected_ids = state.selected_node_ids.filter(id => {
      const n = state.nodes[id];
      return n && n.type !== 'subgraph_input' && n.type !== 'subgraph_output';
    });
    if (selected_ids.length === 0) return;

    let min_x = Infinity, min_y = Infinity, max_x = -Infinity, max_y = -Infinity;
    for (const id of selected_ids) {
      const n = state.nodes[id];
      min_x = Math.min(min_x, n.position.x);
      min_y = Math.min(min_y, n.position.y);
      max_x = Math.max(max_x, n.position.x + n.size.x);
      max_y = Math.max(max_y, n.position.y + n.size.y);
    }

    const padding = 40;
    const group_id = `group_${Date.now()}`;
    const hues = [0, 30, 60, 120, 210, 270, 315];
    const hue = hues[Math.floor(Math.random() * hues.length)];

    const group_node = {
      id: group_id,
      type: 'group',
      position: vec2_create(min_x - padding, min_y - padding),
      size: vec2_create(max_x - min_x + padding * 2, max_y - min_y + padding * 2),
      title: 'Group',
      inputs: [],
      outputs: [],
      custom_data: { hue },
      resizable: true,
    };

    easel.dispatch(s => add_node(s, group_node));

    for (const child_id of selected_ids) {
      const binding = create_group_binding(group_id, child_id);
      table.put(binding.id, binding);
    }

    easel.dispatch(s => ({ ...s, selected_node_ids: [group_id] }));
  });
};