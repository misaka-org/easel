import type { Vec2 } from '@/core/math';

/** Context passed to every provider's get_items() */
export interface ContextMenuContext {
  /** Node id if right-click was on a node */
  readonly node_id?: string;
  /** Node type if right-click was on a node */
  readonly node_type?: string;
  /** Screen-space position relative to the container */
  readonly screen_pos: Vec2;
  /** World-space position (accounting for camera) */
  readonly world_pos: Vec2;
  /** The raw element that was right-clicked */
  readonly target?: HTMLElement;
  /** The easel canvas container */
  readonly container: HTMLElement;
}

/** A single item in the context menu */
export interface ContextMenuItem {
  readonly id: string;
  readonly label: string;
  /**
   * Icon rendered before the label. HTML string — pass inline SVG or other markup.
   * For Lucide icons, pass the full <svg> element.
   */
  readonly icon?: string;
  /**
   * Item behavior kind:
   *   'item'   — clickable action item (default)
   *   'label'  — non-interactive informational label (no hover, no click)
   */
  readonly kind?: 'item' | 'label';
  readonly action?: () => void;
  readonly submenu?: readonly ContextMenuItem[];
  readonly disabled?: boolean;
  readonly group?: string;
}

/** A provider contributes items to the context menu */
export interface ContextMenuProvider {
  readonly id: string;
  /** Higher priority items appear first. Default 0. */
  readonly priority?: number;
  /** Return items for the given context. Called each time the menu opens. */
  readonly get_items: (ctx: ContextMenuContext) => readonly ContextMenuItem[];
  /**
   * When true and get_items returns non-empty, no other provider's items
   * will be shown. Enables a provider to "take over" the menu.
   */
  readonly exclusive?: boolean;
}
