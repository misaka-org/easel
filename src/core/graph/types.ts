import type { GraphNode, Port } from '../types';

export type GraphId = string;
export type NodeId = string;
export type BindingId = string;
export type BoundaryId = string;
export type GraphKind = 'root' | 'subgraph';

/** 图边界槽。输入输出分别放在 GraphScope 的两个列表中。 */
export type GraphSlot = Pick<Port, 'id' | 'label' | 'value_type' | 'accepts' | 'required'>;

export type GraphScope = {
  readonly id: GraphId;
  readonly kind: GraphKind;
  readonly parent_graph_id?: GraphId;
  readonly title: string;
  readonly input_slots: readonly GraphSlot[];
  readonly output_slots: readonly GraphSlot[];
};

export type GraphNodeRecord = GraphNode & {
  readonly graph_id: GraphId;
  readonly nested_graph_id?: GraphId;
};

export type GraphBindingRecord = {
  readonly id: BindingId;
  readonly graph_id: GraphId;
  readonly source_id: NodeId;
  readonly source_handle: string;
  readonly target_id: NodeId;
  readonly target_handle: string;
};

export type GraphBoundaryBinding = {
  readonly id: BoundaryId;
  readonly graph_id: GraphId;
  readonly direction: 'input' | 'output';
  readonly slot_id: string;
  readonly node_id: NodeId;
  readonly port_id: string;
};

export type GraphDocument = {
  readonly format_version: number;
  readonly root_graph_id: GraphId;
  readonly graphs: Readonly<Record<GraphId, GraphScope>>;
  readonly nodes: Readonly<Record<NodeId, GraphNodeRecord>>;
  readonly bindings: Readonly<Record<BindingId, GraphBindingRecord>>;
  readonly boundary_bindings: Readonly<Record<BoundaryId, GraphBoundaryBinding>>;
};
