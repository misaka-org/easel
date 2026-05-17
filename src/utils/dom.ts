// 全局复用的隐藏 div + 归一化结果缓存，避免重复创建元素和 innerHTML 开销
const _reuser = typeof document !== 'undefined' ? document.createElement('div') : null;
const _cache = new Map<string, string>();
// 记录每个元素最后设置的归一化字符串，避免读取 el.innerHTML（浏览器需遍历 DOM 树序列化）
const _last_set = new WeakMap<HTMLElement, string>();

/** 对 HTML 做 innerHTML 往返归一化，缓存结果避免重复解析 */
function _normalize(html: string): string {
  const cached = _cache.get(html);
  if (cached !== undefined) return cached;
  if (_reuser) {
    _reuser.innerHTML = html;
    const normal = _reuser.innerHTML;
    _cache.set(html, normal);
    return normal;
  }
  // 非浏览器环境兜底
  _cache.set(html, html);
  return html;
}

/**
 * 通过 innerHTML 往返归一化后，WeakMap 跟踪再比对，仅在内容实际变化时 patch。
 * 避免浏览器序列化差异（如 SVG 自闭合标签 <xx /> → <xx></xx>）导致的反复 innerHTML 赋值。
 * @param skip_check 跳过归一化比对，直接设置 innerHTML（适合调用方已知内容必定变化的场景）
 */
export function set_inner_html(el: HTMLElement, html: string, skip_check?: boolean): void {
  if (skip_check) {
    el.innerHTML = _normalize(html);
    return;
  }
  const normal = _normalize(html);
  const last = _last_set.get(el);
  if (last !== normal) {
    el.innerHTML = normal;
    _last_set.set(el, normal);
  }
}
