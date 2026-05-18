import type { Vec2 } from './math';

export type Port = {
  readonly id: string;
  readonly label: string;
  readonly type: 'input' | 'output';
  readonly value_type?: string;
  readonly accepts?: readonly string[];
  readonly required?: boolean;
};

export type WidgetValue = string | number | boolean;

export type WidgetOption = { readonly label: string; readonly value: string };

export type Widget = {
  readonly id: string;
  readonly type:
    | 'text'
    | 'textarea'
    | 'number'
    | 'boolean'
    | 'color'
    | 'select'
    | 'range'
    | 'switch';
  readonly label: string;
  readonly value: WidgetValue;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly options?: readonly string[] | readonly WidgetOption[];
  readonly value_type?: string;
  readonly accepts?: readonly string[];
  readonly required?: boolean;
};

export type GraphNode = {
  readonly id: string;
  readonly type: string;
  readonly position: Vec2;
  readonly size: Vec2;
  readonly title: string;
  readonly inputs: readonly Port[];
  readonly outputs: readonly Port[];
  readonly widgets?: readonly Widget[];
  readonly style_mode?: 'default' | 'borderless';
  readonly resizable?: boolean;
  readonly collapsed?: boolean;
  readonly custom_data: Record<string, unknown>;
};

export type Wire = {
  readonly id: string;
  readonly source_node_id: string;
  readonly source_port_id: string;
  readonly target_node_id: string;
  readonly target_port_id: string;
};


/** 
 * Generic binding between two nodes.
 * `type` discriminates the binding's semantics:
 *   - `data-flow`: wire-like connection (source_handle/target_handle are port_ids)
 *   - `group-child`: group membership (source_handle='parent', target_handle='child')
 *   - future: `subgraph-boundary`, `annotation-link`, etc.
 */
export type Binding = {
  readonly id: string;
  readonly type: string;
  readonly source_id: string;
  readonly source_handle: string;
  readonly target_id: string;
  readonly target_handle: string;
  readonly meta?: Record<string, unknown>;
};

/** Create a data-flow binding (wire equivalent). */
export const create_data_flow_binding = (
  source_node_id: string,
  source_port_id: string,
  target_node_id: string,
  target_port_id: string,
): Binding => ({
  id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  type: 'data-flow',
  source_id: source_node_id,
  source_handle: source_port_id,
  target_id: target_node_id,
  target_handle: target_port_id,
});

/** Create a group-child binding. */
export const create_group_child_binding = (
  group_id: string,
  child_id: string,
): Binding => ({
  id: `gb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  type: 'group-child',
  source_id: group_id,
  source_handle: 'parent',
  target_id: child_id,
  target_handle: 'child',
});

export type Camera = {
  readonly position: Vec2;
  readonly zoom: number;
};

export type Interaction =
  | { readonly mode: 'idle' }
  | {
      readonly mode: 'dragging';
      readonly node_ids: readonly string[];
      readonly start_pos: Vec2;
      readonly original_nodes: Record<string, GraphNode>;
    }
  | {
      readonly mode: 'resizing';
      readonly node_id: string;
      readonly start_pos: Vec2;
      readonly start_size: Vec2;
    }
  | { readonly mode: 'panning'; readonly start_pos: Vec2; readonly original_camera: Vec2 }
  | {
      readonly mode: 'wiring';
      readonly source_node_id: string;
      readonly source_port_id: string;
      readonly target_pos: Vec2;
    }
  | { readonly mode: 'box_selecting'; readonly start_pos: Vec2; readonly current_pos: Vec2 };

export type GraphState = {
  readonly nodes: Record<string, GraphNode>;
  readonly wires: Record<string, Wire>;
  readonly bindings?: Record<string, Binding>;
};

export type Modifiers = {
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
};

export type State = {
  readonly nodes: Record<string, GraphNode>;
  readonly wires: Record<string, Wire>;
  readonly bindings: Record<string, Binding>;
  readonly camera: Camera;
  readonly interaction: Interaction;
  readonly selected_node_ids: readonly string[];
  readonly modifiers: Modifiers;
};
