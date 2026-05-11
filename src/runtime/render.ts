import { effect, stop, type ReactiveEffectRunner } from "@vue/reactivity";
import type { State } from "../core/types";
import { aabb_intersect, vec2_create } from "../core/math";
import {
  get_node_constructor,
  type EaselNode,
  type Dispatch,
} from "./registry";
import { DefaultNode } from "./default_node";
import { frame_effect } from "./frame_effect";

export const render_nodes = (
  container: HTMLElement,
  state_ref: { value: State },
  dispatch: Dispatch,
  context: Record<string, any> = {}
): void => {
  const node_instances = new Map<
    string,
    { el: HTMLElement; inst: EaselNode; runner: ReactiveEffectRunner }
  >();
  const container_element = document.createElement("div");
  container_element.className = "nodes-container";
  container.appendChild(container_element);

  const selection_box = document.createElement("div");
  selection_box.className = "selection-box";
  selection_box.style.display = "none";
  container.appendChild(selection_box);

  let viewport_size = vec2_create(window.innerWidth, window.innerHeight);
  const resize_observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      viewport_size = vec2_create(
        entry.contentRect.width,
        entry.contentRect.height
      );
      // Trigger a re-evaluation if needed, but simple assignments will be picked up on next interaction
    }
  });
  resize_observer.observe(container);

  // DOM element lifecycle effect
  frame_effect(() => {
    const state = state_ref.value;
    const current_ids = new Set(Object.keys(state.nodes));

    Array.from(node_instances.entries()).forEach(([id, cache]) => {
      if (!current_ids.has(id)) {
        stop(cache.runner);
        cache.inst.unmount();
        container_element.removeChild(cache.el);
        node_instances.delete(id);
      }
    });

    if (state.interaction.mode === "box_selecting") {
      const min_x = Math.min(
        state.interaction.start_pos.x,
        state.interaction.current_pos.x
      );
      const min_y = Math.min(
        state.interaction.start_pos.y,
        state.interaction.current_pos.y
      );
      const width = Math.abs(
        state.interaction.start_pos.x - state.interaction.current_pos.x
      );
      const height = Math.abs(
        state.interaction.start_pos.y - state.interaction.current_pos.y
      );

      selection_box.style.display = "block";
      selection_box.style.left = `${min_x}px`;
      selection_box.style.top = `${min_y}px`;
      selection_box.style.width = `${width}px`;
      selection_box.style.height = `${height}px`;
    } else {
      selection_box.style.display = "none";
    }

    Array.from(current_ids).forEach((id) => {
      if (!node_instances.has(id)) {
        const el = document.createElement("div");
        el.className = "node";
        el.dataset["id"] = id;

        const node_data = state.nodes[id];
        const Constructor =
          get_node_constructor(node_data!.type) || DefaultNode;
        const inst = new Constructor(el, dispatch, id, context);
        inst.mount(node_data!);

        container_element.appendChild(el);

        const node_resize_observer = new ResizeObserver(entries => {
          for (const entry of entries) {
            const current_node = state_ref.value.nodes[id];
            if (!current_node || current_node.collapsed) continue;
            const el_target = entry.target as HTMLElement;
            const w = el_target.offsetWidth;
            const h = el_target.offsetHeight;
            const current_size = current_node.size;
            if (current_size && (Math.abs(current_size.x - w) > 2 || Math.abs(current_size.y - h) > 2)) {
              dispatch(s => s.nodes[id] ? {
                ...s,
                nodes: { ...s.nodes, [id]: { ...s.nodes[id]!, size: vec2_create(w, h) } }
              } : s);
            }
          }
        });
        node_resize_observer.observe(el);

        const runner = frame_effect(() => {
          const st = state_ref.value;
          const node = st.nodes[id];
          if (!node) {
            runner.effect.stop(); // node was removed
            return;
          }

          if (node.style_mode === 'borderless') el.classList.add('borderless');
          else el.classList.remove('borderless');

          if (node.collapsed) el.classList.add('collapsed');
          else el.classList.remove('collapsed');

          el.style.transform = `translate(${node.position.x}px, ${node.position.y}px)`;
          
          if (node.resizable) {
            el.style.width = `${node.size.x}px`;
            el.style.height = `${node.size.y}px`;
          } else {
            el.style.width = 'auto';
            el.style.height = 'auto';
          }

          if (st.selected_node_ids.includes(id)) el.classList.add('selected');
          else el.classList.remove('selected');

          inst.update(node, st);
        });

        node_instances.set(id, { el, inst, runner });
      }
    });
  });

  // Camera, Culling and LOD effect
  frame_effect(() => {
    const state = state_ref.value;
    const zoom = state.camera.zoom;
    container_element.style.transform = `translate(${state.camera.position.x}px, ${state.camera.position.y}px) scale(${zoom})`;

    const viewport_world_pos = vec2_create(
      -state.camera.position.x / zoom,
      -state.camera.position.y / zoom
    );
    const viewport_world_size = vec2_create(
      viewport_size.x / zoom,
      viewport_size.y / zoom
    );

    Array.from(node_instances.entries()).forEach(([id, cache]) => {
      const node = state.nodes[id];
      if (!node) return;

      const is_visible = aabb_intersect(
        node.position,
        node.size,
        viewport_world_pos,
        viewport_world_size
      );
      if (!is_visible) {
        if (cache.el.style.display !== "none") cache.el.style.display = "none";
        if (cache.runner.effect.pause) cache.runner.effect.pause();
      } else {
        if (cache.el.style.display !== "flex") cache.el.style.display = "flex";
        if (cache.runner.effect.resume) cache.runner.effect.resume();
      }

      if (zoom < 0.4) cache.el.classList.add("lod-min");
      else cache.el.classList.remove("lod-min");
    });
  });
};
