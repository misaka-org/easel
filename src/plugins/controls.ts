import type { EaselPlugin } from '../runtime/easel';
import { vec2_create } from '../core/math';
import { apply_styles } from '@/utils/css';
import type { ContextMenuItem, ContextMenuProvider, ContextMenuContext } from '@/plugins/context_menu/types';
import {
  ICON_PLUS,
  ICON_MINUS,
  ICON_MAXIMIZE,
  ICON_TABLE,
  ICON_FULLSCREEN,
  ICON_SEARCH_PLUS,
  ICON_SEARCH_MINUS,
  ICON_GRID,
} from '@/icons';

export const controls_plugin: EaselPlugin = (easel) => {
  // -----------------------------------------------------------------------
  // Action functions —shared by both UI buttons and context menu
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


  const btn_zoom_in = document.createElement('button');
  btn_zoom_in.innerHTML = ICON_PLUS;
  btn_zoom_in.title = 'Zoom In';
  btn_zoom_in.addEventListener('click', do_zoom_in);

  const btn_zoom_out = document.createElement('button');
  btn_zoom_out.innerHTML = ICON_MINUS;
  btn_zoom_out.title = 'Zoom Out';
  btn_zoom_out.addEventListener('click', do_zoom_out);

  const btn_fit = document.createElement('button');
  btn_fit.innerHTML = ICON_MAXIMIZE;
  btn_fit.title = 'Fit to view';
  btn_fit.addEventListener('click', do_fit);

  const btn_layout = document.createElement('button');
  btn_layout.innerHTML = ICON_TABLE;
  btn_layout.title = 'Auto Layout';
  btn_layout.addEventListener('click', do_layout);

  const btn_fullscreen = document.createElement('button');
  btn_fullscreen.innerHTML = ICON_FULLSCREEN;
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
      .easel-controls button svg {
        width: 18px;
        height: 18px;
        display: block;
      }
    `;
    (root_node === document ? document.head : root_node).appendChild(style_el);
  }

  const buttons = [btn_zoom_in, btn_zoom_out, btn_fit, btn_layout, btn_fullscreen];

  buttons.forEach((btn) => {
    // 阻止事件冒泡到画布    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    bar.appendChild(btn);
  });
  bar.addEventListener('pointerdown', e => e.stopPropagation());

  easel.container.appendChild(bar);

  // -----------------------------------------------------------------------
  // Context menu provider —register a "Controls" submenu
  // -----------------------------------------------------------------------
  const cm = easel.plugin_data.context_menu;
  if (cm) {
    cm.register({
      id: 'controls',
      priority: 30,
      get_items: (ctx: ContextMenuContext): readonly ContextMenuItem[] => [{
        id: 'controls_submenu',
        label: 'Controls',
        icon: ICON_TABLE,
        submenu: [
          {
            id: 'zoom_in',
            label: 'Zoom In',
            icon: ICON_SEARCH_PLUS,
            action: do_zoom_in,
          },
          {
            id: 'zoom_out',
            label: 'Zoom Out',
            icon: ICON_SEARCH_MINUS,
            action: do_zoom_out,
          },
          {
            id: 'fit_to_view',
            label: 'Fit to View',
            icon: ICON_MAXIMIZE,
            action: do_fit,
          },
          {
            id: 'auto_layout',
            label: 'Auto Layout',
            icon: ICON_GRID,
            action: do_layout,
          },
          {
            id: 'fullscreen',
            label: 'Toggle Fullscreen',
            icon: ICON_FULLSCREEN,
            action: do_fullscreen,
          },
        ],
      }],
    });
  }

};
