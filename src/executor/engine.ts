import { ref, type Ref } from '@vue/reactivity';
import type { Easel } from '@/runtime/easel';
import type { GraphNode } from '@/core/types';
import * as E from 'fp-ts/Either';
import type { ExecutionState, ExecutionNodeState } from './types';

export const create_initial_execution_state = (): ExecutionState => ({
  status: 'idle',
  node_states: {},
  ready_queue: [],
  running_nodes: [],
  in_degrees: {},
  adj: {}
});

export class GraphExecutor {
  state: Ref<ExecutionState>;
  easel: Easel;
  private abort_controller: AbortController | null = null;

  constructor(easel: Easel) {
    this.easel = easel;
    this.state = ref(create_initial_execution_state());
  }

  compile(): E.Either<Error, void> {
    const nodes = this.easel.state.value.nodes;
    const wires = Object.values(this.easel.state.value.wires);
    
    const in_degrees: Record<string, number> = {};
    const adj: Record<string, string[]> = {};
    const missing_reqs: Record<string, string> = {};

    for (const id of Object.keys(nodes)) {
      in_degrees[id] = 0;
      adj[id] = [];
      const req_err = this.check_requirements(nodes[id], wires);
      if (req_err) missing_reqs[id] = req_err;
    }

    for (const wire of wires) {
      if (nodes[wire.source_node_id] && nodes[wire.target_node_id]) {
        in_degrees[wire.target_node_id]++;
        adj[wire.source_node_id].push(wire.target_node_id);
      }
    }

    const node_states: Record<string, ExecutionNodeState> = {};
    const ready_queue: string[] = [];

    for (const id of Object.keys(nodes)) {
      if (missing_reqs[id]) {
        node_states[id] = { status: 'error', progress: 0, error: missing_reqs[id], outputs: {} };
      } else {
        node_states[id] = { status: 'idle', progress: 0, outputs: {} };
        if (in_degrees[id] === 0) {
          ready_queue.push(id);
        }
      }
    }

    this.state.value = {
      status: 'idle',
      node_states,
      in_degrees,
      adj,
      ready_queue,
      running_nodes: []
    };

    return E.right(undefined);
  }

  private check_requirements(node: GraphNode, wires: any[]): string | null {
    for (const port of node.inputs) {
      if (port.required) {
        const has_wire = wires.some(w => w.target_node_id === node.id && w.target_port_id === port.id);
        if (!has_wire) return `Missing required input: ${port.label}`;
      }
    }
    for (const widget of node.widgets || []) {
      if (widget.required) {
        if (widget.value === undefined || widget.value === null || widget.value === '') {
          return `Missing required widget: ${widget.label}`;
        }
      }
    }
    return null;
  }

  async run() {
    if (this.state.value.status === 'running') return;
    if (this.state.value.status === 'idle' || this.state.value.status === 'stopped' || this.state.value.status === 'completed') {
      const res = this.compile();
      if (E.isLeft(res)) return;
    }

    this.abort_controller = new AbortController();
    this.state.value = { ...this.state.value, status: 'running' };
    this.trigger_execution();
  }

  stop() {
    if (this.abort_controller) {
      this.abort_controller.abort();
    }
    this.state.value = { ...this.state.value, status: 'stopped' };
  }

  async step() {
    if (this.state.value.status === 'idle' || this.state.value.status === 'stopped' || this.state.value.status === 'completed') {
      this.compile();
    }
    this.state.value = { ...this.state.value, status: 'paused' };
    
    const next_id = this.state.value.ready_queue[0];
    if (next_id) {
      this.state.value = {
        ...this.state.value,
        ready_queue: this.state.value.ready_queue.slice(1),
        running_nodes: [...this.state.value.running_nodes, next_id]
      };
      await this.execute_node(next_id);
    }
  }

  private trigger_execution() {
    if (this.state.value.status !== 'running') return;
    
    const ready = [...this.state.value.ready_queue];
    if (ready.length > 0) {
      this.state.value = {
        ...this.state.value,
        ready_queue: [],
        running_nodes: [...this.state.value.running_nodes, ...ready]
      };

      ready.forEach(id => {
        this.execute_node(id).then(() => {
          this.trigger_execution();
        });
      });
    } else {
      this.check_completion();
    }
  }

  private check_completion() {
    if (this.state.value.running_nodes.length === 0 && this.state.value.ready_queue.length === 0) {
      if (this.state.value.status === 'running') {
        this.state.value = { ...this.state.value, status: 'completed' };
      }
    }
  }

  private update_node_state(id: string, update: Partial<ExecutionNodeState>) {
    this.state.value = {
      ...this.state.value,
      node_states: {
        ...this.state.value.node_states,
        [id]: { ...this.state.value.node_states[id]!, ...update }
      }
    };
  }

  private gather_inputs(node_id: string): Record<string, unknown> {
    const inputs: Record<string, unknown> = {};
    const node = this.easel.state.value.nodes[node_id];
    const wires = Object.values(this.easel.state.value.wires);
    
    if (node?.widgets) {
      for (const w of node.widgets) inputs[w.id] = w.value;
    }

    for (const wire of wires) {
      if (wire.target_node_id === node_id) {
        const source_state = this.state.value.node_states[wire.source_node_id];
        if (source_state?.outputs && wire.source_port_id in source_state.outputs) {
          inputs[wire.target_port_id] = source_state.outputs[wire.source_port_id];
        }
      }
    }
    return inputs;
  }

  private async execute_node(id: string) {
    if (this.abort_controller?.signal.aborted) return;

    this.update_node_state(id, { status: 'running', progress: 0 });

    const inst = this.easel.get_node_instance(id);

    try {
      let outputs: Record<string, unknown> = {};
      if (inst && typeof inst.execute === 'function') {
        const node = this.easel.state.value.nodes[id];
        const inputs = this.gather_inputs(id);
        outputs = await inst.execute({
          node: node!,
          inputs,
          report_progress: (progress) => {
            if (!this.abort_controller?.signal.aborted) {
              this.update_node_state(id, { progress });
            }
          },
          signal: this.abort_controller!.signal
        });
      } else {
        outputs = {};
      }

      if (this.abort_controller?.signal.aborted) return;

      this.update_node_state(id, { status: 'completed', progress: 100, outputs });
      this.finish_node(id);
    } catch (e) {
      if (this.abort_controller?.signal.aborted) return;
      this.update_node_state(id, { status: 'error', progress: 0, error: e instanceof Error ? e.message : String(e) });
      this.finish_node(id, true);
    }
  }

  private finish_node(id: string, is_error = false) {
    let new_ready: string[] = [];
    const new_in_degrees = { ...this.state.value.in_degrees };

    if (!is_error) {
      const targets = this.state.value.adj[id] || [];
      for (const target of targets) {
        new_in_degrees[target]--;
        if (new_in_degrees[target] === 0) {
          if (this.state.value.node_states[target]?.status !== 'error') {
            new_ready.push(target);
          }
        }
      }
    }

    this.state.value = {
      ...this.state.value,
      in_degrees: new_in_degrees,
      running_nodes: this.state.value.running_nodes.filter(n => n !== id),
      ready_queue: [...this.state.value.ready_queue, ...new_ready]
    };
  }
}