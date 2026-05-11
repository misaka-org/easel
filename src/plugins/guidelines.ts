import { effect } from "@vue/reactivity";
import type { State } from "../core/types";
import type { Dispatch } from "../runtime/registry";
import { frame_effect } from "../runtime/frame_effect";

export const with_guidelines = (
  container: HTMLElement,
  state_ref: { value: State },
  dispatch: Dispatch
): Dispatch => {
  const overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  overlay.style.position = "absolute";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "100";
  container.appendChild(overlay);

  const SNAP_THRESHOLD = 10;
  let active_guidelines: { x?: number; y?: number } = {};

  frame_effect(() => {
    const state = state_ref.value;
    const zoom = state.camera.zoom;
    overlay.innerHTML = "";

    if (
      state.interaction.mode === "dragging" &&
      active_guidelines.x !== undefined
    ) {
      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line"
      );
      const screen_x = active_guidelines.x * zoom + state.camera.position.x;
      line.setAttribute("x1", screen_x.toString());
      line.setAttribute("y1", "0");
      line.setAttribute("x2", screen_x.toString());
      line.setAttribute("y2", "10000");
      line.setAttribute("stroke", "#007acc");
      line.setAttribute("stroke-width", "1");
      line.setAttribute("stroke-dasharray", "4");
      overlay.appendChild(line);
    }

    if (
      state.interaction.mode === "dragging" &&
      active_guidelines.y !== undefined
    ) {
      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line"
      );
      const screen_y = active_guidelines.y * zoom + state.camera.position.y;
      line.setAttribute("x1", "0");
      line.setAttribute("y1", screen_y.toString());
      line.setAttribute("x2", "10000");
      line.setAttribute("y2", screen_y.toString());
      line.setAttribute("stroke", "#007acc");
      line.setAttribute("stroke-width", "1");
      line.setAttribute("stroke-dasharray", "4");
      overlay.appendChild(line);
    }
  });

  return (updater) => {
    dispatch((state) => {
      let next_state = updater(state);

      if (
        next_state.interaction.mode === "dragging" &&
        !next_state.modifiers.shift
      ) {
        const dragged_id = next_state.selected_node_ids[0];
        if (dragged_id && next_state.nodes[dragged_id]) {
          const dragged = next_state.nodes[dragged_id];

          let best_dx = 0;
          let best_dy = 0;
          let min_dist_x = SNAP_THRESHOLD;
          let min_dist_y = SNAP_THRESHOLD;
          let snap_x: number | undefined = undefined;
          let snap_y: number | undefined = undefined;

          for (const [id, target] of Object.entries(next_state.nodes)) {
            if (next_state.selected_node_ids.includes(id)) continue;

            // Compare left edges
            const dx = target.position.x - dragged.position.x;
            if (Math.abs(dx) < min_dist_x) {
              min_dist_x = Math.abs(dx);
              best_dx = dx;
              snap_x = target.position.x;
            }

            // Compare top edges
            const dy = target.position.y - dragged.position.y;
            if (Math.abs(dy) < min_dist_y) {
              min_dist_y = Math.abs(dy);
              best_dy = dy;
              snap_y = target.position.y;
            }
          }

          active_guidelines = { x: snap_x, y: snap_y };

          if (best_dx !== 0 || best_dy !== 0) {
            const new_nodes = { ...next_state.nodes };
            for (const id of next_state.selected_node_ids) {
              const n = new_nodes[id];
              if (n) {
                new_nodes[id] = {
                  ...n,
                  position: {
                    x: n.position.x + best_dx,
                    y: n.position.y + best_dy,
                  },
                };
              }
            }
            next_state = { ...next_state, nodes: new_nodes };
          }
        }
      } else {
        active_guidelines = {};
      }

      return next_state;
    });
  };
};
