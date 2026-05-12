export type NodeExecutionStatus = 'idle' | 'running' | 'completed' | 'error';

export type ExecutionNodeState = {
  readonly status: NodeExecutionStatus;
  readonly progress: number;
  readonly error?: string;
  readonly outputs: Record<string, unknown>;
};

export type ExecutionState = {
  readonly status: 'idle' | 'running' | 'paused' | 'error' | 'completed';
  readonly node_states: Record<string, ExecutionNodeState>;
  readonly execution_queue: readonly string[];
  readonly current_node_index: number;
};

export type ExecuteContext = {
  readonly node: import('../core/types').GraphNode;
  readonly inputs: Record<string, unknown>;
  readonly report_progress: (progress: number) => void;
};