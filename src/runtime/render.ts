import { stop } from '@vue/reactivity';
import { aabb_intersect, vec2_create } from '@/core/math';
import { get_node_constructor } from './registry';
import { DefaultNode } from './default_node';
import { frame_effect } from './frame_effect';

import type { Easel } from './easel';

const locked_port_title = 'Locked: connected wires cannot be disconnected';

const sync_locked_ports = (el: HTMLElement, locked: boolean): void => {
  for (const port_el of Array.from(el.querySelectorAll<HTMLElement>('.port'))) {
    if (locked) {
      port_el.dataset['locked'] = 'true';
      port_el.title = locked_port_title;
    } else {
      delete port_el.dataset['locked'];
      port_el.removeAttribute('title');
    }
  }
};

export const render_nodes = (easel: Easel): void => {
  const container = easel.container;
  const state_ref = easel.state;
  const dispatch = easel.dispatch;
  const node_instances = easel.node_instances;
  const context = { app_events: easel.app_events, node_events: easel.node_events };
  // Track previous node data for granular change detection
  const prev_node_data = new Map<string, any>();

  const container_element = document.createElement('div');
  container_element.className = 'nodes-container';
  container.appendChild(container_element);

  const selection_box = document.createElement('div');
  selection_box.className = 'selection-box';
  selection_box.style.display = 'none';
  container.appendChild(selection_box);

  // 单例 ResizeObserver — 所有节点共享
  const node_resize_observer = new ResizeObserver(entries => {
    for (const entry of entries) {
      const el_target = entry.target as HTMLElement;
      const id = el_target.dataset['id'];
      if (!id) continue;
      const n = easel.store.nodes.get(id);
      if (!n || n.collapsed) continue;
      const w = el_target.offsetWidth;
      const h = el_target.offsetHeight;
      if (w === 0 && h === 0) continue;
      if (n.size && (Math.abs(n.size.x - w) > 2 || Math.abs(n.size.y - h) > 2)) {
        dispatch(s =>
          s.nodes[id]
            ? { ...s, nodes: { ...s.nodes, [id]: { ...s.nodes[id]!, size: vec2_create(w, h) } } }
            : s,
        );
      }
    }
  });

  let viewport_size = vec2_create(window.innerWidth, window.innerHeight);
  const resize_observer = new ResizeObserver(entries => {
    for (const entry of entries) {
      viewport_size = vec2_create(entry.contentRect.width, entry.contentRect.height);
    }
  });
  resize_observer.observe(container);

  // DOM lifecycle + camera/culling — single merged frame_effect
  frame_effect(() => {
    const state = state_ref.value;
    const store = easel.store;
    const current_ids = new Set(store.nodes.keys());

    Array.from(node_instances.entries()).forEach(([id, cache]) => {
      if (!current_ids.has(id)) {
        easel.node_events.get(id)?.emit('removed');
        easel.node_events.delete(id);
        prev_node_data.delete(id);
        stop(cache.runner);
        cache.inst.unmount();
        node_resize_observer.unobserve(cache.el);
        container_element.removeChild(cache.el);
        node_instances.delete(id);
      }
    });

    if (state.interaction.mode === 'box_selecting') {
      const min_x = Math.min(state.interaction.start_pos.x, state.interaction.current_pos.x);
      const min_y = Math.min(state.interaction.start_pos.y, state.interaction.current_pos.y);
      const width = Math.abs(state.interaction.start_pos.x - state.interaction.current_pos.x);
      const height = Math.abs(state.interaction.start_pos.y - state.interaction.current_pos.y);

      selection_box.style.display = 'block';
      selection_box.style.left = `${min_x}px`;
      selection_box.style.top = `${min_y}px`;
      selection_box.style.width = `${width}px`;
      selection_box.style.height = `${height}px`;
    } else {
      selection_box.style.display = 'none';
    }

    Array.from(current_ids).forEach(id => {
      if (!node_instances.has(id)) {
        const el = document.createElement('div');
        el.className = 'node';
        el.dataset['id'] = id;

        const node_data = store.nodes.get(id);
        const node_ctor = get_node_constructor(node_data!.type) || DefaultNode;
        const inst = new node_ctor(el, dispatch, id, context);
        inst.mount(node_data!);

        container_element.appendChild(el);

        node_resize_observer.observe(el);

        const runner = frame_effect(() => {
          const st = state_ref.value;
          const node = easel.store.nodes.get(id);
          if (!node) {
            runner.effect.stop();
            return;
          }

          const prev = prev_node_data.get(id);
          if (prev !== node) {
            if (prev) {
              easel.node_events.get(id)?.emit('data', { prev, next: node });
            }
            prev_node_data.set(id, node);
          }

          if (node.style_mode === 'borderless') el.classList.add('borderless');
          else el.classList.remove('borderless');

          if (node.muted === true) {
            el.dataset['muted'] = 'true';
          } else {
            delete el.dataset['muted'];
          }
          if (node.pinned === true) {
            el.dataset['pinned'] = 'true';
          } else {
            delete el.dataset['pinned'];
          }
          if (node.locked === true) {
            el.dataset['locked'] = 'true';
          } else {
            delete el.dataset['locked'];
          }

          el.style.transform = `translate(${node.position.x}px, ${node.position.y}px)`;

          if (node.collapsed) {
            el.classList.add('collapsed');
            el.style.width = `${node.size.x}px`;
            el.style.height = 'auto';
          } else {
            el.classList.remove('collapsed');
            const is_resizable = node.resizable !== false;
            if (is_resizable) {
              el.style.width = `${node.size.x}px`;
              el.style.height = `${node.size.y}px`;
            } else {
              el.style.width = 'auto';
              el.style.height = 'auto';
            }
          }

          if (st.selected_node_ids.includes(id)) el.classList.add('selected');
          else el.classList.remove('selected');

          inst.update(node, st);
          sync_locked_ports(el, node.locked === true);
        });

        node_instances.set(id, { el, inst, runner });
      }
    });

    // ── Camera transform & background ──
    const zoom = state.camera.zoom;
    container_element.style.transform = `translate(${state.camera.position.x}px, ${state.camera.position.y}px) scale(${zoom})`;
    container.style.backgroundPosition = `${state.camera.position.x}px ${state.camera.position.y}px`;
    container.style.backgroundSize = `${20 * zoom}px ${20 * zoom}px`;

    // ── Culling & LOD ──
    const viewport_world_pos = vec2_create(
      -state.camera.position.x / zoom,
      -state.camera.position.y / zoom,
    );
    const viewport_world_size = vec2_create(viewport_size.x / zoom, viewport_size.y / zoom);

    Array.from(node_instances.entries()).forEach(([id, cache]) => {
      const node = easel.store.nodes.get(id);
      if (!node) return;

      const is_visible = aabb_intersect(
        node.position,
        node.size,
        viewport_world_pos,
        viewport_world_size,
      );
      if (!is_visible) {
        if (cache.el.style.display !== 'none') cache.el.style.display = 'none';
        if (cache.runner.effect.pause) cache.runner.effect.pause();
      } else {
        if (cache.el.style.display !== 'flex') cache.el.style.display = 'flex';
        if (cache.runner.effect.resume) cache.runner.effect.resume();
      }

      if (zoom < 0.4) cache.el.classList.add('lod-min');
      else cache.el.classList.remove('lod-min');
    });
  });
};
