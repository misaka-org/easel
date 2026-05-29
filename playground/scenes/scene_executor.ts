import { vec2_create } from '@/core/math';
import { add_node } from '@/core/node_ops';
import type { Dispatch } from '@/runtime/store';
import type { Easel } from '@/runtime/easel';

export const load_executor_scene = (dispatch: Dispatch, easel: Easel) => {
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

  // 连线通过 wire 插件创建
  const api = easel.plugin_data.wire;
  if (!api) return;
  const mk_id = () => `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  api.add_binding({ id: mk_id(), source_id: 'n1', source_handle: 'out', target_id: 'n2', target_handle: 'prompt' });
  api.add_binding({ id: mk_id(), source_id: 'n1', source_handle: 'out', target_id: 'n3', target_handle: 'prompt' });
  api.add_binding({ id: mk_id(), source_id: 'n2', source_handle: 'out_list', target_id: 'n4', target_handle: 'prompt' });
  api.add_binding({ id: mk_id(), source_id: 'n3', source_handle: 'out_list', target_id: 'n4', target_handle: 'ref' });
};
