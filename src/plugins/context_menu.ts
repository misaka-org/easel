import type { EaselPlugin } from '../runtime/mount';
import { remove_node } from '../core/node_ops';
import { vec2_create } from '../core/math';

export const context_menu_plugin: EaselPlugin = (ctx) => {
  const menu = document.createElement('div');
  menu.className = 'easel-context-menu';
  menu.style.position = 'absolute';
  menu.style.display = 'none';
  menu.style.zIndex = '2000';
  menu.style.background = 'var(--node-header-bg)';
  menu.style.border = '1px solid var(--node-border)';
  menu.style.borderRadius = '4px';
  menu.style.padding = '4px';
  menu.style.boxShadow = '0 4px 6px rgba(0,0,0,0.5)';
  menu.style.flexDirection = 'column';
  menu.style.gap = '2px';
  menu.style.minWidth = '120px';
  
  ctx.container.appendChild(menu);

  let target_node_id: string | null = null;
  let click_pos = vec2_create(0, 0);

  ctx.app_events.on('contextmenu', (e: MouseEvent) => {
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
    
    const create_item = (label: string, action: () => void) => {
      const item = document.createElement('div');
      item.textContent = label;
      item.style.padding = '6px 12px';
      item.style.cursor = 'pointer';
      item.style.borderRadius = '3px';
      item.style.color = 'var(--text-color)';
      item.style.fontSize = '12px';
      item.addEventListener('mouseenter', () => item.style.background = 'var(--primary-color)');
      item.addEventListener('mouseleave', () => item.style.background = 'transparent');
      item.addEventListener('click', () => {
        action();
        menu.style.display = 'none';
      });
      menu.appendChild(item);
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
    } else {
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
    }
  });
};