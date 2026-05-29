/**
 * Toolbar plugin — 底部工具切换条。
 */

import type { EaselPlugin } from '@/runtime/easel';

export const toolbar_plugin: EaselPlugin = {
  id: '@easel/toolbar',
  setup(easel) {
  const bar = document.createElement('div');
  bar.className = 'easel-toolbar';
  bar.style.cssText = `
    position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
    display: flex; gap: 2px; z-index: 1000;
    background: var(--popover-bg, rgba(24,24,27,0.9));
    border-radius: 10px; border: 1px solid var(--border-color, #27272a);
    padding: 4px; backdrop-filter: blur(8px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;

  const buttons: Map<string, HTMLButtonElement> = new Map();

  function rebuild() {
    const tools = easel.tools.list();
    const current = easel.state.value.active_tool;

    bar.innerHTML = '';
    buttons.clear();

    for (const t of tools) {
      const btn = document.createElement('button');
      btn.textContent = t.label;
      btn.title = t.label;
      btn.dataset['tool'] = t.id;
      btn.style.cssText = `
        border: none; background: transparent; color: var(--text-color, #fafafa);
        cursor: pointer; padding: 6px 14px; border-radius: 6px;
        font-size: 13px; font-family: inherit; transition: all 0.12s;
      `;
      btn.addEventListener('pointerdown', e => {
        e.stopPropagation();
        easel.tools.activate(t.id);
        rebuild();
      });
      bar.appendChild(btn);
      buttons.set(t.id, btn);
    }

    update_active(current);
  }

  function update_active(id: string) {
    for (const [tid, btn] of buttons) {
      if (tid === id) {
        btn.style.background = 'rgba(255,255,255,0.15)';
        btn.style.fontWeight = '600';
      } else {
        btn.style.background = 'transparent';
        btn.style.fontWeight = '400';
      }
    }
  }

  // 监听工具切换
  easel.app_events.on('state_changed', ({ next }) => {
    if (next.active_tool !== easel.state.value.active_tool) return;
    update_active(next.active_tool);
  });

  easel.container.appendChild(bar);
  rebuild();
  },
};
