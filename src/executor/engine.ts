import * as E from 'fp-ts/Either';
import * as T from 'fp-ts/Task';
import { pipe } from 'fp-ts/function';
import type { ExecutionState, ExecutionNodeState } from './types';
import type { GraphNode, Wire } from '@/core/types';
import { topological_sort } from './scheduler';
import { get_execute_fn } from './registry';

export const create_initial_execution_state = (): ExecutionState => ({
  status: 'idle',
  node_states: {},
  execution_queue: [],
  current_node_index: 0,
});

export const init_execution = (nodes: Record<string, GraphNode>, wires: Record<string, Wire>): E.Either<Error, ExecutionState> =>
  pipe(
    topological_sort(nodes, wires),
    E.map((queue) => ({
      status: 'idle',
      node_states: {},
      execution_queue: queue,
      current_node_index: 0,
    }))
  );

export const gather_inputs = (
  node_id: string,
  nodes: Record<string, GraphNode>,
  wires: Record<string, Wire>,
  node_states: Record<string, ExecutionNodeState>
): Record<string, unknown> => {
  const inputs: Record<string, unknown> = {};
  
  const node = nodes[node_id];
  if (node && node.widgets) {
    for (const widget of node.widgets) {
      inputs[widget.id] = widget.value;
    }
  }

  for (const wire of Object.values(wires)) {
    if (wire.target_node_id === node_id) {
      const source_state = node_states[wire.source_node_id];
      if (source_state && source_state.outputs && wire.source_port_id in source_state.outputs) {
        inputs[wire.target_port_id] = source_state.outputs[wire.source_port_id];
      }
    }
  }
  return inputs;
};

export const step_execution = (
  exec_state: ExecutionState,
  nodes: Record<string, GraphNode>,
  wires: Record<string, Wire>,
  on_state_change: (state: ExecutionState) => void
): T.Task<ExecutionState> => {
  return async () => {
    if (exec_state.status === 'completed' || exec_state.status === 'error') {
      return exec_state;
    }

    const node_id = exec_state.execution_queue[exec_state.current_node_index];
    if (!node_id) {
      const final_state: ExecutionState = { ...exec_state, status: 'completed' };
      on_state_change(final_state);
      return final_state;
    }

    const node = nodes[node_id];
    if (!node) {
      const err_state: ExecutionState = {
        ...exec_state,
        status: 'error',
        node_states: {
          ...exec_state.node_states,
          [node_id]: { status: 'error', progress: 0, error: 'Node not found', outputs: {} }
        }
      };
      on_state_change(err_state);
      return err_state;
    }

    const execute_fn = get_execute_fn(node.type);
    
    let running_state: ExecutionState = {
      ...exec_state,
      node_states: {
        ...exec_state.node_states,
        [node_id]: { status: 'running', progress: 0, outputs: {} }
      }
    };
    on_state_change(running_state);

    if (!execute_fn) {
      const next_index = exec_state.current_node_index + 1;
      const skip_state: ExecutionState = {
        ...running_state,
        node_states: {
          ...running_state.node_states,
          [node_id]: { status: 'completed', progress: 100, outputs: {} }
        },
        current_node_index: next_index,
        status: next_index >= exec_state.execution_queue.length ? 'completed' : exec_state.status
      };
      on_state_change(skip_state);
      return skip_state;
    }

    const inputs = gather_inputs(node_id, nodes, wires, running_state.node_states);

    try {
      const outputs = await execute_fn({
        node,
        inputs,
        report_progress: (progress) => {
          running_state = {
            ...running_state,
            node_states: {
              ...running_state.node_states,
              [node_id]: { ...running_state.node_states[node_id], status: 'running', progress }
            }
          };
          on_state_change(running_state);
        }
      });

      const next_index = running_state.current_node_index + 1;
      const complete_state: ExecutionState = {
        ...running_state,
        node_states: {
          ...running_state.node_states,
          [node_id]: { status: 'completed', progress: 100, outputs }
        },
        current_node_index: next_index,
        status: next_index >= running_state.execution_queue.length ? 'completed' : exec_state.status
      };
      on_state_change(complete_state);
      return complete_state;

    } catch (err) {
      const err_msg = err instanceof Error ? err.message : String(err);
      const error_state: ExecutionState = {
        ...running_state,
        status: 'error',
        node_states: {
          ...running_state.node_states,
          [node_id]: { status: 'error', progress: 0, error: err_msg, outputs: {} }
        }
      };
      on_state_change(error_state);
      return error_state;
    }
  };
};

export const run_execution = (
  initial_exec_state: ExecutionState,
  nodes: Record<string, GraphNode>,
  wires: Record<string, Wire>,
  on_state_change: (state: ExecutionState) => void
): T.Task<ExecutionState> => {
  return async () => {
    let current = initial_exec_state;
    if (current.status === 'idle' || current.status === 'paused') {
      current = { ...current, status: 'running' };
      on_state_change(current);
    }

    while (current.status === 'running') {
      const step_task = step_execution(current, nodes, wires, (s) => {
        current = s;
        on_state_change(current);
      });
      
      current = await step_task();
      
      if (current.status === 'error' || current.status === 'completed' || current.status === 'paused') {
        break;
      }
    }
    
    return current;
  };
};