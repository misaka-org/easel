import type { EaselPlugin } from '@/runtime/easel';
import { GraphExecutor } from '@/executor/engine';
import { frame_effect } from '@/runtime/frame_effect';
import { effect } from '@vue/reactivity';
import * as E from 'fp-ts/Either';
import { apply_styles } from '@/utils/css';
import type { ContextMenuItem, ContextMenuContext } from '@/plugins/context_menu/types';
import {
  ICON_PLAY,
  ICON_CHECK,
  ICON_STEP,
  ICON_STOP,
  ICON_ACTIVITY,
  ICON_UNDO,
  ICON_TRASH,
} from '@/icons';

export const executor_plugin: EaselPlugin = (easel) => {
  const executor = new GraphExecutor(easel);
  const exec_state = executor.state;

  const container = document.createElement('div');
  container.className = 'easel-executor-panel';
  apply_styles(container, {
    position: 'absolute',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '8px',
    padding: '8px',
    background: 'var(--node-bg)',
    border: '1px solid var(--node-border)',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    zIndex: '1000',
  });

  const btn_init = document.createElement('button');
  btn_init.textContent = 'Compile';
  
  const btn_step = document.createElement('button');
  btn_step.textContent = 'Step';
  
  const btn_run = document.createElement('button');
  btn_run.textContent = 'Run';

  const btn_stop = document.createElement('button');
  btn_stop.textContent = 'Stop';

  const btn_realtime = document.createElement('button');
  btn_realtime.textContent = 'Realtime: Off';
  const btn_pulse = document.createElement('span');
  btn_pulse.style.cssText = 'display:none;width:8px;height:8px;border-radius:50%;background:#10b981;margin-left:4px;';

  btn_realtime.appendChild(btn_pulse);

  const btn_reset = document.createElement('button');
  btn_reset.textContent = 'Reset';

  const status_txt = document.createElement('div');
  apply_styles(status_txt, {
    display: 'flex',
    alignItems: 'center',
    fontSize: '12px',
    padding: '0 8px',
  });
  status_txt.textContent = 'Idle';

  [btn_init, btn_step, btn_run, btn_stop, btn_realtime, btn_reset].forEach(btn => {
    apply_styles(btn, {
      background: 'var(--primary-color)',
      color: 'var(--canvas-bg)',
      border: 'none',
      padding: '6px 12px',
      borderRadius: '4px',
      cursor: 'pointer',
      fontWeight: 'bold',
    });
    container.appendChild(btn);
  });
  container.appendChild(status_txt);

  easel.container.appendChild(container);

  container.addEventListener('pointerdown', e => e.stopPropagation());

  const node_overlays = new Map<string, HTMLElement>();
  const overlays_container = document.createElement('div');
  overlays_container.className = 'executor-overlays';
  apply_styles(overlays_container, {
    position: 'absolute',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '100',
    transformOrigin: '0 0',
  });
  easel.container.appendChild(overlays_container);

  btn_init.addEventListener('click', () => {
    const res = executor.compile();
    if (E.isLeft(res)) {
      alert(`Compile Error: ${res.left.message}`);
    }
  });

  btn_step.addEventListener('click', async () => {
    await executor.step();
  });

  btn_run.addEventListener('click', async () => {
    await executor.run();
  });

  btn_stop.addEventListener('click', () => {
    executor.stop();
  });

  btn_realtime.addEventListener('click', () => {
    if (executor.realtime.value) {
      executor.stop_realtime();
      btn_realtime.textContent = 'Realtime: Off';
      btn_pulse.style.display = 'none';
    } else {
      executor.start_realtime();
      btn_realtime.textContent = 'Realtime: On';
      btn_pulse.style.display = 'inline-block';
    }
  });

  btn_reset.addEventListener('click', () => {
    executor.stop();
    executor.compile();
  });

  // Watch for widget changes when realtime is active
  easel.app_events.on('state_changed', ({ prev, next }) => {
    if (!executor.realtime.value) return;
    for (const [id, next_node] of Object.entries(next.nodes)) {
      const prev_node = prev.nodes[id];
      if (!prev_node) continue;
      const next_widgets = next_node.widgets || [];
      const prev_widgets = prev_node.widgets || [];
      for (let i = 0; i < next_widgets.length; i++) {
        if (next_widgets[i]?.value !== prev_widgets[i]?.value) {
          executor.notify_input_change(id);
          break;
        }
      }
    }
  });

  effect(() => {
    const current_exec_state = exec_state.value;
    status_txt.textContent = `Status: ${current_exec_state.status} | Q: ${current_exec_state.ready_queue.length}`;
  });

  const flashing_nodes = new Set<string>();
  const prev_node_states: Record<string, string> = {};

  frame_effect(() => {
    const st = easel.state.value;
    const current_exec_state = exec_state.value;
    const zoom = st.camera.zoom;
    overlays_container.style.transform = `translate(${st.camera.position.x}px, ${st.camera.position.y}px) scale(${zoom})`;

    for (const [id, node] of Object.entries(st.nodes)) {
      const node_state = current_exec_state.node_states[id];
      if (!node_state && node_overlays.has(id)) {
        node_overlays.get(id)!.remove();
        node_overlays.delete(id);
        continue;
      }
      if (node_state) {
        // Detect transition from running -> completed for flash effect
        const prev_status = prev_node_states[id];
        const curr_status = node_state.status;
        if (prev_status === 'running' && curr_status === 'completed') {
          flashing_nodes.add(id);
          setTimeout(() => {
            flashing_nodes.delete(id);
          }, 600);
        }
        prev_node_states[id] = curr_status;

        let el = node_overlays.get(id);
        if (!el) {
          el = document.createElement('div');
          apply_styles(el, {
            position: 'absolute',
            borderRadius: '10px',
            pointerEvents: 'none',
            boxSizing: 'border-box',
            transition: 'border-color 0.2s, box-shadow 0.2s',
          });
          
          const progress_bar = document.createElement('div');
          progress_bar.className = 'progress-bar';
          apply_styles(progress_bar, {
            position: 'absolute',
            bottom: '-12px',
            left: '0',
            height: '4px',
            background: '#3b82f6',
            transition: 'width 0.2s',
            borderRadius: '2px',
          });
          el.appendChild(progress_bar);
          
          const error_text = document.createElement('div');
          error_text.className = 'error-text';
          apply_styles(error_text, {
            position: 'absolute',
            top: '-20px',
            left: '0',
            color: '#ef4444',
            fontSize: '12px',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
          });
          el.appendChild(error_text);
          
          overlays_container.appendChild(el);
          node_overlays.set(id, el);
        }

        el.style.left = `${node.position.x - 4}px`;
        el.style.top = `${node.position.y - 4}px`;
        el.style.width = `${node.size.x + 8}px`;
        el.style.height = `${node.size.y + 8}px`;

        const progress_bar = el.querySelector('.progress-bar') as HTMLElement;
        const error_text = el.querySelector('.error-text') as HTMLElement;

        progress_bar.style.width = `${node_state.progress}%`;
        progress_bar.style.display = node_state.progress > 0 && node_state.progress < 100 ? 'block' : 'none';

       if (node_state.status === 'running') {
         el.style.border = '3px solid #3b82f6';
         el.style.boxShadow = '0 0 15px rgba(59, 130, 246, 0.5)';
         error_text.textContent = '';
       } else if (node_state.status === 'completed') {
        if (flashing_nodes.has(id)) {
          el.style.border = '3px solid #10b981';
          el.style.boxShadow = '0 0 15px rgba(16, 185, 129, 0.5)';
        } else {
          el.style.border = 'none';
          el.style.boxShadow = 'none';
        }
       error_text.textContent = '';
       } else if (node_state.status === 'error') {
         el.style.border = '3px solid #ef4444';
         el.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.5)';
         error_text.textContent = node_state.error || 'Error';
       } else {
         el.style.border = 'none';
         el.style.boxShadow = 'none';
         error_text.textContent = '';
       }
      }
    }

    for (const id of Array.from(node_overlays.keys())) {
      if (!st.nodes[id]) {
        node_overlays.get(id)!.remove();
        node_overlays.delete(id);
      }
    }
  });

  // -----------------------------------------------------------------------
  // Context menu provider —register an "Executor" submenu
  // -----------------------------------------------------------------------
  const cm = easel.plugin_data.context_menu;
  if (cm) {
    cm.register({
      id: 'executor',
      priority: 40,
      get_items: (_ctx: ContextMenuContext): readonly ContextMenuItem[] => {
        const st = exec_state.value;
        const is_running = st.status === 'running';
        return [{
          id: 'executor_submenu',
          label: 'Executor',
          icon: ICON_PLAY,
          submenu: [
            {
              id: 'compile',
              label: 'Compile',
              icon: ICON_CHECK,
              action: () => { const r = executor.compile(); if (E.isLeft(r)) { alert('Compile Error: ' + r.left.message); } },
            },
            {
              id: 'step',
              label: 'Step',
              icon: ICON_STEP,
              action: () => { executor.step(); },
            },
            is_running
              ? {
                  id: 'stop',
                  label: 'Stop',
                  icon: ICON_STOP,
                  action: () => { executor.stop(); },
                }
              : {
                  id: 'run',
                  label: 'Run',
                  icon: ICON_PLAY,
                  action: () => { executor.run(); },
                },
            {
              id: 'toggle_realtime',
              label: executor.realtime.value ? 'Stop Realtime' : 'Start Realtime',
              icon: ICON_ACTIVITY,
              action: () => {
                if (executor.realtime.value) {
                  executor.stop_realtime();
                } else {
                  executor.start_realtime();
                }
              },
            },
            { id: 'exec_sep', kind: 'label', label: 'Advanced' },
            {
              id: 'reset',
              label: 'Reset',
              icon: ICON_UNDO,
              action: () => {
                executor.stop();
                executor.compile();
              },
            },
            {
              id: 'reset_cache',
              label: 'Reset Cache',
              icon: ICON_TRASH,
              action: () => { executor.clear_cache(); },
            },
          ],
        }];
      },
    });
  }

};
