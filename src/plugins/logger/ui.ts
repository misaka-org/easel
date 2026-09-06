import { apply_styles } from '@/utils/css';
import type { LoggerService, LogEntry } from './types';

const ALL_LEVELS: ReadonlyArray<string> = ['debug', 'info', 'warn', 'error'];

// ── CSS（注入 shadow root，单次） ──
const CSS = `
.easel-logger {
  position: absolute;
  bottom: 20px;
  right: 20px;
  width: 520px;
  height: 340px;
  background: rgba(0, 0, 0, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
  color: #ccc;
  display: flex;
  flex-direction: column;
  z-index: 1500;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
}
.easel-logger-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.08);
  cursor: grab;
  user-select: none;
  font-size: 13px;
  font-weight: 600;
  color: #eee;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.easel-logger-header:active {
  cursor: grabbing;
}
.easel-logger-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-wrap: wrap;
}
.easel-logger-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #aaa;
  cursor: pointer;
  padding: 2px 8px;
  font-size: 11px;
  font-family: inherit;
  border-radius: 3px;
  transition: all 0.15s;
  line-height: 1.4;
}
.easel-logger-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.easel-logger-btn.active {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.3);
}
.easel-logger-btn.level-debug { color: #888; }
.easel-logger-btn.level-info { color: #ccc; }
.easel-logger-btn.level-warn { color: #eab308; }
.easel-logger-btn.level-error { color: #ef4444; }
.easel-logger-btn.level-debug.active { background: rgba(136, 136, 136, 0.2); border-color: #888; color: #888; }
.easel-logger-btn.level-info.active { background: rgba(204, 204, 204, 0.2); border-color: #ccc; color: #ccc; }
.easel-logger-btn.level-warn.active { background: rgba(234, 179, 8, 0.2); border-color: #eab308; color: #eab308; }
.easel-logger-btn.level-error.active { background: rgba(239, 68, 68, 0.2); border-color: #ef4444; color: #ef4444; }
.easel-logger-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}
.easel-logger-list::-webkit-scrollbar {
  width: 6px;
}
.easel-logger-list::-webkit-scrollbar-track {
  background: transparent;
}
.easel-logger-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}
.easel-logger-entry {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 2px 12px;
  line-height: 1.5;
  transition: background 0.1s;
}
.easel-logger-entry:hover {
  background: rgba(255, 255, 255, 0.04);
}
.easel-logger-time {
  color: #888;
  flex-shrink: 0;
  font-size: 11px;
  min-width: 60px;
}
.easel-logger-level {
  flex-shrink: 0;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  min-width: 40px;
}
.easel-logger-level.debug { color: #888; }
.easel-logger-level.info { color: #ccc; }
.easel-logger-level.warn { color: #eab308; }
.easel-logger-level.error { color: #ef4444; }
.easel-logger-msg {
  flex: 1;
  word-break: break-word;
  color: #ddd;
  white-space: pre-wrap;
}
`;

// ── 单次 CSS 注入（参考 context_menu 的 inject_styles） ──
function inject_styles(root_node: ShadowRoot | Document): void {
  if (root_node.querySelector('#easel-logger-style')) return;
  const style_el = document.createElement('style');
  style_el.id = 'easel-logger-style';
  style_el.textContent = CSS;
  (root_node === document ? document.head : root_node).appendChild(style_el);
}

