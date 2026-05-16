import type { EaselPlugin } from '@/runtime/easel';
import { get_registered_types, get_node_ns } from '@/runtime/registry';
import { add_node } from '@/core/node_ops';
import { vec2_create } from '@/core/math';

// ---------------------------------------------------------------------------
// CSS (injected once)
// ---------------------------------------------------------------------------
const CSS = `
.easel-node-picker-overlay {
  position: absolute;
  inset: 0;
  z-index: 2000;
  display: none;
  align-items: flex-start;
  justify-content: center;
  padding-top: 80px;
  background: rgba(0, 0, 0, 0.2);
}
.easel-node-picker-overlay.open {
  display: flex;
}
.easel-node-picker {
  position: relative;
  width: 340px;
  max-height: 440px;
  background: var(--popover-bg, #18181b);
  border: 1px solid var(--border-color, #27272a);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  align-self: flex-start;
}
.easel-node-picker-search {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color, #27272a);
}
.easel-node-picker-search input {
  width: 100%;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-color, #27272a);
  border-radius: 8px;
  padding: 10px 12px;
  color: var(--text-color, #fafafa);
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
}
.easel-node-picker-search input:focus {
  border-color: var(--text-color, #fafafa);
}
.easel-node-picker-search input::placeholder {
  color: var(--text-muted, #888);
}
.easel-node-picker-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}
.easel-node-picker-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-color, #fafafa);
  font-size: 13px;
  transition: background 0.08s ease;
}
.easel-node-picker-item.highlighted {
  background: rgba(255, 255, 255, 0.1);
}
.easel-node-picker-item .np-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--primary-color, #fafafa);
}
.easel-node-picker-item .np-label {
  flex: 1;
  min-width: 0;
}
.easel-node-picker-item .np-ns {
  font-size: 11px;
  color: var(--text-muted, #888);
  flex-shrink: 0;
  margin-left: auto;
}
.easel-node-picker-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-muted, #888);
  font-size: 13px;
}
`;

