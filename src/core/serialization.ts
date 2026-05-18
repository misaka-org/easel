import type { State } from './types';
import { create_initial_state } from './state';

export const serialize_state = (state: State): string => {
  // 我们不需要序列化 interaction，因为它是临时状态
  const export_data = {
    nodes: state.nodes,
    wires: state.wires,
    bindings: state.bindings,
    camera: state.camera,
  };
  return JSON.stringify(export_data, null, 2);
};

export const deserialize_state = (json: string): State => {
  try {
    const data = JSON.parse(json);
    return {
      ...create_initial_state(),
      nodes: data.nodes || {},
      wires: data.wires || {},
      bindings: data.bindings || {},
      camera: data.camera || { position: { x: 0, y: 0 }, zoom: 1 },
    };
  } catch (e) {
    console.error('Failed to deserialize state', e);
    return create_initial_state();
  }
};
