import { vec2_create } from '../core/math';
import { add_node } from '../core/node_ops';
import type { Dispatch } from '../runtime/registry';

export const load_perf_scene = (dispatch: Dispatch) => {
  const cols = 30;
  const rows = 30;
  
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      dispatch((s) => add_node(s, {
        id: `perf_${x}_${y}`,
        type: 'default',
        position: vec2_create(x * 220, y * 150),
        size: vec2_create(180, 100),
        title: `Node ${x},${y}`,
        inputs: [{ id: 'in', label: 'In', type: 'input' }],
        outputs: [{ id: 'out', label: 'Out', type: 'output' }],
        widgets: [{ id: 'val', type: 'number', label: 'Val', value: x + y }],
        custom_data: {}
      }));
    }
  }
};