function inject_styles(root_node: ShadowRoot | Document): void {
  if (root_node.querySelector('#easel-node-picker-style')) return;
  const style_el = document.createElement('style');
  style_el.id = 'easel-node-picker-style';
  style_el.textContent = CSS;
  (root_node === document ? document.head : root_node).appendChild(style_el);
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------
type PickerEntry = {
  type: string;
  label: string;
  ns: readonly string[];
};

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------
export const node_picker_plugin: EaselPlugin = (easel) => {
  const root_node = easel.container.getRootNode() as ShadowRoot | Document;
  inject_styles(root_node);

  // ---- Rebuildable entry list from registry ----
  let entries: PickerEntry[] = [];
  let filtered: PickerEntry[] = [];
  let highlight_index = 0;
  let world_pos = { x: 0, y: 0 };
  let is_open = false;

  const rebuild_entries = () => {
    const types = get_registered_types().filter(
      (t) => t !== 'subgraph_input' && t !== 'subgraph_output',
    );
    entries = types.map((type_name) => ({
      type: type_name,
      label: type_name
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase()),
      ns: get_node_ns(type_name) || [],
    }));
    // Sort: entries with ns first, then by ns path + label
    entries.sort((a, b) => {
      const a_has = a.ns.length > 0 ? 0 : 1;
      const b_has = b.ns.length > 0 ? 0 : 1;
      if (a_has !== b_has) return a_has - b_has;
      const a_key = [...a.ns, a.label].join('/');
      const b_key = [...b.ns, b.label].join('/');
      return a_key.localeCompare(b_key);
    });
    filtered = [...entries];
  };
  rebuild_entries();

  // ---- DOM ----
  const overlay = document.createElement('div');
  overlay.className = 'easel-node-picker-overlay';

  const panel = document.createElement('div');
  panel.className = 'easel-node-picker';

  const search_wrap = document.createElement('div');
  search_wrap.className = 'easel-node-picker-search';
  const search_input = document.createElement('input');
  search_input.type = 'text';
  search_input.placeholder = 'Search nodes...';
  search_wrap.appendChild(search_input);
  panel.appendChild(search_wrap);

  const list_el = document.createElement('div');
  list_el.className = 'easel-node-picker-list';
  panel.appendChild(list_el);

  overlay.appendChild(panel);
  easel.container.appendChild(overlay);

  // Intercept all pointer events on the overlay so they don't reach the canvas.
  // Clicks on the overlay backdrop close the picker; clicks inside the panel
  // stop at the overlay boundary so canvas drag/wiring/pan never trigger.
  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay) do_close();
    e.stopPropagation();
  });
  overlay.addEventListener('pointerup', (e) => e.stopPropagation());
  overlay.addEventListener('click', (e) => e.stopPropagation());

  // Prevent wheel events on the picker from zooming the canvas below
  overlay.addEventListener('wheel', (e) => e.stopPropagation(), { passive: false });

  // Close picker when clicking outside the overlay (e.g. on the HUD panel)
  const window_pointerdown_handler = (e: PointerEvent) => {
    if (!is_open) return;
    const target = e.composedPath()[0] as HTMLElement;
    if (!overlay.contains(target)) {
      do_close();
    }
  };
  window.addEventListener('pointerdown', window_pointerdown_handler);

  // ---- Render / highlight helpers ----
  //
  // IMPORTANT: build_list() creates the full item DOM.  It is called only
  // when filtered changes (open or search input).  Hover and keyboard
  // navigation use apply_highlight(), which toggles a CSS class on existing
  // elements WITHOUT rebuilding the DOM.  This keeps the pointer -> target
  // chain intact so pointerdown/up/click on items works reliably.
  //
  let current_highlighted_el: HTMLElement | null = null;

  const build_list = () => {
    current_highlighted_el = null;
    list_el.innerHTML = '';
    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'easel-node-picker-empty';
      empty.textContent = 'No matching nodes found';
      list_el.appendChild(empty);
      return;
    }

    for (let i = 0; i < filtered.length; i++) {
      const entry = filtered[i];
      const item = document.createElement('div');
      item.className = 'easel-node-picker-item';

      const dot = document.createElement('span');
      dot.className = 'np-dot';
      item.appendChild(dot);

      const label_span = document.createElement('span');
      label_span.className = 'np-label';
      label_span.textContent = entry.label;
      item.appendChild(label_span);

      if (entry.ns.length > 0) {
        const ns = document.createElement('span');
        ns.className = 'np-ns';
        ns.textContent = entry.ns.join(' / ');
        item.appendChild(ns);
      }

      // Use pointerup instead of click to ensure reliable selection
      // in all shadow-DOM environments.
      item.addEventListener('pointerup', (e_idx) => {
        e_idx.stopPropagation();
        select_entry(i);
      });
      item.addEventListener('mouseenter', () => apply_highlight(i));

      list_el.appendChild(item);
    }

    apply_highlight(highlight_index);
  };

  /** Toggle the highlighted class without rebuilding the DOM. */
  const apply_highlight = (index: number) => {
    if (current_highlighted_el) {
      current_highlighted_el.classList.remove('highlighted');
      current_highlighted_el = null;
    }
    const child = list_el.children[index] as HTMLElement | undefined;
    if (child) {
      child.classList.add('highlighted');
      current_highlighted_el = child;
    }
  };

  // ---- Actions ----
  const select_entry = (index: number) => {
    const entry = filtered[index];
    if (!entry) return;
    do_close();

    const id = entry.type + '_' + Date.now();
    const node_data: any = {
      id,
      type: entry.type,
      position: vec2_create(world_pos.x, world_pos.y),
      size: vec2_create(180, 100),
      title: entry.label,
      inputs: [],
      outputs: [],
      widgets: [],
      custom_data: {},
    };
    easel.dispatch((st: any) => add_node(st, node_data));
  };

  const do_close = () => {
    if (!is_open) return;
    is_open = false;
    overlay.classList.remove('open');
  };

  const do_open = (click_world_pos: { x: number; y: number }) => {
    world_pos = click_world_pos;
    rebuild_entries();
    highlight_index = 0;
    filtered = [...entries];
    build_list();
    is_open = true;
    overlay.classList.add('open');
    search_input.value = '';
    requestAnimationFrame(() => search_input.focus());
  };

  // ---- Search filtering ----
  search_input.addEventListener('input', () => {
    const query = search_input.value.toLowerCase();
    if (!query) {
      filtered = [...entries];
    } else {
      filtered = entries.filter((e) => {
        const name_match = e.label.toLowerCase().includes(query);
        const ns_match = e.ns.some((s) => s.toLowerCase().includes(query));
        const type_match = e.type.toLowerCase().includes(query);
        return name_match || ns_match || type_match;
      });
    }
    highlight_index = 0;
    build_list(); // rebuild list on filter change
  });

  // ---- Keyboard navigation ----
  search_input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filtered.length === 0) return;
      highlight_index = (highlight_index + 1) % filtered.length;
      apply_highlight(highlight_index);
      current_highlighted_el?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filtered.length === 0) return;
      highlight_index = (highlight_index - 1 + filtered.length) % filtered.length;
      apply_highlight(highlight_index);
      current_highlighted_el?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      select_entry(highlight_index);
    } else if (e.key === 'Escape') {
      do_close();
    }
  });

  // ---- Dblclick on empty space opens the picker ----
  easel.container.addEventListener('dblclick', (e) => {
    // Use elementFromPoint (matching the context_menu plugin) so the .node
    // check reliably crosses shadow DOM boundaries.
    const root = easel.container.getRootNode() as ShadowRoot | Document;
    const el = root.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    if (el?.closest('.node')) return;

    e.stopPropagation();

    const rect = easel.container.getBoundingClientRect();
    const screen_x = e.clientX - rect.left;
    const screen_y = e.clientY - rect.top;
    const state = easel.state.value;

    do_open({
      x: (screen_x - state.camera.position.x) / state.camera.zoom,
      y: (screen_y - state.camera.position.y) / state.camera.zoom,
    });
  });
};