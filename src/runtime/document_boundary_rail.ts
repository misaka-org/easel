import type { GraphNode, Port } from '@/core/types';

export type BoundaryRailDirection = 'input' | 'output';

export const document_boundary_add_port_id = '__easel_boundary_add__';
export const document_boundary_rail_class = 'easel-boundary-rail';
export const document_boundary_input_class = 'easel-boundary-input';
export const document_boundary_output_class = 'easel-boundary-output';

export const boundary_rail_width = 180;
export const boundary_rail_header_height = 28;
export const boundary_rail_body_pad_x = 10;
export const boundary_rail_body_pad_y = 8;
export const boundary_rail_row_height = 24;
export const boundary_rail_row_gap = 4;
export const boundary_rail_dot_size = 8;
export const boundary_rail_min_height = 80;

export const get_boundary_rail_direction = (node: GraphNode): BoundaryRailDirection | undefined => {
  const direction = node.custom_data?.['boundary_direction'];
  return direction === 'input' || direction === 'output' ? direction : undefined;
};

export const is_document_boundary_rail = (node: GraphNode): boolean => {
  return (
    node.custom_data?.['view_only'] === true &&
    (node.type === 'subgraph_input' || node.type === 'subgraph_output') &&
    get_boundary_rail_direction(node) !== undefined
  );
};

export const get_boundary_rail_ports = (
  node: GraphNode,
  direction: BoundaryRailDirection,
): readonly Port[] => {
  return direction === 'input' ? node.outputs : node.inputs;
};

export const calc_boundary_rail_height = (slot_count: number): number => {
  const row_count = Math.max(1, slot_count + 1);
  const list_height =
    boundary_rail_body_pad_y * 2 +
    row_count * boundary_rail_row_height +
    Math.max(0, row_count - 1) * boundary_rail_row_gap;
  return Math.max(boundary_rail_min_height, boundary_rail_header_height + list_height);
};

export const calc_boundary_rail_port_center = (
  node: GraphNode,
  port_id: string,
): { x: number; y: number } | undefined => {
  const direction = get_boundary_rail_direction(node);
  if (direction === undefined) {
    return undefined;
  }
  const ports = get_boundary_rail_ports(node, direction);
  const index = ports.findIndex(port => port.id === port_id);
  if (index === -1) {
    return undefined;
  }
  const y =
    boundary_rail_header_height +
    boundary_rail_body_pad_y +
    index * (boundary_rail_row_height + boundary_rail_row_gap) +
    boundary_rail_row_height / 2;
  const x =
    direction === 'input'
      ? Math.max(0, node.size.x - boundary_rail_body_pad_x - boundary_rail_dot_size / 2)
      : boundary_rail_body_pad_x + boundary_rail_dot_size / 2;
  return { x, y };
};
