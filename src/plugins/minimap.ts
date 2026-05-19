import type { EaselPlugin } from '@/runtime/easel';
import { frame_effect } from '@/runtime/frame_effect';
import { apply_styles } from '@/utils/css';
import { vec2_create } from '@/core/math';

export const minimap_plugin: EaselPlugin = easel => {
  const minimap_container = document.createElement('div');
  minimap_container.className = 'easel-minimap';
  apply_styles(minimap_container, {
    position: 'absolute',
    bottom: '20px',
    right: '20px',
    width: '150px',
    height: '100px',
    background: 'var(--node-bg)',
    border: '1px solid var(--node-border)',
    borderRadius: '4px',
    overflow: 'hidden',
    zIndex: '1000',
    pointerEvents: 'all',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
  });

  const minimap_canvas = document.createElement('canvas');
  minimap_canvas.width = 150;
  minimap_canvas.height = 100;
  minimap_container.appendChild(minimap_canvas);

  easel.container.appendChild(minimap_container);

  const minimap_ctx = minimap_canvas.getContext('2d')!;

  // cached layout for pointer->world mapping
  let layout = { min_x: -500, min_y: -500, scale: 1, offset_x: 0, offset_y: 0 };

  frame_effect(() => {
    const state = easel.state.value;
    minimap_ctx.clearRect(0, 0, 150, 100);

    let min_x = Infinity,
      min_y = Infinity,
      max_x = -Infinity,
      max_y = -Infinity;
    const nodes = Object.values(state.nodes);

    if (nodes.length > 0) {
      nodes.forEach(n => {
        min_x = Math.min(min_x, n.position.x);
        min_y = Math.min(min_y, n.position.y);
        max_x = Math.max(max_x, n.position.x + n.size.x);
        max_y = Math.max(max_y, n.position.y + n.size.y);
      });
    } else {
      min_x = -500;
      min_y = -500;
      max_x = 500;
      max_y = 500;
    }

    const padding = 200;
    min_x -= padding;
    min_y -= padding;
    max_x += padding;
    max_y += padding;

    const width = max_x - min_x;
    const height = max_y - min_y;

    const scale = Math.min(150 / width, 100 / height);
    const offset_x = (150 - width * scale) / 2;
    const offset_y = (100 - height * scale) / 2;

    // cache for pointer handler
    layout = { min_x, min_y, scale, offset_x, offset_y };

    // -- draw nodes --
    minimap_ctx.fillStyle = '#666';
    nodes.forEach(n => {
      minimap_ctx.fillRect(
        offset_x + (n.position.x - min_x) * scale,
        offset_y + (n.position.y - min_y) * scale,
        Math.max(1.5, n.size.x * scale),
        Math.max(1.5, n.size.y * scale),
      );
    });

    // -- draw viewport rect --
    const viewport_rect = easel.container.getBoundingClientRect();
    const vp_x = -state.camera.position.x / state.camera.zoom;
    const vp_y = -state.camera.position.y / state.camera.zoom;
    const vp_w = viewport_rect.width / state.camera.zoom;
    const vp_h = viewport_rect.height / state.camera.zoom;

    minimap_ctx.strokeStyle = '#007acc';
    minimap_ctx.lineWidth = 2;
    minimap_ctx.strokeRect(
      offset_x + (vp_x - min_x) * scale,
      offset_y + (vp_y - min_y) * scale,
      vp_w * scale,
      vp_h * scale,
    );
  });

  // ── minimap mouse-drag → viewport pan ──
  let dragging = false;

  const world_from_minimap = (mx: number, my: number) => {
    return vec2_create(
      (mx - layout.offset_x) / layout.scale + layout.min_x,
      (my - layout.offset_y) / layout.scale + layout.min_y,
    );
  };

  const pan_to_world = (wx: number, wy: number) => {
    const rect = easel.container.getBoundingClientRect();
    const zoom = easel.state.value.camera.zoom;
    easel.camera.set(
      vec2_create(rect.width / 2 - wx * zoom, rect.height / 2 - wy * zoom),
      zoom,
    );
  };

  const on_pointer_down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    minimap_canvas.setPointerCapture(e.pointerId);
    const r = minimap_canvas.getBoundingClientRect();
    const wp = world_from_minimap(e.clientX - r.left, e.clientY - r.top);
    pan_to_world(wp.x, wp.y);
  };

  const on_pointer_move = (e: PointerEvent) => {
    if (!dragging) return;
    e.preventDefault();
    e.stopPropagation();
    const r = minimap_canvas.getBoundingClientRect();
    const wp = world_from_minimap(e.clientX - r.left, e.clientY - r.top);
    pan_to_world(wp.x, wp.y);
  };

  const on_pointer_up = (e: PointerEvent) => {
    if (!dragging) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = false;
    minimap_canvas.releasePointerCapture(e.pointerId);
  };

  minimap_canvas.addEventListener('pointerdown', on_pointer_down);
  minimap_canvas.addEventListener('pointermove', on_pointer_move);
  minimap_canvas.addEventListener('pointerup', on_pointer_up);
  minimap_canvas.addEventListener('pointercancel', on_pointer_up);
  minimap_canvas.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
  });
};
