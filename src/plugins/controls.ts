import type { EaselPlugin } from '../runtime/easel';
import { vec2_create } from '../core/math';
import { apply_styles } from '@/utils/css';
import type { ContextMenuItem, ContextMenuProvider, ContextMenuContext } from '@/plugins/context_menu/types';

export const controls_plugin: EaselPlugin = (easel) => {
  // -----------------------------------------------------------------------
  // Action functions — shared by both UI buttons and context menu
  // -----------------------------------------------------------------------
  const do_zoom_in = () => {
    easel.dispatch(s => ({
      ...s,
      camera: { ...s.camera, zoom: Math.min(10, s.camera.zoom * 1.2) }
    }));
  };
  const do_zoom_out = () => {
    easel.dispatch(s => ({
      ...s,
      camera: { ...s.camera, zoom: Math.max(0.1, s.camera.zoom / 1.2) }
    }));
  };
  const do_fit = () => {
    const s = easel.state.value;
    const nodes = Object.values(s.nodes);
    if (nodes.length === 0) return;
    let min_x = Infinity, min_y = Infinity, max_x = -Infinity, max_y = -Infinity;
    for (const n of nodes) {
      min_x = Math.min(min_x, n.position.x);
      min_y = Math.min(min_y, n.position.y);
      max_x = Math.max(max_x, n.position.x + n.size.x);
      max_y = Math.max(max_y, n.position.y + n.size.y);
    }
    const vp = easel.container.getBoundingClientRect();
    const padding = 60;
    const w = max_x - min_x + padding * 2;
    const h = max_y - min_y + padding * 2;
    const zoom = Math.min(vp.width / w, vp.height / h, 2);
    const center_x = (min_x + max_x) / 2;
    const center_y = (min_y + max_y) / 2;
    easel.dispatch(s => ({
      ...s,
      camera: {
        zoom,
        position: vec2_create(vp.width / 2 - center_x * zoom, vp.height / 2 - center_y * zoom)
      }
    }));
  };
  const do_layout = () => {
    easel.dispatch(s => {
      const nodes = Object.values(s.nodes);
      let x = 0, y = 0, max_h = 0;
      const new_nodes = { ...s.nodes };
      for (const n of nodes) {
        new_nodes[n.id] = { ...n, position: vec2_create(x, y) };
        x += n.size.x + 40;
        max_h = Math.max(max_h, n.size.y);
        if (x > 800) {
          x = 0;
          y += max_h + 40;
          max_h = 0;
        }
      }
      return { ...s, nodes: new_nodes };
    });
  };
  const do_fullscreen = () => {
    const host = (easel.container.getRootNode() as ShadowRoot).host as HTMLElement;
    const target = host || easel.container;
    if (!document.fullscreenElement) {
      if (target.requestFullscreen) {
        target.requestFullscreen().catch(err => console.warn('Fullscreen failed:', err));
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  // -----------------------------------------------------------------------
  // UI bar
  // -----------------------------------------------------------------------
  const bar = document.createElement('div');
  bar.className = 'easel-controls';
  apply_styles(bar, {
    position: 'absolute',
    bottom: '20px',
    left: '20px',
    display: 'flex',
    flexDirection: 'column',
    zIndex: '1000',
    background: 'var(--node-bg)',
    borderRadius: '6px',
    border: '1px solid var(--node-border)',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
    overflow: 'hidden',
  });

  const icon_plus = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
  const icon_minus = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
  const icon_fit = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`;
  const icon_layout = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>`;
  const icon_fullscreen = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;

  const btn_zoom_in = document.createElement('button');
  btn_zoom_in.innerHTML = icon_plus;
  btn_zoom_in.title = 'Zoom In';
  btn_zoom_in.addEventListener('click', do_zoom_in);

  const btn_zoom_out = document.createElement('button');
  btn_zoom_out.innerHTML = icon_minus;
  btn_zoom_out.title = 'Zoom Out';
  btn_zoom_out.addEventListener('click', do_zoom_out);

  const btn_fit = document.createElement('button');
  btn_fit.innerHTML = icon_fit;
  btn_fit.title = 'Fit to view';
  btn_fit.addEventListener('click', do_fit);

  const btn_layout = document.createElement('button');
  btn_layout.innerHTML = icon_layout;
  btn_layout.title = 'Auto Layout';
  btn_layout.addEventListener('click', do_layout);

  const btn_fullscreen = document.createElement('button');
  btn_fullscreen.innerHTML = icon_fullscreen;
  btn_fullscreen.title = 'Toggle Fullscreen';
  btn_fullscreen.addEventListener('click', do_fullscreen);

  // 注入 controls 专用样式
  const root_node = easel.container.getRootNode() as ShadowRoot | Document;
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
    (root_node === document ? document.head : root_node).appendChild(style_el);
  }

  const buttons = [btn_zoom_in, btn_zoom_out, btn_fit, btn_layout, btn_fullscreen];

  buttons.forEach((btn) => {
    // 阻止事件冒泡到画布
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    bar.appendChild(btn);
  });

  easel.container.appendChild(bar);

  // -----------------------------------------------------------------------
  // Context menu provider — register a "Controls" submenu
  // -----------------------------------------------------------------------
  const cm = (easel as any).context_menu;
  if (cm) {
    cm.register({
      id: 'controls',
      priority: 30,
      get_items: (ctx: ContextMenuContext): readonly ContextMenuItem[] => [{
        id: 'controls_submenu',
        label: 'Controls',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>',
        submenu: [
          {
            id: 'zoom_in',
            label: 'Zoom In',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
            action: do_zoom_in,
          },
          {
            id: 'zoom_out',
            label: 'Zoom Out',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
            action: do_zoom_out,
          },
          {
            id: 'fit_to_view',
            label: 'Fit to View',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
            action: do_fit,
          },
          {
            id: 'auto_layout',
            label: 'Auto Layout',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
            action: do_layout,
          },
          {
            id: 'fullscreen',
            label: 'Toggle Fullscreen',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>',
            action: do_fullscreen,
          },
        ],
      }],
    });
  }

};