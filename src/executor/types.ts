export type NodeExecutionStatus = 'idle' | 'running' | 'completed' | 'error';

export type ExecutionNodeState = {
  readonly status: NodeExecutionStatus;
  readonly progress: number;
  readonly error?: string;
  readonly outputs: Record<string, unknown>;
};

export type ExecutionState = {
  readonly status: 'idle' | 'running' | 'paused' | 'error' | 'completed' | 'stopped';
  readonly node_states: Record<string, ExecutionNodeState>;
  readonly ready_queue: readonly string[];
  readonly running_nodes: readonly string[];
  readonly in_degrees: Record<string, number>;
  readonly adj: Record<string, string[]>;
};