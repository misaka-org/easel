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

export type Widget = {
  readonly id: string;
  readonly type: 'text' | 'number' | 'boolean';
  readonly label: string;
  readonly value: WidgetValue;
  readonly min?: number;
  readonly max?: number;
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

export type Camera = {
  readonly position: Vec2;
  readonly zoom: number;
};

export type Interaction =
  | { readonly mode: 'idle' }
  | { readonly mode: 'dragging'; readonly node_ids: readonly string[]; readonly start_pos: Vec2; readonly original_nodes: Record<string, GraphNode> }
  | { readonly mode: 'resizing'; readonly node_id: string; readonly start_pos: Vec2; readonly start_size: Vec2 }
  | { readonly mode: 'panning'; readonly start_pos: Vec2; readonly original_camera: Vec2 }
  | { readonly mode: 'wiring'; readonly source_node_id: string; readonly source_port_id: string; readonly target_pos: Vec2 }
  | { readonly mode: 'box_selecting'; readonly start_pos: Vec2; readonly current_pos: Vec2 };

export type GraphState = {
  readonly nodes: Record<string, GraphNode>;
  readonly wires: Record<string, Wire>;
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
  readonly camera: Camera;
  readonly interaction: Interaction;
  readonly selected_node_ids: readonly string[];
  readonly modifiers: Modifiers;
};