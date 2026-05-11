import type { EaselPlugin } from '../runtime/mount';
import { vec2_create } from '../core/math';

export const controls_plugin: EaselPlugin = (ctx) => {
  const bar = document.createElement('div');
  bar.className = 'easel-controls';
  bar.style.position = 'absolute';
  bar.style.bottom = '20px';
  bar.style.left = '20px';
  bar.style.display = 'flex';
  bar.style.flexDirection = 'column';
  bar.style.zIndex = '1000';
  bar.style.background = 'var(--node-bg)';
  bar.style.borderRadius = '6px';
  bar.style.border = '1px solid var(--node-border)';
  bar.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
  bar.style.overflow = 'hidden';

  const icon_plus = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
  const icon_minus = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
  const icon_fit = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`;
  const icon_layout = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>`;
  const icon_fullscreen = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;

  const btn_zoom_in = document.createElement('button');
  btn_zoom_in.innerHTML = icon_plus;
  btn_zoom_in.title = 'Zoom In';

  const btn_zoom_out = document.createElement('button');
  btn_zoom_out.innerHTML = icon_minus;
  btn_zoom_out.title = 'Zoom Out';

  const btn_fit = document.createElement('button');
  btn_fit.innerHTML = icon_fit;
  btn_fit.title = 'Fit to view';

  const btn_layout = document.createElement('button');
  btn_layout.innerHTML = icon_layout;
  btn_layout.title = 'Auto Layout';

  const btn_fullscreen = document.createElement('button');
  btn_fullscreen.innerHTML = icon_fullscreen;
  btn_fullscreen.title = 'Toggle Fullscreen';

  // 注入 controls 专用样式（shadcn 风格）
  const root_node = ctx.container.getRootNode() as ShadowRoot | Document;
  if (!root_node.querySelector('#easel-controls-style')) {
    const style_el = document.createElement('style');
    style_el.id = 'easel-controls-style';
    style_el.textContent = `
      .easel-controls {
        backdrop-filter: blur(8px);
        background: var(--popover-bg, rgba(24, 24, 27, 0.9));
        border-radius: 12px;
        border: 1px solid var(--border-color, #27272a);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        overflow: hidden;
        transition: all 0.2s;
      }
      .easel-controls button {
        background: transparent;
        color: var(--text-color, #fafafa);
        border: none;
        cursor: pointer;
        padding: 8px 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
        width: 36px;
        height: 36px;
        font-size: 18px;
      }
      .easel-controls button:hover {
        background: rgba(255, 255, 255, 0.1);
        color: var(--primary-color, #fafafa);
      }
      .easel-controls button:active {
        background: rgba(255, 255, 255, 0.2);
        transform: scale(0.96);
      }
    `;
    root_node.appendChild(style_el);
  }

  const buttons = [btn_zoom_in, btn_zoom_out, btn_fit, btn_layout, btn_fullscreen];

  buttons.forEach((btn, idx) => {
    // 应用基础样式（上面已通过全局样式控制，但为保证兼容性保留行内样式）
    // 移除内联样式，完全依赖 CSS 类样式（保持干净）
    btn.classList.add('easel-controls-btn');
    // 阻止事件冒泡到画布
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    btn.addEventListener('click', (e) => e.stopPropagation());
    
    bar.appendChild(btn);
  });

  ctx.container.appendChild(bar);

  btn_zoom_in.addEventListener('click', (e) => {
    e.stopPropagation();
    ctx.dispatch(s => ({
      ...s,
      camera: { ...s.camera, zoom: Math.min(10, s.camera.zoom * 1.2) }
    }));
  });

  btn_zoom_out.addEventListener('click', (e) => {
    e.stopPropagation();
    ctx.dispatch(s => ({
      ...s,
      camera: { ...s.camera, zoom: Math.max(0.1, s.camera.zoom / 1.2) }
    }));
  });

  btn_fit.addEventListener('click', (e) => {
    e.stopPropagation();
    const s = ctx.state.value;
    const nodes = Object.values(s.nodes);
    if (nodes.length === 0) return;
    
    let min_x = Infinity, min_y = Infinity, max_x = -Infinity, max_y = -Infinity;
    nodes.forEach(n => {
      min_x = Math.min(min_x, n.position.x);
      min_y = Math.min(min_y, n.position.y);
      max_x = Math.max(max_x, n.position.x + n.size.x);
      max_y = Math.max(max_y, n.position.y + n.size.y);
    });

    const vp = ctx.container.getBoundingClientRect();
    const padding = 60;
    const w = max_x - min_x + padding * 2;
    const h = max_y - min_y + padding * 2;
    const zoom = Math.min(vp.width / w, vp.height / h, 2);

    const center_x = (min_x + max_x) / 2;
    const center_y = (min_y + max_y) / 2;

    ctx.dispatch(s => ({
      ...s,
      camera: {
        zoom,
        position: vec2_create(vp.width / 2 - center_x * zoom, vp.height / 2 - center_y * zoom)
      }
    }));
  });

  btn_layout.addEventListener('click', (e) => {
    e.stopPropagation();
    ctx.dispatch(s => {
      const nodes = Object.values(s.nodes);
      let x = 0, y = 0, max_h = 0;
      const new_nodes = { ...s.nodes };
      nodes.forEach(n => {
        new_nodes[n.id] = { ...n, position: vec2_create(x, y) };
        x += n.size.x + 40;
        max_h = Math.max(max_h, n.size.y);
        if (x > 800) {
          x = 0;
          y += max_h + 40;
          max_h = 0;
        }
      });
      return { ...s, nodes: new_nodes };
    });
  });

  btn_fullscreen.addEventListener('click', (e) => {
    e.stopPropagation();
    const host = (ctx.container.getRootNode() as ShadowRoot).host as HTMLElement;
    const target = host || ctx.container;
    
    if (!document.fullscreenElement) {
      if (target.requestFullscreen) {
        target.requestFullscreen().catch(err => console.warn('Fullscreen failed:', err));
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  });
};