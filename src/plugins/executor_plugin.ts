import type { EaselPlugin } from '../runtime/mount';
import { init_execution, step_execution, run_execution, create_initial_execution_state } from '../executor/engine';
import type { ExecutionState } from '../executor/types';
import * as E from 'fp-ts/Either';
import { frame_effect } from '../runtime/frame_effect';

export const executor_plugin: EaselPlugin = (ctx) => {
  let exec_state = create_initial_execution_state();

  const container = document.createElement('div');
  container.className = 'easel-executor-panel';
  container.style.position = 'absolute';
  container.style.top = '20px';
  container.style.left = '50%';
  container.style.transform = 'translateX(-50%)';
  container.style.display = 'flex';
  container.style.gap = '8px';
  container.style.padding = '8px';
  container.style.background = 'var(--node-bg)';
  container.style.border = '1px solid var(--node-border)';
  container.style.borderRadius = '8px';
  container.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  container.style.zIndex = '1000';

  const btn_init = document.createElement('button');
  btn_init.textContent = 'Compile';
  
  const btn_step = document.createElement('button');
  btn_step.textContent = 'Step';
  
  const btn_run = document.createElement('button');
  btn_run.textContent = 'Run';

  const btn_reset = document.createElement('button');
  btn_reset.textContent = 'Reset';

  const status_txt = document.createElement('div');
  status_txt.style.display = 'flex';
  status_txt.style.alignItems = 'center';
  status_txt.style.fontSize = '12px';
  status_txt.style.padding = '0 8px';
  status_txt.textContent = 'Idle';

  [btn_init, btn_step, btn_run, btn_reset].forEach(btn => {
    btn.style.background = 'var(--primary-color)';
    btn.style.color = 'var(--canvas-bg)';
    btn.style.border = 'none';
    btn.style.padding = '6px 12px';
    btn.style.borderRadius = '4px';
    btn.style.cursor = 'pointer';
    btn.style.fontWeight = 'bold';
    container.appendChild(btn);
  });
  container.appendChild(status_txt);

  ctx.container.appendChild(container);

  // Status overlay on nodes
  const node_overlays = new Map<string, HTMLElement>();
  const overlays_container = document.createElement('div');
  overlays_container.className = 'executor-overlays';
  overlays_container.style.position = 'absolute';
  overlays_container.style.top = '0';
  overlays_container.style.left = '0';
  overlays_container.style.width = '100%';
  overlays_container.style.height = '100%';
  overlays_container.style.pointerEvents = 'none';
  overlays_container.style.zIndex = '100';
  ctx.container.appendChild(overlays_container);

  const update_ui = () => {
    status_txt.textContent = `Status: ${exec_state.status} | Q: ${exec_state.current_node_index}/${exec_state.execution_queue.length}`;
  };

  const handle_state_change = (new_state: ExecutionState) => {
    exec_state = new_state;
    update_ui();
  };

  btn_init.addEventListener('click', () => {
    const res = init_execution(ctx.state.value.nodes, ctx.state.value.wires);
    if (E.isLeft(res)) {
      alert(`Compile Error: ${res.left.message}`);
    } else {
      handle_state_change(res.right);
    }
  });

  btn_step.addEventListener('click', async () => {
    if (exec_state.execution_queue.length === 0 || exec_state.status === 'completed') {
      btn_init.click();
    }
    const step_task = step_execution(exec_state, ctx.state.value.nodes, ctx.state.value.wires, handle_state_change);
    await step_task();
  });

  btn_run.addEventListener('click', async () => {
    if (exec_state.execution_queue.length === 0 || exec_state.status === 'completed') {
      btn_init.click();
    }
    const run_task = run_execution(exec_state, ctx.state.value.nodes, ctx.state.value.wires, handle_state_change);
    await run_task();
  });

  btn_reset.addEventListener('click', () => {
    handle_state_change(create_initial_execution_state());
  });

  frame_effect(() => {
    const st = ctx.state.value;
    const zoom = st.camera.zoom;
    overlays_container.style.transform = `translate(${st.camera.position.x}px, ${st.camera.position.y}px) scale(${zoom})`;

    // create or update overlays
    for (const [id, node] of Object.entries(st.nodes)) {
      const node_state = exec_state.node_states[id];
      if (!node_state && node_overlays.has(id)) {
        node_overlays.get(id)!.remove();
        node_overlays.delete(id);
        continue;
      }
      if (node_state) {
        let el = node_overlays.get(id);
        if (!el) {
          el = document.createElement('div');
          el.style.position = 'absolute';
          el.style.borderRadius = '10px';
          el.style.pointerEvents = 'none';
          el.style.boxSizing = 'border-box';
          el.style.transition = 'border-color 0.2s, box-shadow 0.2s';
          
          const progress_bar = document.createElement('div');
          progress_bar.className = 'progress-bar';
          progress_bar.style.position = 'absolute';
          progress_bar.style.bottom = '-12px';
          progress_bar.style.left = '0';
          progress_bar.style.height = '4px';
          progress_bar.style.background = '#3b82f6';
          progress_bar.style.transition = 'width 0.2s';
          progress_bar.style.borderRadius = '2px';
          el.appendChild(progress_bar);
          
          const error_text = document.createElement('div');
          error_text.className = 'error-text';
          error_text.style.position = 'absolute';
          error_text.style.top = '-20px';
          error_text.style.left = '0';
          error_text.style.color = '#ef4444';
          error_text.style.fontSize = '12px';
          error_text.style.fontWeight = 'bold';
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
          el.style.border = '3px solid #10b981';
          el.style.boxShadow = '0 0 15px rgba(16, 185, 129, 0.5)';
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
};