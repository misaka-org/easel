import type { GraphNode, State } from '@/core/types';
import type { ContextMenuContext, ContextMenuItem } from '@/plugins/context_menu/types';
import { vec2_create, type Vec2 } from '@/core/math';
import type { Port, Widget } from '@/core/types';

export type Dispatch = (updater: (state: State) => State) => void;

export abstract class EaselNode {
  protected container: HTMLElement;
  protected dispatch: Dispatch;
  protected node_id: string;
  protected context: Record<string, any>;

  constructor(
    container: HTMLElement,
    dispatch: Dispatch,
    node_id: string,
    context: Record<string, any>,
  ) {
    this.container = container;
    this.dispatch = dispatch;
    this.node_id = node_id;
    this.context = context;
  }

  abstract mount(node_data: GraphNode): void;
  abstract update(node_data: GraphNode, state: State): void;
  abstract unmount(): void;

  /**
   * Optional static port/widget definitions. When set, nodes created via the
   * picker or context menu will automatically include these ports.
   *
   * @example
   * class MyNode extends EaselNode {
   *   static node_spec: NodeSpec = {
   *     inputs: [{ id: "in", label: "Input", type: "input", value_type: "text" }],
   *     outputs: [{ id: "out", label: "Output", type: "output", value_type: "text" }],
   *   };
   * }
   */
  static node_spec?: NodeSpec;

  /**
   * Optional: return context menu items when this node is right-clicked.
   * Only invoked when the context_menu_plugin is loaded; it is checked at
   * runtime by the plugin so adding the method here is purely for ergonomic
   * / IDE support.
   */
  get_context_menu_items?(ctx: ContextMenuContext): readonly ContextMenuItem[];

  get_input_value(_state: State, _port_id: string): any {
    // 连线查询已移至 wire 插件，此处不再通过 state.bindings 查找
    return undefined;
  }

  get_widget_value(state: State, widget_id: string): any {
    const node = state.nodes[this.node_id];
    return node?.widgets?.find(w => w.id === widget_id)?.value;
  }

  get_value(state: State, id: string): any {
    const val = this.get_input_value(state, id);
    if (val !== undefined) return val;
    return this.get_widget_value(state, id);
  }

  set_output_value(port_id: string, value: any) {
    this.dispatch(state => {
      const node = state.nodes[this.node_id];
      if (!node || node.custom_data[port_id] === value) return state;
      return {
        ...state,
        nodes: {
          ...state.nodes,
          [this.node_id]: {
            ...node,
            custom_data: { ...node.custom_data, [port_id]: value },
          },
        },
      };
    });
  }

  async execute?(ctx: ExecuteContext): Promise<Record<string, unknown>>;
}

export type ExecuteContext = {
  readonly node: import('../core/types').GraphNode;
  readonly inputs: Record<string, unknown>;
  readonly report_progress: (progress: number) => void;
  readonly signal?: AbortSignal;
};

export type EaselNodeConstructor = new (
  container: HTMLElement,
  dispatch: Dispatch,
  node_id: string,
  context: Record<string, any>,
) => EaselNode;

const registry = new Map<string, EaselNodeConstructor>();
const node_ns_registry = new Map<string, string[]>();
const node_spec_registry = new Map<string, NodeSpec>();

/** Optional port/widget/size definitions for a node type.
 *  Accepted via `register_node_type(..., spec)` or as `static node_spec` on the class. */
export type NodeSpec = {
  readonly inputs?: readonly Port[];
  readonly outputs?: readonly Port[];
  readonly widgets?: readonly Widget[];
  readonly size?: Vec2;
  readonly title?: string;
  readonly resizable?: boolean;
  readonly collapsed?: boolean;
  readonly style_mode?: 'default' | 'borderless';
};

/** Register a node type, optionally with its default port/widget definitions.
 *  When a spec is provided, nodes created via the picker or context menu will
 *  automatically include these ports. */
export const register_node_type = (
  type: string,
  constructor: EaselNodeConstructor,
  spec?: NodeSpec,
): void => {
  registry.set(type, constructor);
  if (spec) node_spec_registry.set(type, spec);
};

/**
 * Register a namespace path for a node type.
 * The context menu plugin uses this to organize the "Add Node" submenu
 * into hierarchical categories.
 */
export const register_node_ns = (type: string, ns: string[]): void => {
  node_ns_registry.set(type, ns);
};
/** Retrieve the namespace path for a node type, if set. */
export const get_node_ns = (type: string): string[] | undefined => {
  return node_ns_registry.get(type);
};

export const get_node_constructor = (type: string): EaselNodeConstructor | undefined => {
  return registry.get(type);
};

export const get_registered_types = (): string[] => {
  return Array.from(registry.keys());
};

/** Resolve the NodeSpec for a type:
 *  1. explicit `register_node_type(..., spec)` or `register_node_spec()`
 *  2. static `node_spec` on the constructor class
 *  3. undefined (caller decides fallback)
 */
export const resolve_node_spec = (type: string): NodeSpec | undefined => {
  const node_ctor = registry.get(type);
  return node_spec_registry.get(type) ?? (node_ctor as any)?.node_spec;
};

/** Register default port/widget definitions for a node type.
 *  Alternative to providing `spec` in `register_node_type()`. */
export const register_node_spec = (type: string, spec: NodeSpec): void => {
  node_spec_registry.set(type, spec);
};

/** Create a full GraphNode for the given type, including its spec-defined ports. */
export const create_node_data = (
  type: string,
  overrides?: Partial<Pick<GraphNode, 'id' | 'position' | 'title' | 'custom_data'>>,
): GraphNode => {
  const spec = resolve_node_spec(type);
  const title = type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  return {
    id: `${type}_${Date.now()}`,
    type,
    position: vec2_create(0, 0),
    size: spec?.size ?? vec2_create(180, 100),
    title: spec?.title ?? title,
    inputs: spec?.inputs ?? [],
    outputs: spec?.outputs ?? [],
    widgets: spec?.widgets ?? [],
    custom_data: {},
    ...(spec?.resizable !== undefined ? { resizable: spec.resizable } : {}),
    ...(spec?.collapsed !== undefined ? { collapsed: spec.collapsed } : {}),
    ...(spec?.style_mode !== undefined ? { style_mode: spec.style_mode } : {}),
    ...overrides,
  } as GraphNode;
};