// ── 时间戳格式化 HH:MM:SS ──
function format_time(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export interface LoggerWindow {
  el: HTMLElement;
  toggle(): void;
  destroy(): void;
}

export function create_logger_window(
  container: HTMLElement,
  service: LoggerService,
): LoggerWindow {
  // ── CSS 注入 ──
  const root_node = container.getRootNode() as ShadowRoot | Document;
  inject_styles(root_node);

  // ── 主容器 ──
  const el = document.createElement('div');
  el.className = 'easel-logger';
  apply_styles(el, { display: 'none' });

  // ── 标题栏（可拖拽） ──
  const header = document.createElement('div');
  header.className = 'easel-logger-header';
  header.textContent = 'Logger';

  // ── 工具栏 ──
  const toolbar = document.createElement('div');
  toolbar.className = 'easel-logger-toolbar';

  // 级别过滤按钮（默认全激活）
  const active_levels: Set<string> = new Set(ALL_LEVELS);
  const level_btns: Record<string, HTMLButtonElement> = {};

  for (const level of ALL_LEVELS) {
    const btn = document.createElement('button');
    btn.className = `easel-logger-btn level-${level} active`;
    btn.textContent = level;
    btn.addEventListener('click', () => {
      if (active_levels.has(level)) {
        active_levels.delete(level);
        btn.classList.remove('active');
      } else {
        active_levels.add(level);
        btn.classList.add('active');
      }
      // 重新计算所有条目可见性
      for (const [id, item_el] of entry_elements) {
        const entry = service.entries.find(e => e.id === id);
        if (entry) {
          item_el.style.display = active_levels.has(entry.level) ? 'flex' : 'none';
        }
      }
    });
    toolbar.appendChild(btn);
    level_btns[level] = btn;
  }

  // 弹性分隔
  const spacer = document.createElement('span');
  spacer.style.cssText = 'flex:1';
  toolbar.appendChild(spacer);

  // auto-scroll 切换
  let auto_scroll = true;
  const auto_btn = document.createElement('button');
  auto_btn.className = 'easel-logger-btn active';
  auto_btn.textContent = 'Auto';
  auto_btn.addEventListener('click', () => {
    auto_scroll = !auto_scroll;
    auto_btn.classList.toggle('active');
  });
  toolbar.appendChild(auto_btn);

  // 清空按钮
  const clear_btn = document.createElement('button');
  clear_btn.className = 'easel-logger-btn';
  clear_btn.textContent = 'Clear';
  clear_btn.addEventListener('click', () => {
    service.clear();
    list.innerHTML = '';
    entry_elements.clear();
  });
  toolbar.appendChild(clear_btn);

  // ── 日志列表 ──
  const list = document.createElement('div');
  list.className = 'easel-logger-list';

  // entry id → DOM 元素
  const entry_elements = new Map<number, HTMLElement>();

  // ── 订阅日志服务 ──
  const unsub = service.subscribe((entry: LogEntry) => {
    const item = document.createElement('div');
    item.className = 'easel-logger-entry';
    item.dataset['id'] = String(entry.id);

    // 时间戳
    const time_span = document.createElement('span');
    time_span.className = 'easel-logger-time';
    time_span.textContent = format_time(entry.timestamp);

    // 级别标签
    const level_span = document.createElement('span');
    level_span.className = `easel-logger-level ${entry.level}`;
    level_span.textContent = entry.level;

    // 消息
    const msg_span = document.createElement('span');
    msg_span.className = 'easel-logger-msg';
    msg_span.textContent = entry.message;

    item.appendChild(time_span);
    item.appendChild(level_span);
    item.appendChild(msg_span);

    // 根据当前过滤设置可见性
    if (!active_levels.has(entry.level)) {
      item.style.display = 'none';
    }

    list.appendChild(item);
    entry_elements.set(entry.id, item);

    // 自动滚动到底部
    if (auto_scroll) {
      list.scrollTop = list.scrollHeight;
    }
  });

  // ── 组装 ──
  el.appendChild(header);
  el.appendChild(toolbar);
  el.appendChild(list);
  container.appendChild(el);

  // ── 拖拽 ──
  // pointermove/up 挂在 el 上（而不是 header），确保拖拽快速移动时不丢失事件
  let dragging = false;
  let drag_start_x = 0;
  let drag_start_y = 0;
  let start_left = 0;
  let start_top = 0;

  // 将视口坐标转为容器相对坐标，兼容初始 right/bottom 定位
  const get_offset_left = (): number => {
    const crect = container.getBoundingClientRect();
    const erect = el.getBoundingClientRect();
    return erect.left - crect.left;
  };

  const get_offset_top = (): number => {
    const crect = container.getBoundingClientRect();
    const erect = el.getBoundingClientRect();
    return erect.top - crect.top;
  };

  const begin_drag = (cx: number, cy: number): void => {
    // 清除 CSS right/bottom，切换到 left/top 定位
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    start_left = get_offset_left();
    start_top = get_offset_top();
    el.style.left = `${start_left}px`;
    el.style.top = `${start_top}px`;
    drag_start_x = cx;
    drag_start_y = cy;
  };

  const on_pointer_down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    el.setPointerCapture(e.pointerId);
    begin_drag(e.clientX, e.clientY);
  };

  const on_pointer_move = (e: PointerEvent) => {
    if (!dragging) return;
    e.preventDefault();
    e.stopPropagation();
    const dx = e.clientX - drag_start_x;
    const dy = e.clientY - drag_start_y;
    el.style.left = `${start_left + dx}px`;
    el.style.top = `${start_top + dy}px`;
  };

  const end_drag = (e: PointerEvent): void => {
    if (!dragging) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = false;
    el.releasePointerCapture(e.pointerId);
  };

  header.addEventListener('pointerdown', on_pointer_down);
  el.addEventListener('pointermove', on_pointer_move);
  el.addEventListener('pointerup', end_drag);
  el.addEventListener('pointercancel', end_drag);

  // ── toggle ──
  let visible = false;
  const toggle = () => {
    visible = !visible;
    el.style.display = visible ? 'flex' : 'none';
  };

  // ── destroy ──
  const destroy = () => {
    unsub();
    header.removeEventListener('pointerdown', on_pointer_down);
    el.removeEventListener('pointermove', on_pointer_move);
    el.removeEventListener('pointerup', end_drag);
    el.removeEventListener('pointercancel', end_drag);
    el.remove();
    entry_elements.clear();
  };

  return { el, toggle, destroy };
}
