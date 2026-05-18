import { vec2_create } from '@/core/math';
import { add_node } from '@/core/node_ops';
import { add_binding } from '@/core/binding_ops';
import { create_data_flow_binding } from '@/core/types';
import type { Dispatch } from '@/runtime/registry';

export const load_ip_api_scene = (dispatch: Dispatch) => {
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

  // Wire the graph: TextInput → IpApi → TextView
  dispatch(s =>
    add_binding(s, create_data_flow_binding('input1', 'query', 'api1', 'query')),
  );

  dispatch(s =>
    add_binding(s, create_data_flow_binding('api1', 'result', 'view1', 'content')),
  );
};
