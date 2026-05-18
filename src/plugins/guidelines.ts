import type { EaselPlugin } from '@/runtime/easel';
import { move_nodes } from '@/core/node_ops';
import { apply_styles } from '@/utils/css';
import type { State, GraphNode } from '@/core/types';

const SNAP_THRESHOLD = 10;

/** Compute snap offset + guideline positions for a dragged node. */
function snap_node(
  node: GraphNode,
  all_nodes: Record<string, GraphNode>,
  selected_ids: readonly string[],
): { dx: number; dy: number; snap_x?: number; snap_y?: number } {
  let best_dx = 0, best_dy = 0;
  let min_dist_x = SNAP_THRESHOLD, min_dist_y = SNAP_THRESHOLD;
  let snap_x: number | undefined, snap_y: number | undefined;

  const d_left = node.position.x;
  const d_right = node.position.x + node.size.x;
  const d_top = node.position.y;
  const d_bottom = node.position.y + node.size.y;
  const d_cx = node.position.x + node.size.x / 2;
  const d_cy = node.position.y + node.size.y / 2;

  for (const [id, target] of Object.entries(all_nodes)) {
    if (selected_ids.includes(id)) continue;

    const t_left = target.position.x;
    const t_right = target.position.x + target.size.x;
    const t_top = target.position.y;
    const t_bottom = target.position.y + target.size.y;
    const t_cx = target.position.x + target.size.x / 2;
    const t_cy = target.position.y + target.size.y / 2;

    for (const { t, d, snap } of [
      { t: t_left, d: d_left, snap: t_left },
      { t: t_left, d: d_right, snap: t_left },
      { t: t_right, d: d_left, snap: t_right },
      { t: t_right, d: d_right, snap: t_right },
      { t: t_cx, d: d_cx, snap: t_cx },
    ]) {
      const dist = Math.abs(t - d);
      if (dist < min_dist_x) { min_dist_x = dist; best_dx = t - d; snap_x = snap; }
    }
    for (const { t, d, snap } of [
      { t: t_top, d: d_top, snap: t_top },
      { t: t_top, d: d_bottom, snap: t_top },
      { t: t_bottom, d: d_top, snap: t_bottom },
      { t: t_bottom, d: d_bottom, snap: t_bottom },
      { t: t_cy, d: d_cy, snap: t_cy },
    ]) {
      const dist = Math.abs(t - d);
      if (dist < min_dist_y) { min_dist_y = dist; best_dy = t - d; snap_y = snap; }
    }
  }

  return { dx: best_dx, dy: best_dy, snap_x, snap_y };
}

/**
 * Guidelines plugin:
 * - snapping via `store.nodes.on_before_change`
 * - guideline overlay via `state_changed` event
 */
export const guidelines_plugin: EaselPlugin = (easel) => {
  // ── SVG overlay ──
  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  apply_styles(overlay, {
    position: 'absolute', top: '0', left: '0',
    width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: '100',
  });
  easel.container.appendChild(overlay);

  // Track guideline positions set during snapping.
  let active_guidelines: { x?: number; y?: number } = {};

  // Update overlay on state change (via frame_effect not needed — just react to state).
  let prev_mode: string | undefined;
  easel.app_events.on('state_changed', () => {
    const state = easel.store.state.value;
    const zoom = state.camera.zoom;
    overlay.innerHTML = '';
    if (state.interaction.mode === 'dragging' && 'x' in active_guidelines) {
      if (active_guidelines.x !== undefined) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const sx = active_guidelines.x * zoom + state.camera.position.x;
        line.setAttribute('x1', sx.toString());
        line.setAttribute('y1', '0');
        line.setAttribute('x2', sx.toString());
        line.setAttribute('y2', '10000');
        line.setAttribute('stroke', '#007acc');
        line.setAttribute('stroke-width', '1');
        line.setAttribute('stroke-dasharray', '4');
        overlay.appendChild(line);
      }
      if (active_guidelines.y !== undefined) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const sy = active_guidelines.y * zoom + state.camera.position.y;
        line.setAttribute('x1', '0');
        line.setAttribute('y1', sy.toString());
        line.setAttribute('x2', '10000');
        line.setAttribute('y2', sy.toString());
        line.setAttribute('stroke', '#007acc');
        line.setAttribute('stroke-width', '1');
        line.setAttribute('stroke-dasharray', '4');
        overlay.appendChild(line);
      }
    }
    // Clear guidelines when not dragging
    if (state.interaction.mode !== 'dragging') {
      active_guidelines = {};
    }
  });

  // ── Snapping hook ──
  easel.store.nodes.on_before_change((event) => {
    if (event.type !== 'put') return;
    const state = easel.store.state.value;
    if (state.interaction.mode !== 'dragging') return;
    if (state.modifiers.shift) return;

    const node = event.next!;
    const dragged_id = state.selected_node_ids[0];
    if (!dragged_id || dragged_id !== event.id) return;

    const { dx, dy, snap_x, snap_y } = snap_node(
      node,
      state.nodes,
      state.selected_node_ids,
    );

    active_guidelines = { x: snap_x, y: snap_y };

    if (dx !== 0 || dy !== 0) {
      const snapped = { ...node, position: { x: node.position.x + dx, y: node.position.y + dy } };
      return { ...event, next: snapped as any };
    }
  });
};
