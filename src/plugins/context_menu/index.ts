import type { EaselPlugin } from '@/runtime/easel';
import { ContextMenuService } from './service';
import type { ContextMenuContext, ContextMenuItem, ContextMenuProvider } from './types';
import { remove_node } from '@/core/node_ops';
import { add_node } from '@/core/node_ops';
import { vec2_create } from '@/core/math';
import { get_registered_types } from '@/runtime/registry';

export { ContextMenuService } from './service';
export type { ContextMenuContext, ContextMenuItem, ContextMenuProvider } from './types';

// ---------------------------------------------------------------------------
// CSS injection (one-time)
// ---------------------------------------------------------------------------
const CSS = `
.easel-context-menu {
  position: absolute;
  display: none;
  z-index: 2000;
  background: var(--popover-bg, #18181b);
  border: 1px solid var(--border-color, #27272a);
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(0, 0, 0, 0.05);
  flex-direction: column;
  gap: 2px;
  min-width: 140px;
  backdrop-filter: blur(12px);
  font-size: 13px;
  font-weight: 400;
  color: var(--text-color, #fafafa);
}
.easel-context-menu-item {
  padding: 6px 12px;
  cursor: pointer;
  border-radius: 6px;
  font-size: 13px;
  transition: background 0.1s ease;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.easel-context-menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
}
.easel-context-menu-item.disabled {
  opacity: 0.4;
  cursor: default;
}
.easel-context-menu-item.disabled:hover {
  background: transparent;
}
.easel-context-menu-item-arrow {
  font-size: 10px;
}
.easel-context-menu-separator {
  height: 1px;
  background: var(--border-color, #27272a);
  margin: 4px 4px;
}
`;

function inject_styles(root_node: ShadowRoot | Document): void {
  if (root_node.querySelector('#easel-context-menu-style')) return;
  const style_el = document.createElement('style');
  style_el.id = 'easel-context-menu-style';
  style_el.textContent = CSS;
  (root_node === document ? document.head : root_node).appendChild(style_el);
}

// ---------------------------------------------------------------------------
// Built-in providers
// ---------------------------------------------------------------------------

/** Node operations: delete, duplicate */
function node_ops_provider(easel: any): ContextMenuProvider {
  return {
    id: '__builtin_node_ops',
    priority: 20,
    get_items: (ctx) => {
      if (!ctx.node_id) return [];
      const node_id: string = ctx.node_id;
      return [
        {
          id: 'delete_node',
          label: 'Delete Node',
          group: 'node_ops',
          action: () => { easel.dispatch((s: any) => remove_node(s, node_id)); },
        },
        {
          id: 'duplicate_node',
          label: 'Duplicate',
          group: 'node_ops',
          action: () => {
            easel.dispatch((s: any) => {
              const n = s.nodes[node_id];
              if (!n) return s;
              const new_id = `${n.type}_${Date.now()}`;
              return {
                ...s,
                nodes: {
                  ...s.nodes,
                  [new_id]: { ...n, id: new_id, position: { x: n.position.x + 20, y: n.position.y + 20 } },
                },
              };
            });
          },
        },
      ];
    },
  };
}

/** Add-node submenu (all registered types) */
function add_node_provider(easel: any): ContextMenuProvider {
  return {
    id: '__builtin_add_node',
    priority: 10,
    get_items: (ctx) => {
      const types = get_registered_types().filter(
        (t) => t !== 'subgraph_input' && t !== 'subgraph_output',
      );
      return [
        {
          id: 'add_node',
          label: 'Add Node',
          group: 'creation',
          submenu: types.map((type_name) => ({
            id: `add_${type_name}`,
            label: type_name.replace(/_/g, ' '),
            action: () => {
              const id = `${type_name}_${Date.now()}`;
              const node_data: any = {
                id,
                type: type_name === 'default' ? 'default' : type_name,
                position: vec2_create(ctx.world_pos.x, ctx.world_pos.y),
                size: vec2_create(180, 100),
                title: type_name
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (l) => l.toUpperCase()),
                inputs: [],
                outputs: [],
                widgets: [],
                custom_data: {},
              };
              easel.dispatch((st: any) => add_node(st, node_data));
            },
          })),
        },
      ];
    },
  };
}

/** Canvas-level operations (only when no node is targeted) */
function canvas_ops_provider(easel: any): ContextMenuProvider {
  return {
    id: '__builtin_canvas_ops',
    priority: -10,
    get_items: (ctx) => {
      if (ctx.node_id) return [];
      return [
        {
          id: 'reset_camera',
          label: 'Reset Camera',
          group: 'canvas',
          action: () => {
            easel.dispatch((s: any) => ({
              ...s,
              camera: { position: vec2_create(0, 0), zoom: 1 },
            }));
          },
        },
        {
          id: 'clear_wires',
          label: 'Clear Wires',
          group: 'canvas',
          action: () => {
            easel.dispatch((s: any) => ({ ...s, wires: {} }));
          },
        },
      ];
    },
  };
}

/** Node instance items: picks up get_context_menu_items() from EaselNode subclasses */
function node_instance_provider(easel: any): ContextMenuProvider {
  return {
    id: '__builtin_node_instance',
    priority: -20,
    get_items: (ctx) => {
      if (!ctx.node_id) return [];
      const inst = easel.node_instances.get(ctx.node_id)?.inst;
      if (inst && typeof inst.get_context_menu_items === 'function') {
        return inst.get_context_menu_items(ctx);
      }
      return [];
    },
  };
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const context_menu_plugin: EaselPlugin = (easel) => {
  const root_node = easel.container.getRootNode() as ShadowRoot | Document;
  inject_styles(root_node);

  const service = new ContextMenuService(easel.container);

  // Expose for other plugins / code
  (easel as any).context_menu = service;

  // Register built-in providers
  service.register(node_ops_provider(easel));
  service.register(add_node_provider(easel));
  service.register(canvas_ops_provider(easel));
  service.register(node_instance_provider(easel));

  // -----------------------------------------------------------------------
  // Event wiring
  // -----------------------------------------------------------------------
  easel.app_events.on('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const root = easel.container.getRootNode() as ShadowRoot | Document;
    const el = root.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const node_el = el?.closest('.node') as HTMLElement | null;
    const node_id = node_el?.dataset['id'] ?? null;

    const rect = easel.container.getBoundingClientRect();
    const screen_pos = vec2_create(e.clientX - rect.left, e.clientY - rect.top);

    const state = easel.state.value;
    const world_pos = vec2_create(
      (screen_pos.x - state.camera.position.x) / state.camera.zoom,
      (screen_pos.y - state.camera.position.y) / state.camera.zoom,
    );

    const ctx: ContextMenuContext = {
      node_id: node_id ?? undefined,
      node_type: node_id ? state.nodes[node_id]?.type : undefined,
      screen_pos,
      world_pos,
      target: el ?? undefined,
      container: easel.container,
    };

    service.show(ctx, screen_pos);
  });

  easel.app_events.on('pointerdown', (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest('.easel-context-menu')) {
      service.hide();
    }
  });
};
