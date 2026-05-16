import type { EaselPlugin } from '../runtime/easel';
import type { State } from '../core/types';
import { create_initial_state } from '../core/state';
import { apply_styles } from '@/utils/css';
import type { ContextMenuItem, ContextMenuProvider, ContextMenuContext } from '@/plugins/context_menu/types';
import { ICON_CLOCK, ICON_UNDO, ICON_REDO } from '@/icons';

export const history_plugin: EaselPlugin = (easel) => {
  const history: State[] = [easel.state.value];
  let current_index = 0;
  let is_undoing = false;
  const MAX_HISTORY = 30;

  const panel = document.createElement('div');
  panel.className = 'easel-history-panel';
  apply_styles(panel, {
    position: 'absolute',
    top: '20px',
    right: '20px',
    width: '180px',
    maxHeight: '300px',
    display: 'flex',
    flexDirection: 'column',
    zIndex: '1000',
    background: 'var(--node-bg)',
    border: '1px solid var(--node-border)',
    borderRadius: '6px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
    overflow: 'hidden',
  });

  const header = document.createElement('div');
  header.textContent = 'History';
  let collapsed = false;

  apply_styles(header, {
    padding: '8px',
    fontWeight: 'bold',
    background: 'var(--node-header-bg)',
    borderBottom: '1px solid var(--node-border)',
    fontSize: '12px',
    cursor: 'pointer',
    userSelect: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  });

  const toggle_btn = document.createElement('span');
  toggle_btn.textContent = '▲';
  toggle_btn.style.fontSize = '10px';
  header.appendChild(toggle_btn);

  header.addEventListener('click', () => {
    collapsed = !collapsed;
    list_container.style.display = collapsed ? 'none' : 'flex';
    toggle_btn.textContent = collapsed ? '▼' : '▲';
  });

  panel.appendChild(header);

  const list_container = document.createElement('div');
  apply_styles(list_container, {
    overflowY: 'auto',
    flex: '1',
    padding: '4px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  });
  panel.appendChild(list_container);

  easel.container.appendChild(panel);

  panel.addEventListener('pointerdown', e => e.stopPropagation());

  const render_list = () => {
    list_container.innerHTML = '';
    history.forEach((_, idx) => {
      const item = document.createElement('div');
      item.textContent = idx === 0 ? 'Initial State' : `Action ${idx}`;
      apply_styles(item, {
        padding: '4px 8px',
        cursor: 'pointer',
        fontSize: '12px',
        borderRadius: '4px',
      });
      
      if (idx === current_index) {
        item.style.background = 'var(--primary-color)';
        item.style.color = 'var(--canvas-bg)';
      } else if (idx > current_index) {
        item.style.color = 'var(--text-muted)';
      } else {
        item.style.color = 'var(--text-color)';
      }

      item.addEventListener('mouseenter', () => {
        if (idx !== current_index) item.style.background = 'var(--node-header-bg)';
      });
      item.addEventListener('mouseleave', () => {
        if (idx !== current_index) item.style.background = 'transparent';
      });

      item.addEventListener('click', () => {
        if (idx !== current_index) jump_to(idx);
      });

      list_container.appendChild(item);
    });
    // Scroll to bottom
    list_container.scrollTop = list_container.scrollHeight;
  };

  const jump_to = (index: number) => {
    is_undoing = true;
    current_index = index;
    original_dispatch(s => ({ ...history[current_index]!, camera: s.camera, interaction: { mode: 'idle' } }));
    is_undoing = false;
    render_list();
  };

  const original_dispatch = easel.dispatch;

  easel.dispatch = (updater) => {
    if (is_undoing) {
      original_dispatch(updater);
      return;
    }

    const prev_state = easel.state.value;
    original_dispatch(updater);
    const next_state = easel.state.value;

    if (prev_state !== next_state) {
      if (next_state.interaction.mode === 'idle') {
        const last_recorded = history[current_index];
        const state_changed = last_recorded?.nodes !== next_state.nodes || last_recorded?.wires !== next_state.wires;
        
        if (state_changed) {
           history.splice(current_index + 1);
           // 存储快照时排除 transient 字段以减小内存
           const snapshot: State = { ...create_initial_state(), ...next_state, interaction: { mode: 'idle' } as const };
           history.push(snapshot);
           if (history.length > MAX_HISTORY) {
             history.shift();
           } else {
             current_index = history.length - 1;
           }
           render_list();
        }
      }
    }
  };

  render_list();

  easel.app_events.on('keydown', (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        if (current_index < history.length - 1) jump_to(current_index + 1);
      } else {
        if (current_index > 0) jump_to(current_index - 1);
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
       e.preventDefault();
       if (current_index < history.length - 1) jump_to(current_index + 1);
    }
  });

  // -----------------------------------------------------------------------
  // Context menu provider — register a "History" submenu
  // -----------------------------------------------------------------------
  const cm = easel.plugin_data.context_menu;
  if (cm) {
    cm.register({
      id: 'history',
      priority: 50,
      get_items: (ctx: ContextMenuContext): readonly ContextMenuItem[] => [{
        id: 'history_submenu',
        label: 'History',
        icon: ICON_CLOCK,
        submenu: [
          {
            id: 'undo',
            label: 'Undo (Ctrl+Z)',
            icon: ICON_UNDO,
            disabled: current_index <= 0,
            action: () => { if (current_index > 0) jump_to(current_index - 1); },
          },
          {
            id: 'redo',
            label: 'Redo (Ctrl+Shift+Z)',
            icon: ICON_REDO,
            disabled: current_index >= history.length - 1,
            action: () => { if (current_index < history.length - 1) jump_to(current_index + 1); },
          },
        ],
      }],
    });
  }

};
