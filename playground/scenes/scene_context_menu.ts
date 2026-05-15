import type { Dispatch } from '@/runtime/registry';
import { add_node } from '@/core/node_ops';
import { vec2_create } from '@/core/math';

export function load_context_menu_scene(dispatch: Dispatch) {
  // A Counter node — right-click to see its custom items
  dispatch(s => add_node(s, {
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
  }));

  // Another counter to show per-node independent state
  dispatch(s => add_node(s, {
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
  }));

  // A text_input node — right-click to see plugin-added items
  dispatch(s => add_node(s, {
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
  }));
}
