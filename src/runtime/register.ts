import type { Widget } from '@/core/types';
import type { EaselNodeConstructor, NodeSpec } from './registry';
import {
  register_node_type as _reg_node,
  register_node_spec as _reg_spec,
  register_node_ns as _reg_ns,
  get_node_constructor,
  get_node_ns as _get_ns,
  get_registered_types,
  resolve_node_spec,
} from './registry';
import builtin_widgets from './builtin_widgets';

// -------------------------------------------------------------------
// Widget type system
// -------------------------------------------------------------------

export type WidgetUpdateOptions = {
  connected: boolean;
  disabled: boolean;
};

export type WidgetTypeDef = {
  type: string;
  /** Create the widget's DOM element. Called once on mount/schema-change. */
  create: (widget: Widget) => HTMLElement;
  /** Update the widget element with current value/state. Called every frame. */
  update: (el: HTMLElement, widget: Widget, options: WidgetUpdateOptions) => void;
  /** Parse input value from the element. Called on input event. */
  parse?: (el: HTMLElement) => string | number | boolean;
};

const widget_registry = new Map<string, WidgetTypeDef>();

export const get_widget_type = (type: string): WidgetTypeDef | undefined =>
  widget_registry.get(type);

// -------------------------------------------------------------------
// Register class
// -------------------------------------------------------------------

export class Register {
  /** Register a node type (class-based). */
  add_node(type: string, ctor: EaselNodeConstructor, spec?: NodeSpec): void {
    _reg_node(type, ctor, spec);
  }

  /** Register port/widget/size defaults for a node type. */
  add_node_spec(type: string, spec: NodeSpec): void {
    _reg_spec(type, spec);
  }

  /** Register a namespace path (for "Add Node" submenu hierarchy). */
  add_node_ns(type: string, ns: string[]): void {
    _reg_ns(type, ns);
  }

  /** Register a widget type (built-in or custom). */
  add_widget(def: WidgetTypeDef): void {
    widget_registry.set(def.type, def);
  }

  // --- Read-only accessors (delegate to existing registry functions) ---
  get_node_ctor = get_node_constructor;
  get_node_ns = _get_ns;
  get_registered_types = get_registered_types;
  get_node_spec = resolve_node_spec;
  get_widget = get_widget_type;
}

/** Seed built-in widget types into the registry. Called once at startup. */
export function register_builtin_widgets(): void {
  for (const w of builtin_widgets) {
    widget_registry.set(w.type, w);
  }
}
