import { apply_styles } from '@/utils/css';
import type { ContextMenuProvider, ContextMenuItem, ContextMenuContext } from './types';

export class ContextMenuService {
  private providers = new Map<string, ContextMenuProvider>();
  private menu_el: HTMLElement;
  private container: HTMLElement;

  // Submenu state
  private submenu: HTMLElement | null = null;
  private submenu_timer: ReturnType<typeof setTimeout> | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.menu_el = document.createElement('div');
    this.menu_el.className = 'easel-context-menu';
    container.appendChild(this.menu_el);

    this.menu_el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.menu_el.addEventListener('click', (e) => e.stopPropagation());
  }

  get menu_element(): HTMLElement {
    return this.menu_el;
  }

  // ---------------------------------------------------------------------------
  // Provider registry
  // ---------------------------------------------------------------------------

  register(provider: ContextMenuProvider): () => void {
    this.providers.set(provider.id, provider);
    return () => this.unregister(provider.id);
  }

  unregister(id: string): void {
    this.providers.delete(id);
  }

  /** Show the context menu at the given screen-space position. */
  show(ctx: ContextMenuContext, screen_pos: { x: number; y: number }): void {
    const items = this.collect(ctx);

    this.menu_el.innerHTML = '';
    this.menu_el.style.left = `${screen_pos.x}px`;
    this.menu_el.style.top = `${screen_pos.y}px`;
    this.menu_el.style.display = 'flex';

    let last_group: string | undefined;
    for (const item of items) {
      // Insert separator when group changes
      if (last_group !== undefined && item.group !== undefined && item.group !== last_group) {
        const sep = document.createElement('div');
        sep.className = 'easel-context-menu-separator';
        this.menu_el.appendChild(sep);
      }
      last_group = item.group;

      this.menu_el.appendChild(this.create_item_element(item));
    }
  }

  /** Hide / close the menu */
  hide(): void {
    this.menu_el.style.display = 'none';
    this.hide_submenu();
    this.menu_el.innerHTML = '';
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private collect(ctx: ContextMenuContext): readonly ContextMenuItem[] {
    const sorted = [...this.providers.values()].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );

    // Exclusive check: if an exclusive provider has items, take only those
    for (const p of sorted) {
      const items = p.get_items(ctx);
      if (items.length > 0 && p.exclusive) return items;
    }

    // Normal collection: merge items from all providers in priority order
    const result: ContextMenuItem[] = [];
    for (const p of sorted) {
      result.push(...p.get_items(ctx));
    }
    return result;
  }

  private create_item_element(item: ContextMenuItem): HTMLElement {
    // Non-interactive label
    if (item.kind === 'label') {
      return this.create_label_element(item);
    }

    const el = document.createElement('div');
    el.className = 'easel-context-menu-item';
    if (item.disabled) el.classList.add('disabled');

    // Optional icon
    if (item.icon) {
      const icon_el = document.createElement('span');
      icon_el.className = 'easel-context-menu-item-icon';
      icon_el.innerHTML = item.icon;
      el.appendChild(icon_el);
    }

    // Label text
    const label_el = document.createElement('span');
    label_el.className = 'easel-context-menu-item-label';
    label_el.textContent = item.label;
    el.appendChild(label_el);

    const has_submenu = item.submenu && item.submenu.length > 0;
    if (has_submenu) {
      const arrow = document.createElement('span');
      arrow.className = 'easel-context-menu-item-arrow';
      arrow.innerHTML = '&#x25B6;';
      el.appendChild(arrow);

      el.addEventListener('mouseenter', () => {
        if (item.submenu) this.show_submenu(el, item.submenu);
      });
    }

    if (!item.disabled && item.action) {
      el.addEventListener('click', () => {
        item.action!();
        this.hide();
      });
    }

    return el;
  }

  private create_label_element(item: ContextMenuItem): HTMLElement {
    const el = document.createElement('div');
    el.className = 'easel-context-menu-label';

    if (item.icon) {
      const icon_el = document.createElement('span');
      icon_el.className = 'easel-context-menu-label-icon';
      icon_el.innerHTML = item.icon;
      el.appendChild(icon_el);
    }

    const label_el = document.createElement('span');
    label_el.className = 'easel-context-menu-label-text';
    label_el.textContent = item.label;
    el.appendChild(label_el);

    return el;
  }

  private hide_submenu(): void {
    if (this.submenu_timer) {
      clearTimeout(this.submenu_timer);
      this.submenu_timer = null;
    }
    if (this.submenu) {
      this.submenu.remove();
      this.submenu = null;
    }
  }

  private show_submenu(parent_item: HTMLElement, items: readonly ContextMenuItem[]): void {
    if (items.length === 0) return;

    // Find the containing menu — the submenu will be attached as its child
    const parent_menu = parent_item.closest('.easel-context-menu') as HTMLElement;
    if (!parent_menu) return;

    // Clear any close timer
    if (this.submenu_timer) {
      clearTimeout(this.submenu_timer);
      this.submenu_timer = null;
    }

    // Remove any existing submenu of this parent menu (closes the previous branch)
    const existing = parent_menu.querySelector(':scope > .easel-context-menu');
    if (existing) existing.remove();

    const sub = document.createElement('div');
    sub.className = 'easel-context-menu';
    apply_styles(sub, {
      position: 'absolute',
      display: 'flex',
      zIndex: '2001',
    });

    for (const item of items) {
      sub.appendChild(this.create_item_element(item));
    }

    parent_menu.appendChild(sub);

    // Position relative to the parent menu's coordinate space
    const menu_rect = parent_menu.getBoundingClientRect();
    const item_rect = parent_item.getBoundingClientRect();
    sub.style.left = `${item_rect.right - menu_rect.left}px`;
    sub.style.top = `${item_rect.top - menu_rect.top}px`;

    sub.addEventListener('mouseenter', () => {
      if (this.submenu_timer) clearTimeout(this.submenu_timer);
    });
    sub.addEventListener('mouseleave', () => {
      this.submenu_timer = setTimeout(() => this.hide_submenu(), 300);
    });

    this.submenu = sub;
  }
}
