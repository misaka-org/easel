import { vec2_create } from '@/core/math';
import { add_node } from '@/core/node_ops';

import type { Dispatch } from '@/runtime/registry';
import type { Easel } from '@/runtime/easel';

export const load_realtime_scene = (dispatch: Dispatch, easel: Easel) => {
  // 1. 4x Color Source nodes
  dispatch(s =>
    add_node(s, {
      id: 'c1',
      type: 'color_source',
      position: vec2_create(60, 40),
      size: vec2_create(180, 100),
      title: 'Color 1',
      inputs: [],
      outputs: [{ id: 'out', label: 'Color', type: 'output', value_type: 'text' }],
      widgets: [{ id: 'color', type: 'color', label: '', value: '#ff6b6b' }],
      custom_data: {},
    }),
  );
  dispatch(s =>
    add_node(s, {
      id: 'c2',
      type: 'color_source',
      position: vec2_create(60, 160),
      size: vec2_create(180, 100),
      title: 'Color 2',
      inputs: [],
      outputs: [{ id: 'out', label: 'Color', type: 'output', value_type: 'text' }],
      widgets: [{ id: 'color', type: 'color', label: '', value: '#4ecdc4' }],
      custom_data: {},
    }),
  );
  dispatch(s =>
    add_node(s, {
      id: 'c3',
      type: 'color_source',
      position: vec2_create(60, 280),
      size: vec2_create(180, 100),
      title: 'Color 3',
      inputs: [],
      outputs: [{ id: 'out', label: 'Color', type: 'output', value_type: 'text' }],
      widgets: [{ id: 'color', type: 'color', label: '', value: '#45b7d1' }],
      custom_data: {},
    }),
  );
  dispatch(s =>
    add_node(s, {
      id: 'c4',
      type: 'color_source',
      position: vec2_create(60, 400),
      size: vec2_create(180, 100),
      title: 'Color 4',
      inputs: [],
      outputs: [{ id: 'out', label: 'Color', type: 'output', value_type: 'text' }],
      widgets: [{ id: 'color', type: 'color', label: '', value: '#96ceb4' }],
      custom_data: {},
    }),
  );

  // 2. Input nodes for angle and gradient type (using default text_input node)
  dispatch(s =>
    add_node(s, {
      id: 'angle',
      type: 'text_input',
      position: vec2_create(60, 530),
      size: vec2_create(200, 90),
      title: 'Angle',
      inputs: [],
      outputs: [{ id: 'query', label: 'Angle', type: 'output', value_type: 'number' }],
      widgets: [
        {
          id: 'value',
          type: 'number',
          label: 'Angle',
          value: 45,
          min: 0,
          max: 360,
          value_type: 'number',
        },
      ],
      custom_data: { color: '#22c55e' },
    }),
  );
  dispatch(s =>
    add_node(s, {
      id: 'type_g',
      type: 'text_input',
      position: vec2_create(60, 640),
      size: vec2_create(200, 90),
      title: 'Gradient Type',
      inputs: [],
      outputs: [{ id: 'query', label: 'Type', type: 'output', value_type: 'text' }],
      widgets: [
        { id: 'value', type: 'text', label: 'linear/radial', value: 'linear', value_type: 'text' },
      ],
      custom_data: { color: '#22c55e' },
    }),
  );

  // 3. CSS Builder node
  dispatch(s =>
    add_node(s, {
      id: 'builder',
      type: 'css_builder',
      position: vec2_create(450, 160),
      size: vec2_create(220, 220),
      title: 'CSS Builder',
      inputs: [
        { id: 'c1', label: 'Color 1', type: 'input', value_type: 'text' },
        { id: 'c2', label: 'Color 2', type: 'input', value_type: 'text' },
        { id: 'c3', label: 'Color 3', type: 'input', value_type: 'text' },
        { id: 'c4', label: 'Color 4', type: 'input', value_type: 'text' },
        { id: 'angle', label: 'Angle', type: 'input', value_type: 'number' },
        { id: 'type_g', label: 'Type', type: 'input', value_type: 'text' },
      ],
      outputs: [{ id: 'css_out', label: 'CSS', type: 'output', value_type: 'text' }],
      custom_data: {},
    }),
  );

  // 4. CSS Preview node
  dispatch(s =>
    add_node(s, {
      id: 'preview',
      type: 'css_preview',
      position: vec2_create(780, 120),
      size: vec2_create(360, 300),
      title: 'CSS Preview',
      inputs: [{ id: 'css_in', label: 'CSS', type: 'input', value_type: 'text' }],
      outputs: [],
      resizable: true,
      custom_data: {},
    }),
  );

  // wires via plugin
  const api = easel.plugin_data.wire;
  if (!api) return;
  const mk_id = () => 'b_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  api.add_binding({ id: mk_id(), source_id: 'c1', source_handle: 'out', target_id: 'builder', target_handle: 'c1' });
  api.add_binding({ id: mk_id(), source_id: 'c2', source_handle: 'out', target_id: 'builder', target_handle: 'c2' });
  api.add_binding({ id: mk_id(), source_id: 'c3', source_handle: 'out', target_id: 'builder', target_handle: 'c3' });
  api.add_binding({ id: mk_id(), source_id: 'c4', source_handle: 'out', target_id: 'builder', target_handle: 'c4' });
  api.add_binding({ id: mk_id(), source_id: 'angle', source_handle: 'query', target_id: 'builder', target_handle: 'angle' });
  api.add_binding({ id: mk_id(), source_id: 'type_g', source_handle: 'query', target_id: 'builder', target_handle: 'type_g' });
  api.add_binding({ id: mk_id(), source_id: 'builder', source_handle: 'css_out', target_id: 'preview', target_handle: 'css_in' });
};
