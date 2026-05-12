import type { GraphNode, State } from '../core/types';

export type Dispatch = (updater: (state: State) => State) => void;

export abstract class EaselNode {
  protected container: HTMLElement;
  protected dispatch: Dispatch;
  protected node_id: string;
  protected context: Record<string, any>;

  constructor(container: HTMLElement, dispatch: Dispatch, node_id: string, context: Record<string, any>) {
    this.container = container;
    this.dispatch = dispatch;
    this.node_id = node_id;
    this.context = context;
  }

  abstract mount(node_data: GraphNode): void;
  abstract update(node_data: GraphNode, state: State): void;
  abstract unmount(): void;

  get_input_value(state: State, port_id: string): any {
    const wire = Object.values(state.wires).find(w => w.target_node_id === this.node_id && w.target_port_id === port_id);
    if (!wire) return undefined;
    const source_node = state.nodes[wire.source_node_id];
    return source_node?.custom_data[wire.source_port_id];
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
            custom_data: { ...node.custom_data, [port_id]: value }
          }
        }
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
  context: Record<string, any>
) => EaselNode;

const registry = new Map<string, EaselNodeConstructor>();

export const register_node_type = (type: string, constructor: EaselNodeConstructor): void => {
  registry.set(type, constructor);
};

export const get_node_constructor = (type: string): EaselNodeConstructor | undefined => {
  return registry.get(type);
};

export const get_registered_types = (): string[] => {
  return Array.from(registry.keys());
};