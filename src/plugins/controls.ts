import type { EaselPlugin } from '@/runtime/easel';
import { apply_styles } from '@/utils/css';
import { auto_layout } from '@/runtime/auto_layout';
import type { ContextMenuItem, ContextMenuContext } from '@/plugins/context_menu/types';
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

export const controls_plugin: EaselPlugin = easel => {
  // -----------------------------------------------------------------------
  // Action functions —shared by both UI buttons and context menu
  // -----------------------------------------------------------------------
  const do_zoom_in = () => easel.camera.zoomIn();
  const do_zoom_out = () => easel.camera.zoomOut();
  const do_zoom_reset = () => easel.camera.zoomReset();
  const do_fit = () => easel.camera.fitToView();
  const do_layout = () => {
    const vp = easel.container.getBoundingClientRect();
    const s = easel.state.value;
    const result = auto_layout(s.nodes, s.wires, vp.width, vp.height);
    const new_nodes = { ...s.nodes };
    for (const [id, pos] of Object.entries(result.positions)) {
      new_nodes[id] = { ...new_nodes[id], position: pos };
    }
    easel.dispatch(() => ({
      ...s,
      nodes: new_nodes,
      camera: { zoom: result.zoom, position: result.camera_pos },
    }));
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

  const btn_zoom_display = document.createElement('button');
  btn_zoom_display.className = 'easel-zoom-display';
  btn_zoom_display.textContent = '100%';
  btn_zoom_display.title = 'Reset Zoom';
  btn_zoom_display.style.fontSize = '12px';
  btn_zoom_display.style.fontFamily = 'monospace';
  btn_zoom_display.style.pointerEvents = 'auto';
  btn_zoom_display.addEventListener('click', do_zoom_reset);

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
      .easel-controls .easel-zoom-display {
        border-left: 1px solid rgba(255,255,255,0.08);
        border-right: 1px solid rgba(255,255,255,0.08);
        cursor: pointer;
        letter-spacing: 0.5px;
        font-weight: 500;
      }
      .easel-controls .easel-zoom-display:hover {
        background: rgba(255,255,255,0.08);
      }
    `;
    (root_node === document ? document.head : root_node).appendChild(style_el);
  }

  const buttons = [btn_zoom_in, btn_zoom_out, btn_zoom_display, btn_fit, btn_layout, btn_fullscreen];

  buttons.forEach(btn => {
    // 阻止事件冒泡到画布    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    bar.appendChild(btn);
  });
  bar.addEventListener('pointerdown', e => e.stopPropagation());

  // 监听缩放变化更新百分比显示
  const update_zoom_display = () => {
    const zoom = easel.state.value.camera.zoom;
    btn_zoom_display.textContent = `${Math.round(zoom * 100)}%`;
  };
  easel.app_events.on('state_changed', update_zoom_display);

  easel.container.appendChild(bar);

  // -----------------------------------------------------------------------
  // Context menu provider —register a "Controls" submenu
  // -----------------------------------------------------------------------
  const cm = easel.plugin_data.context_menu;
  if (cm) {
    cm.register({
      id: 'controls',
      priority: 30,
      get_items: (_ctx: ContextMenuContext): readonly ContextMenuItem[] => [
        {
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
        },
      ],
    });
  }
};
