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
}

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