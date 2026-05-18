import { vec2_create } from '@/core/math';
import { add_node } from '@/core/node_ops';
import { add_binding } from '@/core/binding_ops';
import { create_data_flow_binding } from '@/core/types';
import type { Dispatch } from '@/runtime/registry';

export const load_executor_scene = (dispatch: Dispatch) => {
  dispatch(s =>
    add_node(s, {
      id: 'n1',
      type: 'default',
      position: vec2_create(100, 100),
      size: vec2_create(150, 100),
      title: 'Start',
      inputs: [],
      outputs: [{ id: 'out', label: 'Out', type: 'output', value_type: 'number' }],
      widgets: [{ id: 'val', type: 'number', label: 'Val', value: 10, value_type: 'number' }],
      custom_data: {},
    }),
  );

  dispatch(s =>
    add_node(s, {
      id: 'n2',
      type: 'text_generation',
      position: vec2_create(350, 100),
      size: vec2_create(200, 120),
      title: 'Text Gen 1',
      inputs: [{ id: 'prompt', label: 'Prompt', type: 'input', value_type: 'text' }],
      outputs: [{ id: 'out_list', label: 'Result', type: 'output', value_type: 'text' }],
      custom_data: { color: '#3b82f6' },
    }),
  );

  dispatch(s =>
    add_node(s, {
      id: 'n3',
      type: 'text_generation',
      position: vec2_create(350, 250),
      size: vec2_create(200, 120),
      title: 'Text Gen 2',
      inputs: [{ id: 'prompt', label: 'Prompt', type: 'input', value_type: 'text' }],
      outputs: [{ id: 'out_list', label: 'Result', type: 'output', value_type: 'text' }],
      custom_data: { color: '#3b82f6' },
    }),
  );

  dispatch(s =>
    add_node(s, {
      id: 'n4',
      type: 'image_generation',
      position: vec2_create(650, 150),
      size: vec2_create(200, 150),
      title: 'Image Gen',
      inputs: [
        { id: 'prompt', label: 'Prompt', type: 'input', value_type: 'text' },
        { id: 'ref', label: 'Reference', type: 'input', value_type: 'text' },
      ],
      outputs: [{ id: 'out_img', label: 'Image', type: 'output', value_type: 'image' }],
      custom_data: { color: '#10b981' },
    }),
  );

  dispatch(s =>
    add_binding(s, create_data_flow_binding('n1', 'out', 'n2', 'prompt')),
  );
  dispatch(s =>
    add_binding(s, create_data_flow_binding('n1', 'out', 'n3', 'prompt')),
  );
  dispatch(s =>
    add_binding(s, create_data_flow_binding('n2', 'out_list', 'n4', 'prompt')),
  );
  dispatch(s =>
    add_binding(s, create_data_flow_binding('n3', 'out_list', 'n4', 'ref')),
  );
};
