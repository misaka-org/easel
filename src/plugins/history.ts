import type { EaselPlugin } from '../runtime/mount';
import type { State } from '../core/types';
import { apply_styles } from '@/utils/css';

export const history_plugin: EaselPlugin = (ctx) => {
  const history: State[] = [ctx.state.value];
  let current_index = 0;
  let is_undoing = false;

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
  apply_styles(header, {
    padding: '8px',
    fontWeight: 'bold',
    background: 'var(--node-header-bg)',
    borderBottom: '1px solid var(--node-border)',
    fontSize: '12px',
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

  ctx.container.appendChild(panel);

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
        item.style.color = 'white';
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
    original_dispatch(s => ({ ...history[current_index]!, camera: s.camera }));
    is_undoing = false;
    render_list();
  };

  const original_dispatch = ctx.dispatch;

  ctx.dispatch = (updater) => {
    if (is_undoing) {
      original_dispatch(updater);
      return;
    }

    const prev_state = ctx.state.value;
    original_dispatch(updater);
    const next_state = ctx.state.value;

    if (prev_state !== next_state) {
      if (next_state.interaction.mode === 'idle') {
        const last_recorded = history[current_index];
        const state_changed = last_recorded?.nodes !== next_state.nodes || last_recorded?.wires !== next_state.wires;
        
        if (state_changed) {
           history.splice(current_index + 1);
           history.push(next_state);
           if (history.length > 50) {
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

  ctx.app_events.on('keydown', (e: KeyboardEvent) => {
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
};