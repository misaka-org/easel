import type { GraphNode, Binding } from '@/core/types';
import type { ExecuteContext } from '@/runtime/registry';
import { get_node_constructor } from '@/runtime/registry';

/** Execute subgraph internal graph with external inputs. */
export async function execute_subgraph(
  ctx: ExecuteContext,
): Promise<Record<string, unknown>> {
  const graph = ctx.node.custom_data['graph'] as
    | { nodes: Record<string, GraphNode>; bindings: Record<string, Binding> }
    | undefined;
  if (!graph) return {};

  const { nodes: n, bindings: bnd } = graph;
  const ids = Object.keys(n);
  if (ids.length === 0) return {};

  const adj: Record<string, string[]> = {};
  const indeg: Record<string, number> = {};
  for (const id of ids) { adj[id] = []; indeg[id] = 0; }
  for (const b of Object.values(bnd)) {
    if (b.type !== 'data-flow') continue;
    if (adj[b.source_id] && adj[b.target_id]) {
      adj[b.source_id]!.push(b.target_id);
      indeg[b.target_id] = (indeg[b.target_id] || 0) + 1;
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
    for (const b of Object.values(bnd)) {
      if (b.type !== 'data-flow' || b.target_id !== id) continue;
      const src = out[b.source_id];
      if (src && b.source_handle in src) {
        inp[b.target_handle] = src[b.source_handle];
      }
    }

    if (nd.type === 'subgraph_output') {
      out[id] = { ...inp };
      continue;
    }

    const ctor = get_node_constructor(nd.type);
    if (ctor) {
      const tmp_el = document.createElement('div');
      const inst = new ctor(tmp_el, () => {}, id, {});
      if (typeof inst.execute === 'function') {
        try {
          out[id] = await inst.execute({
            node: nd, inputs: inp,
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