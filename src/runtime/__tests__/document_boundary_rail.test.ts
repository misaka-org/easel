import { describe, expect, it } from 'vitest';
import type { GraphNode, Port } from '@/core/types';
import {
  boundary_rail_body_pad_x,
  boundary_rail_dot_size,
  boundary_rail_header_height,
  boundary_rail_min_height,
  boundary_rail_width,
  calc_boundary_rail_height,
  calc_boundary_rail_port_center,
  document_boundary_add_port_id,
  is_document_boundary_rail,
} from '@/runtime/document_boundary_rail';

const port = (id: string, type: 'input' | 'output', label: string = id): Port => {
  return { id, label, type, value_type: 'text' };
};

const make_rail = (
  type: 'subgraph_input' | 'subgraph_output',
  direction: 'input' | 'output',
  ports: readonly Port[],
): GraphNode => {
  return {
    id: 'rail',
    type,
    position: { x: 0, y: 0 },
    size: { x: boundary_rail_width, y: calc_boundary_rail_height(1) },
    title: 'Rail',
    inputs: direction === 'input' ? [] : ports,
    outputs: direction === 'input' ? ports : [],
    custom_data: { boundary_direction: direction, view_only: true },
  };
};

describe('document boundary rail layout', () => {
  it('treats only view-only subgraph rails as boundary rails', () => {
    const node = make_rail('subgraph_input', 'input', []);
    expect(is_document_boundary_rail(node)).toBe(true);
    expect(
      is_document_boundary_rail({
        ...node,
        custom_data: { ...node.custom_data, view_only: false },
      }),
    ).toBe(false);
  });

  it('positions input dots on the right and output dots on the left', () => {
    const add_output: Port = { id: document_boundary_add_port_id, label: 'Add', type: 'output' };
    const input_rail = make_rail('subgraph_input', 'input', [
      port('prompt', 'output', 'Prompt'),
      add_output,
    ]);
    const add_input: Port = { id: document_boundary_add_port_id, label: 'Add', type: 'input' };
    const output_rail = make_rail('subgraph_output', 'output', [
      port('result', 'input', 'Result'),
      add_input,
    ]);

    const input_slot = calc_boundary_rail_port_center(input_rail, 'prompt');
    const input_add = calc_boundary_rail_port_center(input_rail, document_boundary_add_port_id);
    const output_slot = calc_boundary_rail_port_center(output_rail, 'result');
    const output_add = calc_boundary_rail_port_center(output_rail, document_boundary_add_port_id);

    expect(input_slot?.x).toBe(
      boundary_rail_width - boundary_rail_body_pad_x - boundary_rail_dot_size / 2,
    );
    expect(input_add?.x).toBe(input_slot?.x);
    expect(output_slot?.x).toBe(boundary_rail_body_pad_x + boundary_rail_dot_size / 2);
    expect(output_add?.x).toBe(output_slot?.x);
    expect(input_add?.y).toBeGreaterThan(input_slot?.y ?? Number.POSITIVE_INFINITY);
    expect(output_add?.y).toBeGreaterThan(output_slot?.y ?? Number.POSITIVE_INFINITY);
  });

  it('reserves header and a minimum height so empty rails remain wireable', () => {
    expect(calc_boundary_rail_height(0)).toBe(boundary_rail_min_height);
    expect(calc_boundary_rail_height(2)).toBeGreaterThan(boundary_rail_header_height);
    expect(calc_boundary_rail_height(2)).toBeGreaterThan(calc_boundary_rail_height(1));
  });

  it('returns undefined when the requested port is not on the rail', () => {
    const node = make_rail('subgraph_input', 'input', []);
    expect(calc_boundary_rail_port_center(node, 'missing')).toBeUndefined();
  });
});
