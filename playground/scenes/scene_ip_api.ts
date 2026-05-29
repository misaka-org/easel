import { vec2_create } from '@/core/math';
import { add_node } from '@/core/node_ops';
import type { Dispatch } from '@/runtime/registry';
import type { Easel } from '@/runtime/easel';

export const load_ip_api_scene = (dispatch: Dispatch, easel: Easel) => {
  // Text input node (provides the IP query)
  dispatch(s =>
    add_node(s, {
      id: 'input1',
      type: 'text_input',
      position: vec2_create(100, 100),
      size: vec2_create(220, 100),
      title: 'IP / Domain',
      inputs: [],
      outputs: [{ id: 'query', label: 'Query', type: 'output', value_type: 'text' }],
      widgets: [
        { id: 'value', type: 'text', label: 'Value', value: '8.8.8.8', value_type: 'text' },
      ],
      custom_data: { color: '#22c55e' },
    }),
  );

  // IP Geolocation API node (executes the HTTP request)
  dispatch(s =>
    add_node(s, {
      id: 'api1',
      type: 'ip_api',
      position: vec2_create(400, 100),
      size: vec2_create(280, 100),
      title: 'IP Geolocation',
      inputs: [{ id: 'query', label: 'Query', type: 'input', value_type: 'text' }],
      outputs: [
        { id: 'result', label: 'Result', type: 'output', value_type: 'object' },
        { id: 'country', label: 'Country', type: 'output', value_type: 'text' },
        { id: 'city', label: 'City', type: 'output', value_type: 'text' },
        { id: 'isp', label: 'ISP', type: 'output', value_type: 'text' },
        { id: 'lat', label: 'Lat', type: 'output', value_type: 'number' },
        { id: 'lon', label: 'Lon', type: 'output', value_type: 'number' },
        { id: 'query_ip', label: 'Queried', type: 'output', value_type: 'text' },
      ],
      custom_data: { color: '#06b6d4' },
    }),
  );

  // Text view node (displays the result)
  dispatch(s =>
    add_node(s, {
      id: 'view1',
      type: 'text_view',
      position: vec2_create(760, 100),
      size: vec2_create(360, 300),
      title: 'Result',
      inputs: [{ id: 'content', label: 'Content', type: 'input', value_type: 'text' }],
      outputs: [],
      custom_data: { color: '#a855f7' },
    }),
  );

  // wires via plugin
  const api = easel.plugin_data.wire;
  if (!api) return;
  const mk_id = () => 'b_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  api.add_binding({ id: mk_id(), source_id: 'input1', source_handle: 'query', target_id: 'api1', target_handle: 'query' });
  api.add_binding({ id: mk_id(), source_id: 'api1', source_handle: 'result', target_id: 'view1', target_handle: 'content' });
};