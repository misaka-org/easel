import type { GraphNode } from '@/core/types';
import { is_node_muted, muted_node_outputs } from '@/core/node_ops';
import type { ExecuteContext, EaselNodeContext } from '@/runtime/registry';
import { get_node_constructor } from '@/runtime/registry';
import EventEmitter from 'eventemitter3';
import type { EaselEvents, NodeEventPayloads } from '@/runtime/easel';

type Edge = { source_id: string; target_id: string; source_handle: string; target_handle: string };

/** Execute subgraph internal graph with external inputs. */
export async function execute_subgraph(ctx: ExecuteContext): Promise<Record<string, unknown>> {
  const graph = ctx.node.custom_data['graph'] as
    | { nodes: Record<string, GraphNode>; edges: Edge[] }
    | undefined;
  if (!graph) return {};

  const { nodes: n, edges: edges } = graph;
  const ids = Object.keys(n);
  if (ids.length === 0) return {};

  const adj: Record<string, string[]> = {};
  const indeg: Record<string, number> = {};
  for (const id of ids) {
    adj[id] = [];
    indeg[id] = 0;
  }
  for (const e of edges) {
    if (adj[e.source_id] && adj[e.target_id]) {
      adj[e.source_id]!.push(e.target_id);
      indeg[e.target_id] = (indeg[e.target_id] || 0) + 1;
    }
  }

  const out: Record<string, Record<string, unknown>> = {};
  const si = Object.values(n).find(x => x.type === 'subgraph_input');
  if (si) {
    out[si.id] = {};
    for (let i = 0; i < si.outputs.length; i++) {
      const port = si.outputs[i]!;
      out[si.id]![port.id] = ctx.inputs['sg_in_' + i];
    }
  }

  const ic: Record<string, number> = { ...indeg };
  const q = ids.filter(id => ic[id] === 0);
  const ord: string[] = [];
  while (q.length > 0) {
    const id = q.shift()!;
    ord.push(id);
    for (const t of adj[id] || []) {
      ic[t]!--;
      if (ic[t] === 0) q.push(t);
    }
  }
  for (const id of ids) {
    if (!ord.includes(id)) ord.push(id);
  }

  for (const id of ord) {
    if (ctx.signal?.aborted) break;
    const nd = n[id];
    if (!nd || nd.type === 'subgraph_input') continue;

    const inp: Record<string, unknown> = {};
    if (nd.widgets) {
      for (const w of nd.widgets) inp[w.id] = w.value;
    }
    for (const e of edges) {
      if (e.target_id !== id) continue;
      const src = out[e.source_id];
      if (src && e.source_handle in src) {
        inp[e.target_handle] = src[e.source_handle];
      }
    }

    if (nd.type === 'subgraph_output') {
      out[id] = { ...inp };
      continue;
    }

    if (is_node_muted(nd)) {
      out[id] = muted_node_outputs(nd, inp);
      continue;
    }

    const ctor = get_node_constructor(nd.type);
    if (ctor) {
      const tmp_el = document.createElement('div');
      const mock_ctx: EaselNodeContext = {
        app_events: new EventEmitter<EaselEvents>(),
        node_events: new Map<string, EventEmitter<NodeEventPayloads>>(),
      };
      const inst = new ctor(tmp_el, () => {}, id, mock_ctx);
      if (typeof inst.execute === 'function') {
        try {
          out[id] = await inst.execute({
            node: nd,
            inputs: inp,
            report_progress: () => {},
            signal: ctx.signal,
          });
        } catch {
          out[id] = {};
        }
      } else {
        out[id] = {};
      }
    } else {
      out[id] = {};
    }
  }

  const so = Object.values(n).find(x => x.type === 'subgraph_output');
  const result: Record<string, unknown> = {};
  if (so) {
    const sr = out[so.id] || {};
    for (let i = 0; i < so.inputs.length; i++) {
      const port = so.inputs[i]!;
      result['sg_out_' + i] = sr[port.id];
    }
  }
  return result;
}
