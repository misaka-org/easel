import type { Dispatch } from '@/runtime/registry';
import { add_node } from '@/core/node_ops';
import { vec2_create } from '@/core/math';

export function load_context_menu_scene(dispatch: Dispatch) {
  // Counter node (ns: ["鏁板€?]) 鈥?right-click to see custom items
  dispatch(s =>
    add_node(s, {
      id: 'counter_1',
      type: 'counter',
      position: vec2_create(100, 100),
      size: vec2_create(160, 120),
      title: 'Counter',
      inputs: [],
      outputs: [{ id: 'val', label: 'Value', type: 'output', value_type: 'number' }],
      widgets: [{ id: 'value', type: 'number', label: 'Value', value: 0, value_type: 'number' }],
      custom_data: {},
      resizable: false,
    }),
  );

  // Another counter (ns: ["鏁板€?])
  dispatch(s =>
    add_node(s, {
      id: 'counter_2',
      type: 'counter',
      position: vec2_create(400, 100),
      size: vec2_create(160, 120),
      title: 'Counter 2',
      inputs: [],
      outputs: [{ id: 'val', label: 'Value', type: 'output', value_type: 'number' }],
      widgets: [{ id: 'value', type: 'number', label: 'Value', value: 100, value_type: 'number' }],
      custom_data: {},
      resizable: false,
    }),
  );

  // Text input (ns: ["杈撳叆"]) 鈥?right-click to see plugin items
  dispatch(s =>
    add_node(s, {
      id: 'input_1',
      type: 'text_input',
      position: vec2_create(100, 300),
      size: vec2_create(200, 100),
      title: 'Text Input',
      inputs: [],
      outputs: [{ id: 'query', label: 'Query', type: 'output', value_type: 'text' }],
      widgets: [{ id: 'value', type: 'text', label: 'Value', value: '', value_type: 'text' }],
      custom_data: { color: '#22c55e' },
      resizable: false,
    }),
  );

  // Image generation (ns: ["鐢熸垚", "鍥惧儚"]) 鈥?multi-level ns demo
  dispatch(s =>
    add_node(s, {
      id: 'img_gen_1',
      type: 'image_generation',
      position: vec2_create(400, 300),
      size: vec2_create(200, 140),
      title: 'Image Gen',
      inputs: [{ id: 'prompt', label: '[ ] Prompt', type: 'input', value_type: 'image' }],
      outputs: [{ id: 'out_img', label: 'Image [ ]', type: 'output', value_type: 'image' }],
      widgets: [
        { id: 'model', type: 'text', label: 'Model', value: 'Flux Dev', value_type: 'text' },
      ],
      custom_data: { color: '#10b981' },
    }),
  );

  // Text generation (ns: ["鐢熸垚", "鏂囨湰"]) 鈥?same top "鐢熸垚", diff sub
  dispatch(s =>
    add_node(s, {
      id: 'txt_gen_1',
      type: 'text_generation',
      position: vec2_create(100, 300),
      size: vec2_create(200, 140),
      title: 'Text Gen',
      inputs: [
        { id: 'prompt', label: 'Prompt', type: 'input', value_type: 'text', required: true },
      ],
      outputs: [{ id: 'out_list', label: 'List [ ]', type: 'output', value_type: 'text' }],
      widgets: [
        { id: 'min_len', type: 'number', label: 'Min length', value: 6, value_type: 'number' },
        { id: 'max_len', type: 'number', label: 'Max length', value: 8, value_type: 'number' },
      ],
      custom_data: { color: '#3b82f6' },
    }),
  );

  // IP Geolocation (ns: ["缃戠粶"])
  dispatch(s =>
    add_node(s, {
      id: 'ip_api_1',
      type: 'ip_api',
      position: vec2_create(400, 500),
      size: vec2_create(200, 160),
      title: 'IP Geolocation',
      inputs: [{ id: 'query', label: 'Query', type: 'input', value_type: 'text' }],
      outputs: [
        { id: 'result', label: 'Result', type: 'output', value_type: 'object' },
        { id: 'country', label: 'Country', type: 'output', value_type: 'text' },
      ],
      custom_data: { color: '#06b6d4' },
    }),
  );

  // Image preview (ns: ["棰勮"])
  dispatch(s =>
    add_node(s, {
      id: 'preview_1',
      type: 'image_preview',
      position: vec2_create(700, 100),
      size: vec2_create(320, 360),
      title: 'Preview',
      inputs: [{ id: 'in_1', label: 'Image', type: 'input' }],
      outputs: [],
      custom_data: { url: 'https://picsum.photos/320/360' },
    }),
  );

  // Default node (no ns 鈥?appears under "Other")
  dispatch(s =>
    add_node(s, {
      id: 'default_1',
      type: 'default',
      position: vec2_create(700, 500),
      size: vec2_create(180, 100),
      title: 'Default (No NS)',
      inputs: [],
      outputs: [{ id: 'out_1', label: 'Image', type: 'output', value_type: 'image' }],
      widgets: [{ id: 'seed', type: 'number', label: 'Seed', value: 42, value_type: 'number' }],
      custom_data: {},
    }),
  );

  console.log(
    '[ContextMenu Demo] Right-click canvas 鈫?Add Node to see ns-organized submenus. Right-click a node for icons + info label.',
  );
}
