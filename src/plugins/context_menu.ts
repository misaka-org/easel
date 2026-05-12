import type { EaselPlugin } from '../runtime/easel';
import { remove_node } from '../core/node_ops';
import { add_node } from '../core/node_ops';
import { vec2_create } from '../core/math';
import { get_registered_types } from '../runtime/registry';
import { apply_styles } from '@/utils/css';

export const context_menu_plugin: EaselPlugin = (easel) => {
  // Inject styles once
  const root_node = easel.container.getRootNode() as ShadowRoot | Document;
  if (!root_node.querySelector('#easel-context-menu-style')) {
    const style_el = document.createElement('style');
    style_el.id = 'easel-context-menu-style';
    style_el.textContent = `
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
      .easel-context-menu-item-arrow {
        font-size: 10px;
      }
    `;
    (root_node === document ? document.head : root_node).appendChild(style_el);
  }

  const menu = document.createElement('div');
  menu.className = 'easel-context-menu';
  easel.container.appendChild(menu);

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
    apply_styles(submenu, {
      position: 'absolute',
      zIndex: '2001',
    });

    types.forEach(type_name => {
      const item = document.createElement('div');
      item.textContent = type_name.replace(/_/g, ' ');
      item.className = 'easel-context-menu-item';
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.style.display = 'none';
        hide_submenu();

        const state = easel.state.value;
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

        easel.dispatch(st => add_node(st, node_data));
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

  easel.app_events.on('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const root = easel.container.getRootNode() as ShadowRoot | Document;
    const el = root.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
    const node_el = el?.closest('.node') as HTMLElement | null;
    target_node_id = node_el?.dataset['id'] || null;

    const rect = easel.container.getBoundingClientRect();
    click_pos = vec2_create(e.clientX - rect.left, e.clientY - rect.top);

    menu.style.left = `${click_pos.x}px`;
    menu.style.top = `${click_pos.y}px`;
    menu.style.display = 'flex';
    menu.innerHTML = '';
    hide_submenu();

    const create_item = (label: string, action: () => void, has_submenu: boolean = false) => {
      const item = document.createElement('div');
      item.className = 'easel-context-menu-item';
      item.textContent = label;
      
      if (has_submenu) {
        const arrow = document.createElement('span');
        arrow.className = 'easel-context-menu-item-arrow';
        arrow.innerHTML = '&#x25B6;';
        item.appendChild(arrow);
      }

      item.addEventListener('mouseenter', () => {
        if (has_submenu) {
          show_submenu(item);
        }
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
          easel.dispatch(s => remove_node(s, target_node_id!));
        }
      });
      create_item('Duplicate', () => {
        if (target_node_id) {
          easel.dispatch(s => {
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
        easel.dispatch(s => ({
          ...s,
          camera: { position: vec2_create(0, 0), zoom: 1 }
        }));
      });
      create_item('Clear Wires', () => {
        easel.dispatch(s => ({ ...s, wires: {} }));
      });
    }
  });

  easel.app_events.on('pointerdown', (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest('.easel-context-menu')) {
      menu.style.display = 'none';
      hide_submenu();
    }
  });

  menu.addEventListener('pointerdown', (e) => e.stopPropagation());
  menu.addEventListener('click', (e) => e.stopPropagation());
};