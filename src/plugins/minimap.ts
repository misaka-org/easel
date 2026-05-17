import type { EaselPlugin } from '@/runtime/easel';
import { frame_effect } from '@/runtime/frame_effect';
import { apply_styles } from '@/utils/css';

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
    pointerEvents: 'none',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
  });

  const minimap_canvas = document.createElement('canvas');
  minimap_canvas.width = 150;
  minimap_canvas.height = 100;
  minimap_container.appendChild(minimap_canvas);

  easel.container.appendChild(minimap_container);

  const minimap_ctx = minimap_canvas.getContext('2d')!;

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

    minimap_ctx.fillStyle = '#666';
    nodes.forEach(n => {
      minimap_ctx.fillRect(
        offset_x + (n.position.x - min_x) * scale,
        offset_y + (n.position.y - min_y) * scale,
        Math.max(1.5, n.size.x * scale),
        Math.max(1.5, n.size.y * scale),
      );
    });

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
};
