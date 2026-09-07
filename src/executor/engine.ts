import { ref, type Ref } from '@vue/reactivity';
import type { Easel } from '@/runtime/easel';
import type { GraphNode } from '@/core/types';
import { is_node_muted, muted_node_outputs } from '@/core/node_ops';
import * as E from 'fp-ts/Either';
import type { ExecutionState, ExecutionNodeState, WireBindingRef } from './types';

export const create_initial_execution_state = (): ExecutionState => ({
  status: 'idle',
  node_states: {},
  ready_queue: [],
  running_nodes: [],
  in_degrees: {},
  adj: {},
});

export class GraphExecutor {
  state: Ref<ExecutionState>;
  easel: Easel;
  private abort_controller: AbortController | null = null;
  realtime: Ref<boolean>;
  private realtime_debounce_timer: ReturnType<typeof setTimeout> | null = null;
  // LRU eviction threshold — set to 0 to disable caching.
  max_cache_size = 200;
  // Persists across compilations 閳?caches outputs keyed by (node_id, inputs_fingerprint)
  private input_cache = new Map<
    string,
    { fingerprint: string; outputs: Record<string, unknown> }
  >();

  constructor(easel: Easel) {
    this.easel = easel;
    this.state = ref(create_initial_execution_state());
    this.realtime = ref(false);
  }

  compile(): E.Either<Error, void> {
    const store = this.easel.store;
    const wires: WireBindingRef[] = (this.easel.plugin_data.wire?.get_bindings() ?? []).map(b => ({
      source_id: b.source_id,
      source_handle: b.source_handle,
      target_id: b.target_id,
      target_handle: b.target_handle,
    }));

    const in_degrees: Record<string, number> = {};
    const adj: Record<string, string[]> = {};
    const missing_reqs: Record<string, string> = {};

    for (const id of store.nodes.keys()) {
      in_degrees[id] = 0;
      adj[id] = [];
      const node = store.nodes.get(id)!;
      const req_err = this.check_requirements(node, wires);
      if (req_err) missing_reqs[id] = req_err;
    }

    for (const wire of wires) {
      if (store.nodes.has(wire.source_id) && store.nodes.has(wire.target_id)) {
        in_degrees[wire.target_id]++;
        adj[wire.source_id].push(wire.target_id);
      }
    }

    const node_states: Record<string, ExecutionNodeState> = {};
    const ready_queue: string[] = [];

    for (const id of store.nodes.keys()) {
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
      running_nodes: [],
    };

    return E.right(undefined);
  }

