/**
 * Camera controller — animation, zoom-to-fit, and smooth transitions
 * for the easel viewport.
 *
 * Camera data lives in Store (position + zoom).
 * This controller is a thin animation layer that dispatches to Store.
 */

import type { State, Camera } from '@/core/types';
import { vec2_lerp, vec2_create, type Vec2 } from '@/core/math';

// ── Easing ──────────────────────────────────────────────────────

export type EasingFn = (t: number) => number;

export const EASING = {
  linear: (t: number): number => t,
  easeInOutCubic: (t: number): number =>
    t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2,
  easeOutQuint: (t: number): number => 1 - (1 - t) ** 5,
  easeOutCubic: (t: number): number => 1 - (1 - t) ** 3,
} as const satisfies Record<string, EasingFn>;

// ── Animation types ─────────────────────────────────────────────

type CameraTarget = {
  position?: Vec2;
  zoom?: number;
};

type AnimationOptions = {
  duration?: number;    // ms, default 300
  easing?: EasingFn;
  onComplete?: () => void;
};

// ── Controller ──────────────────────────────────────────────────

export class CameraController {
  private read_state: () => State;
  private dispatch: (updater: (s: State) => State) => void;
  private anim_frame: number | null = null;
  private anim_start: number = 0;
  private anim_duration: number = 300;
  private anim_from: Camera;
  private anim_to: CameraTarget;
  private anim_easing: EasingFn;
  private anim_on_complete?: () => void;

  constructor(
    read_state: () => State,
    dispatch: (updater: (s: State) => State) => void,
  ) {
    this.read_state = read_state;
    this.dispatch = dispatch;
    this.anim_from = read_state().camera;
    this.anim_to = {};
    this.anim_easing = EASING.easeOutCubic;
  }

  /** Whether a camera animation is currently running. */
  get is_animating(): boolean {
    return this.anim_frame !== null;
  }

  /** Instant set — skip animation, update immediately. */
  set(position: Vec2, zoom: number): void;
  set(target: CameraTarget): void;
  set(a: Vec2 | CameraTarget, zoom?: number): void {
    this.cancel();
    this.dispatch(s => ({
      ...s,
      camera: {
        position: 'x' in a ? a : (a.position ?? s.camera.position),
        zoom: zoom ?? (('x' in a ? undefined : a.zoom) ?? s.camera.zoom),
      },
    }));
  }

  /** Animate camera to target position/zoom. */
  animateTo(target: CameraTarget, opts?: AnimationOptions): void {
    this.cancel();

    const s = this.read_state();
    this.anim_from = s.camera;
    this.anim_to = target;
    this.anim_duration = opts?.duration ?? 300;
    this.anim_easing = opts?.easing ?? EASING.easeOutCubic;
    this.anim_on_complete = opts?.onComplete;
    this.anim_start = performance.now();

    this.anim_frame = requestAnimationFrame(this.tick);
  }

  /** Cancel running animation (keeps current position). */
  cancel(): void {
    if (this.anim_frame !== null) {
      cancelAnimationFrame(this.anim_frame);
      this.anim_frame = null;
    }
  }

  /** Fit all nodes into viewport with optional padding. */
  fitToView(padding = 60): void {
    const s = this.read_state();
    const nodes = Object.values(s.nodes);
    if (nodes.length === 0) return;

    let min_x = Infinity, min_y = Infinity, max_x = -Infinity, max_y = -Infinity;
    for (const n of nodes) {
      if (n.position.x < min_x) min_x = n.position.x;
      if (n.position.y < min_y) min_y = n.position.y;
      if (n.position.x + n.size.x > max_x) max_x = n.position.x + n.size.x;
      if (n.position.y + n.size.y > max_y) max_y = n.position.y + n.size.y;
    }

    this.zoomToRect(
      { x: min_x, y: min_y, w: max_x - min_x, h: max_y - min_y },
      padding,
    );
  }

  /** Animate to frame a rectangular region in world coords. */
  zoomToRect(
    rect: { x: number; y: number; w: number; h: number },
    padding = 60,
  ): void {
    const vp = this.get_viewport_size();
    const w = rect.w + padding * 2;
    const h = rect.h + padding * 2;
    const zoom = Math.min(vp.w / w, vp.h / h, 2);
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;

    this.animateTo({
      position: vec2_create(vp.w / 2 - cx * zoom, vp.h / 2 - cy * zoom),
      zoom,
    });
  }

  /** Animate to center on a world point. */
  centerOnPoint(point: Vec2, zoom?: number): void {
    const vp = this.get_viewport_size();
    const cur = this.read_state().camera;
    this.animateTo({
      position: vec2_create(vp.w / 2 - point.x * (zoom ?? cur.zoom), vp.h / 2 - point.y * (zoom ?? cur.zoom)),
      zoom,
    });
  }

  /** Zoom in by factor (default 1.2) anchored at viewport center. */
  zoomIn(factor = 1.2): void {
    const s = this.read_state();
    const new_zoom = Math.min(10, s.camera.zoom * factor);
    this.animateTo({ zoom: new_zoom });
  }

  /** Zoom out by factor (default 1.2) anchored at viewport center. */
  zoomOut(factor = 1.2): void {
    const s = this.read_state();
    const new_zoom = Math.max(0.1, s.camera.zoom / factor);
    this.animateTo({ zoom: new_zoom });
  }

  /** Reset zoom to 1, anchored at viewport center. */
  zoomReset(): void {
    this.animateTo({ zoom: 1 });
  }

  /** Zoom to currently selected nodes, or fit all if none selected. */
  zoomToSelection(padding = 40): void {
    const s = this.read_state();
    const selected = s.selected_node_ids;
    if (selected.length === 0) {
      this.fitToView(padding);
      return;
    }

    let min_x = Infinity, min_y = Infinity, max_x = -Infinity, max_y = -Infinity;
    for (const id of selected) {
      const n = s.nodes[id];
      if (!n) continue;
      if (n.position.x < min_x) min_x = n.position.x;
      if (n.position.y < min_y) min_y = n.position.y;
      if (n.position.x + n.size.x > max_x) max_x = n.position.x + n.size.x;
      if (n.position.y + n.size.y > max_y) max_y = n.position.y + n.size.y;
    }

    if (!isFinite(min_x)) {
      this.fitToView(padding);
      return;
    }

    this.zoomToRect({ x: min_x, y: min_y, w: max_x - min_x, h: max_y - min_y }, padding);
  }

  // ── Internal ──────────────────────────────────────────────────

  private get_viewport_size(): { w: number; h: number } {
    // Real viewport size is not always available; default fallback
    return { w: window.innerWidth, h: window.innerHeight };
  }

  private tick = (now: number): void => {
    const elapsed = now - this.anim_start;
    const t = Math.min(elapsed / this.anim_duration, 1);
    const e = this.anim_easing(t);

    this.dispatch(s => {
      const from = this.anim_from;
      const to = this.anim_to;
      return {
        ...s,
        camera: {
          position: to.position
            ? vec2_lerp(from.position, to.position, e)
            : s.camera.position,
          zoom: to.zoom != null
            ? from.zoom + (to.zoom - from.zoom) * e
            : s.camera.zoom,
        },
      };
    });

    if (t < 1) {
      this.anim_frame = requestAnimationFrame(this.tick);
    } else {
      // Snap to exact target to avoid sub-pixel drift
      this.dispatch(s => ({
        ...s,
        camera: {
          position: this.anim_to.position ?? s.camera.position,
          zoom: this.anim_to.zoom ?? s.camera.zoom,
        },
      }));
      this.anim_frame = null;
      this.anim_on_complete?.();
    }
  };
}