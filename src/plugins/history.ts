import type { EaselPlugin } from '../runtime/mount';
import type { State } from '../core/types';

export const history_plugin: EaselPlugin = (ctx) => {
  const history: State[] = [ctx.state.value];
  let current_index = 0;
  let is_undoing = false;

  const panel = document.createElement('div');
  panel.className = 'easel-history-panel';
  panel.style.position = 'absolute';
  panel.style.top = '20px';
  panel.style.right = '20px';
  panel.style.width = '180px';
  panel.style.maxHeight = '300px';
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.zIndex = '1000';
  panel.style.background = 'var(--node-bg)';
  panel.style.border = '1px solid var(--node-border)';
  panel.style.borderRadius = '6px';
  panel.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
  panel.style.overflow = 'hidden';

  const header = document.createElement('div');
  header.textContent = 'History';
  header.style.padding = '8px';
  header.style.fontWeight = 'bold';
  header.style.background = 'var(--node-header-bg)';
  header.style.borderBottom = '1px solid var(--node-border)';
  header.style.fontSize = '12px';
  panel.appendChild(header);

  const list_container = document.createElement('div');
  list_container.style.overflowY = 'auto';
  list_container.style.flex = '1';
  list_container.style.padding = '4px';
  list_container.style.display = 'flex';
  list_container.style.flexDirection = 'column';
  list_container.style.gap = '2px';
  panel.appendChild(list_container);

  ctx.container.appendChild(panel);

  const render_list = () => {
    list_container.innerHTML = '';
    history.forEach((_, idx) => {
      const item = document.createElement('div');
      item.textContent = idx === 0 ? 'Initial State' : `Action ${idx}`;
      item.style.padding = '4px 8px';
      item.style.cursor = 'pointer';
      item.style.fontSize = '12px';
      item.style.borderRadius = '4px';
      
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