  private check_requirements(node: GraphNode, wires: WireBindingRef[]): string | null {
    if (is_node_muted(node)) return null;
    for (const port of node.inputs) {
      if (port.required) {
        const has_wire = wires.some(w => w.target_id === node.id && w.target_handle === port.id);
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
    if (
      this.state.value.status === 'idle' ||
      this.state.value.status === 'stopped' ||
      this.state.value.status === 'completed'
    ) {
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

  /** LRU cache get — moves entry to most-recent position. */
  private cache_get(
    id: string,
  ): { fingerprint: string; outputs: Record<string, unknown> } | undefined {
    const entry = this.input_cache.get(id);
    if (entry) {
      this.input_cache.delete(id);
      this.input_cache.set(id, entry);
    }
    return entry;
  }

  /** LRU cache set — evicts oldest when over max_cache_size. */
  private cache_set(
    id: string,
    entry: { fingerprint: string; outputs: Record<string, unknown> },
  ): void {
    if (this.max_cache_size <= 0) return;
    this.input_cache.delete(id);
    this.input_cache.set(id, entry);
    while (this.input_cache.size > this.max_cache_size) {
      const oldest = this.input_cache.keys().next().value;
      if (oldest !== undefined) this.input_cache.delete(oldest);
      else break;
    }
  }

  /** Clear all cached execution results. */
  clear_cache(): void {
    this.input_cache.clear();
  }

  /** Enable realtime mode: the executor will react to input changes */
  start_realtime() {
    this.realtime.value = true;
    if (
      this.state.value.status === 'idle' ||
      this.state.value.status === 'stopped' ||
      this.state.value.status === 'completed'
    ) {
      this.compile();
      // Initial full run to establish baseline outputs
      this.run().then(() => {
        if (this.realtime.value) {
          this.state.value = { ...this.state.value, status: 'idle' };
        }
      });
    }
  }

  /** Disable realtime mode */
  stop_realtime() {
    this.realtime.value = false;
    if (this.realtime_debounce_timer) {
      clearTimeout(this.realtime_debounce_timer);
      this.realtime_debounce_timer = null;
    }
  }

  /** Called externally when a node's inputs have changed */
  notify_input_change(node_id: string) {
    if (!this.realtime.value) return;
    if (this.realtime_debounce_timer) {
      clearTimeout(this.realtime_debounce_timer);
    }
    this.realtime_debounce_timer = setTimeout(() => {
      this.realtime_debounce_timer = null;
      this.realtime_execute_downstream(node_id);
    }, 80);
  }

  async step() {
    if (
      this.state.value.status === 'idle' ||
      this.state.value.status === 'stopped' ||
      this.state.value.status === 'completed'
    ) {
      this.compile();
    }
    this.state.value = { ...this.state.value, status: 'paused' };

    const next_id = this.state.value.ready_queue[0];
    if (next_id) {
      this.state.value = {
        ...this.state.value,
        ready_queue: this.state.value.ready_queue.slice(1),
        running_nodes: [...this.state.value.running_nodes, next_id],
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
        running_nodes: [...this.state.value.running_nodes, ...ready],
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

  /**
   * Collect all downstream node IDs reachable from the given start node.
   */
  private collect_downstream(start_id: string): Set<string> {
    const visited = new Set<string>();
    const queue = [start_id];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      for (const target of this.state.value.adj[id] || []) {
        queue.push(target);
      }
    }
    return visited;
  }

  /**
   * Re-execute the subgraph downstream of a changed node.
   * Uses Kahn's algorithm for correct topological ordering.
   * Does NOT use the normal finish_node path (avoids mangling full graph in_degrees).
   */
  private async realtime_execute_downstream(changed_id: string) {
    if (this.state.value.status === 'running') return;

    const subgraph = this.collect_downstream(changed_id);

    // Create dedicated abort controller for this realtime pass
    this.abort_controller = new AbortController();

    // Reset node states and clear caches for the subgraph
    const node_states = { ...this.state.value.node_states };
    for (const id of subgraph) {
      this.input_cache.delete(id);
      node_states[id] = { status: 'idle' as const, progress: 0, outputs: {} };
    }

    // Compute topological order within the subgraph
    const in_deg: Record<string, number> = {};
    for (const id of subgraph) in_deg[id] = 0;
    for (const [src, targets] of Object.entries(this.state.value.adj)) {
      if (!subgraph.has(src)) continue;
      for (const tgt of targets) {
        if (subgraph.has(tgt)) {
          in_deg[tgt] = (in_deg[tgt] || 0) + 1;
        }
      }
    }

    const queue = Array.from(subgraph).filter(id => in_deg[id] === 0);
    const order: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      order.push(id);
      for (const tgt of this.state.value.adj[id] || []) {
        if (!subgraph.has(tgt)) continue;
        in_deg[tgt]--;
        if (in_deg[tgt] === 0) {
          queue.push(tgt);
        }
      }
    }

    this.state.value = {
      ...this.state.value,
      status: 'running',
      node_states,
      ready_queue: [],
      running_nodes: [],
    };

    // Execute each node in topological order using the realtime path
    for (const id of order) {
      if (this.abort_controller?.signal.aborted) break;
      await this.realtime_execute_node(id);
    }

    this.abort_controller = null;

    if (this.state.value.running_nodes.length === 0) {
      this.state.value = { ...this.state.value, status: 'completed' };
    }
  }

  /**
   * Execute a single node during realtime mode.
   * Bypasses finish_node() to avoid corrupting the full graph's in_degrees.
   */
  private async realtime_execute_node(id: string) {
    if (this.abort_controller?.signal.aborted) return;

    this.update_node_state(id, { status: 'running', progress: 0 });

    const inst = this.easel.get_node_instance(id);
    const node = this.easel.store.nodes.get(id);

    try {
      let outputs: Record<string, unknown> = {};
      if (is_node_muted(node)) {
        outputs = muted_node_outputs(node, this.gather_inputs(id));
      } else if (inst && typeof inst.execute === 'function') {
        const inputs = this.gather_inputs(id);

        const fingerprint = this.inputs_fingerprint(inputs);
        const cached = this.cache_get(id);
        if (cached && cached.fingerprint === fingerprint) {
          outputs = GraphExecutor.deep_clone(cached.outputs);
          this.update_node_state(id, { status: 'completed', progress: 100, outputs });
          this.state.value = {
            ...this.state.value,
            running_nodes: this.state.value.running_nodes.filter(n => n !== id),
          };
          return;
        }

        outputs = await inst.execute({
          node: node!,
          inputs,
          report_progress: progress => {
            if (!this.abort_controller?.signal.aborted) {
              this.update_node_state(id, { progress });
            }
          },
          signal: this.abort_controller!.signal,
        });
      }

      if (this.abort_controller?.signal.aborted) return;

      if (!is_node_muted(node)) {
        const fresh_inputs = this.gather_inputs(id);
        const fresh_fingerprint = this.inputs_fingerprint(fresh_inputs);
        this.cache_set(id, {
          fingerprint: fresh_fingerprint,
          outputs: GraphExecutor.deep_clone(outputs),
        });
      }

      this.update_node_state(id, { status: 'completed', progress: 100, outputs });
      this.state.value = {
        ...this.state.value,
        running_nodes: this.state.value.running_nodes.filter(n => n !== id),
      };
    } catch (e) {
      if (this.abort_controller?.signal.aborted) return;
      this.update_node_state(id, {
        status: 'error',
        progress: 0,
        error: e instanceof Error ? e.message : String(e),
      });
      this.state.value = {
        ...this.state.value,
        running_nodes: this.state.value.running_nodes.filter(n => n !== id),
      };
    }
  }

  private update_node_state(id: string, update: Partial<ExecutionNodeState>) {
    this.state.value = {
      ...this.state.value,
      node_states: {
        ...this.state.value.node_states,
        [id]: { ...this.state.value.node_states[id]!, ...update },
      },
    };
  }

  private gather_inputs(node_id: string): Record<string, unknown> {
    const inputs: Record<string, unknown> = {};
    const store = this.easel.store;
    const node = store.nodes.get(node_id);
    const wires: WireBindingRef[] = (this.easel.plugin_data.wire?.get_bindings() ?? []).map(b => ({
      source_id: b.source_id,
      target_id: b.target_id,
      source_handle: b.source_handle,
      target_handle: b.target_handle,
    }));

    if (node?.widgets) {
      for (const w of node.widgets) inputs[w.id] = w.value;
    }

    for (const wire of wires) {
      if (wire.target_id === node_id) {
        const source_state = this.state.value.node_states[wire.source_id];
        if (source_state?.outputs && wire.source_handle in source_state.outputs) {
          inputs[wire.target_handle] = source_state.outputs[wire.source_handle];
        }
      }
    }
    return inputs;
  }

  private static deep_clone<T>(val: T): T {
    return structuredClone(val);
  }

  /** Deterministic fingerprint of input values 閳?two compilations with same inputs produce same fingerprint */
  /** Deterministic fingerprint — 排序键拼接，避免 JSON.stringify 开销。 */
  private inputs_fingerprint(inputs: Record<string, unknown>): string {
    return Object.keys(inputs)
      .sort()
      .map(k => k + '\x00' + typeof inputs[k] + '\x00' + String(inputs[k]))
      .join('\x01');
  }

  private async execute_node(id: string) {
    if (this.abort_controller?.signal.aborted) return;

    this.update_node_state(id, { status: 'running', progress: 0 });

    const inst = this.easel.get_node_instance(id);
    const node = this.easel.store.nodes.get(id);

    try {
      let outputs: Record<string, unknown> = {};
      if (is_node_muted(node)) {
        outputs = muted_node_outputs(node, this.gather_inputs(id));
      } else if (inst && typeof inst.execute === 'function') {
        const inputs = this.gather_inputs(id);

        // Separate cache (persists across compilations) 閳?skip execution when inputs unchanged
        const fingerprint = this.inputs_fingerprint(inputs);
        const cached = this.cache_get(id);
        if (cached && cached.fingerprint === fingerprint) {
          outputs = GraphExecutor.deep_clone(cached.outputs);
          this.update_node_state(id, { status: 'completed', progress: 100, outputs });
          this.finish_node(id);
          return;
        }

        outputs = await inst.execute({
          node: node!,
          inputs,
          report_progress: progress => {
            if (!this.abort_controller?.signal.aborted) {
              this.update_node_state(id, { progress });
            }
          },
          signal: this.abort_controller!.signal,
        });
      } else {
        outputs = {};
      }

      if (this.abort_controller?.signal.aborted) return;

      if (!is_node_muted(node)) {
        // Cache fresh outputs so unchanged inputs skip execution on future runs
        const fresh_inputs = this.gather_inputs(id);
        const fresh_fingerprint = this.inputs_fingerprint(fresh_inputs);
        this.cache_set(id, {
          fingerprint: fresh_fingerprint,
          outputs: GraphExecutor.deep_clone(outputs),
        });
      }

      this.update_node_state(id, { status: 'completed', progress: 100, outputs });
      this.finish_node(id);
    } catch (e) {
      if (this.abort_controller?.signal.aborted) return;
      this.update_node_state(id, {
        status: 'error',
        progress: 0,
        error: e instanceof Error ? e.message : String(e),
      });
      this.finish_node(id, true);
    }
  }

  private finish_node(id: string, is_error = false) {
    const new_ready: string[] = [];
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
      ready_queue: [...this.state.value.ready_queue, ...new_ready],
    };
  }
}
