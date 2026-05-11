import { effect } from "@vue/reactivity";
import type { State } from "../core/types";
import type { Dispatch } from "../runtime/registry";
import { frame_effect } from "../runtime/frame_effect";
import { move_nodes } from "../core/node_ops";

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

          const d_left = dragged.position.x;
          const d_right = dragged.position.x + dragged.size.x;
          const d_top = dragged.position.y;
          const d_bottom = dragged.position.y + dragged.size.y;
          const d_cx = dragged.position.x + dragged.size.x / 2;
          const d_cy = dragged.position.y + dragged.size.y / 2;

          for (const [id, target] of Object.entries(next_state.nodes)) {
            if (next_state.selected_node_ids.includes(id)) continue;
            
            const t_left = target.position.x;
            const t_right = target.position.x + target.size.x;
            const t_top = target.position.y;
            const t_bottom = target.position.y + target.size.y;
            const t_cx = target.position.x + target.size.x / 2;
            const t_cy = target.position.y + target.size.y / 2;

            const x_pairs = [
              { t: t_left, d: d_left, snap: t_left },
              { t: t_left, d: d_right, snap: t_left },
              { t: t_right, d: d_left, snap: t_right },
              { t: t_right, d: d_right, snap: t_right },
              { t: t_cx, d: d_cx, snap: t_cx }
            ];

            for (const pair of x_pairs) {
              const dist = Math.abs(pair.t - pair.d);
              if (dist < min_dist_x) {
                min_dist_x = dist;
                best_dx = pair.t - pair.d;
                snap_x = pair.snap;
              }
            }

            const y_pairs = [
              { t: t_top, d: d_top, snap: t_top },
              { t: t_top, d: d_bottom, snap: t_top },
              { t: t_bottom, d: d_top, snap: t_bottom },
              { t: t_bottom, d: d_bottom, snap: t_bottom },
              { t: t_cy, d: d_cy, snap: t_cy }
            ];

            for (const pair of y_pairs) {
              const dist = Math.abs(pair.t - pair.d);
              if (dist < min_dist_y) {
                min_dist_y = dist;
                best_dy = pair.t - pair.d;
                snap_y = pair.snap;
              }
            }
          }

          active_guidelines = { x: snap_x, y: snap_y };

          if (best_dx !== 0 || best_dy !== 0) {
            next_state = move_nodes(next_state, next_state.selected_node_ids, { x: best_dx, y: best_dy });
          }
        }
      } else {
        active_guidelines = {};
      }

      return next_state;
    });
  };
};
