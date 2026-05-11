import type { EaselPlugin } from '../runtime/mount';
import { remove_node } from '../core/node_ops';
import { add_node } from '../core/node_ops';
import { vec2_create } from '../core/math';
import { get_registered_types } from '../runtime/registry';

export const context_menu_plugin: EaselPlugin = (ctx) => {
  const menu = document.createElement('div');
  menu.className = 'easel-context-menu';
  menu.style.position = 'absolute';
  menu.style.display = 'none';
  menu.style.zIndex = '2000';
  menu.style.background = 'var(--popover-bg, #18181b)';
  menu.style.border = '1px solid var(--border-color, #27272a)';
  menu.style.borderRadius = '8px';
  menu.style.padding = '4px';
  menu.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(0, 0, 0, 0.05)';
  menu.style.flexDirection = 'column';
  menu.style.gap = '2px';
  menu.style.minWidth = '140px';
  menu.style.backdropFilter = 'blur(12px)';
  menu.style.fontSize = '13px';
  menu.style.fontWeight = '400';
  menu.style.color = 'var(--text-color, #fafafa)';

  ctx.container.appendChild(menu);

  let target_node_id: string | null = null;
  let click_pos = vec2_create(0, 0);
  let submenu: HTMLElement | null = null;
  let submenu_timer: ReturnType<typeof setTimeout> | null = null;

  const hide_submenu = () => {
    if (submenu) {
      submenu.remove();
      submenu = null;
    }
    if (submenu_timer) {
      clearTimeout(submenu_timer);
      submenu_timer = null;
    }
  };

  const show_submenu = (parent_item: HTMLElement) => {
    hide_submenu();
    const types = get_registered_types().filter(t => t !== 'subgraph_input' && t !== 'subgraph_output'); // exclude internal
    if (types.length === 0) return;

    submenu = document.createElement('div');
    submenu.className = 'easel-context-menu';
    submenu.style.position = 'absolute';
    submenu.style.background = 'var(--popover-bg, #18181b)';
    submenu.style.border = '1px solid var(--border-color, #27272a)';
    submenu.style.borderRadius = '8px';
    submenu.style.padding = '4px';
    submenu.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.4)';
    submenu.style.flexDirection = 'column';
    submenu.style.gap = '2px';
    submenu.style.minWidth = '140px';
    submenu.style.backdropFilter = 'blur(12px)';
    submenu.style.fontSize = '13px';
    submenu.style.color = 'var(--text-color, #fafafa)';
    submenu.style.zIndex = '2001';

    types.forEach(type_name => {
      const item = document.createElement('div');
      item.textContent = type_name.replace(/_/g, ' ');
      item.style.padding = '6px 12px';
      item.style.cursor = 'pointer';
      item.style.borderRadius = '6px';
      item.style.fontSize = '13px';
      item.style.transition = 'background 0.1s ease';
      item.addEventListener('mouseenter', () => {
        item.style.background = 'rgba(255, 255, 255, 0.1)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'transparent';
      });
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.style.display = 'none';
        hide_submenu();

        const state = ctx.state.value;
        const world_x = (click_pos.x - state.camera.position.x) / state.camera.zoom;
        const world_y = (click_pos.y - state.camera.position.y) / state.camera.zoom;

        const id = `${type_name}_${Date.now()}`;
        const node_data: any = {
          id,
          type: type_name === 'default' ? 'default' : type_name,
          position: vec2_create(world_x, world_y),
          size: vec2_create(180, 100),
          title: type_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          inputs: [],
          outputs: [],
          widgets: [],
          custom_data: {}
        };

        ctx.dispatch(st => add_node(st, node_data));
      });
      submenu!.appendChild(item);
    });

    menu.appendChild(submenu);

    const parent_rect = parent_item.getBoundingClientRect();
    submenu.style.left = `${parent_rect.width}px`;
    submenu.style.top = `${parent_item.offsetTop}px`;

    submenu.addEventListener('mouseenter', () => {
      if (submenu_timer) clearTimeout(submenu_timer);
    });
    submenu.addEventListener('mouseleave', () => {
      submenu_timer = setTimeout(hide_submenu, 300);
    });
  };

  ctx.app_events.on('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const root = ctx.container.getRootNode() as ShadowRoot | Document;
    const el = root.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
    const node_el = el?.closest('.node') as HTMLElement | null;
    target_node_id = node_el?.dataset['id'] || null;

    const rect = ctx.container.getBoundingClientRect();
    click_pos = vec2_create(e.clientX - rect.left, e.clientY - rect.top);

    menu.style.left = `${click_pos.x}px`;
    menu.style.top = `${click_pos.y}px`;
    menu.style.display = 'flex';
    menu.innerHTML = '';
    hide_submenu();

    const create_item = (label: string, action: () => void, has_submenu: boolean = false) => {
      const item = document.createElement('div');
      item.textContent = label;
      item.style.padding = '6px 12px';
      item.style.cursor = 'pointer';
      item.style.borderRadius = '6px';
      item.style.color = 'var(--text-color, #fafafa)';
      item.style.fontSize = '13px';
      item.style.transition = 'background 0.1s ease';
      item.style.display = 'flex';
      item.style.justifyContent = 'space-between';
      item.style.alignItems = 'center';

      if (has_submenu) {
        const arrow = document.createElement('span');
        arrow.innerHTML = '&#x25B6;';
        arrow.style.fontSize = '10px';
        item.appendChild(arrow);
      }

      item.addEventListener('mouseenter', () => {
        item.style.background = 'rgba(255, 255, 255, 0.1)';
        if (has_submenu) {
          show_submenu(item);
        }
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'transparent';
      });
      item.addEventListener('click', () => {
        action();
        menu.style.display = 'none';
        hide_submenu();
      });
      menu.appendChild(item);
      return item;
    };

    if (target_node_id) {
      create_item('Delete Node', () => {
        if (target_node_id) {
          ctx.dispatch(s => remove_node(s, target_node_id!));
        }
      });
      create_item('Duplicate', () => {
        if (target_node_id) {
          ctx.dispatch(s => {
            const n = s.nodes[target_node_id!];
            if (!n) return s;
            const new_id = `${n.type}_${Date.now()}`;
            return {
              ...s,
              nodes: {
                ...s.nodes,
                [new_id]: { ...n, id: new_id, position: { x: n.position.x + 20, y: n.position.y + 20 } }
              }
            };
          });
        }
      });
      create_item('Add Node', () => {}, true);
    } else {
      create_item('Add Node', () => {}, true);
      create_item('Reset Camera', () => {
        ctx.dispatch(s => ({
          ...s,
          camera: { position: vec2_create(0, 0), zoom: 1 }
        }));
      });
      create_item('Clear Wires', () => {
        ctx.dispatch(s => ({ ...s, wires: {} }));
      });
    }
  });

  ctx.app_events.on('pointerdown', (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest('.easel-context-menu')) {
      menu.style.display = 'none';
      hide_submenu();
    }
  });

  menu.addEventListener('pointerdown', (e) => e.stopPropagation());
  menu.addEventListener('click', (e) => e.stopPropagation());
};