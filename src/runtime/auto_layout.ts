import type { GraphNode, Wire } from '@/core/types';
import { vec2_create, type Vec2 } from '@/core/math';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------
interface ComponentLayout {
  positions: Record<string, Vec2>;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// 1. Connected components  -  find subgraphs via undirected BFS
// ---------------------------------------------------------------------------
function find_connected_components(
  nodes: Record<string, GraphNode>,
  wires: Record<string, Wire>,
): string[][] {
  const adj = new Map<string, Set<string>>();
  for (const id of Object.keys(nodes)) adj.set(id, new Set());
  for (const w of Object.values(wires)) {
    adj.get(w.source_node_id)?.add(w.target_node_id);
    adj.get(w.target_node_id)?.add(w.source_node_id);
  }

  const visited = new Set<string>();
  const comps: string[][] = [];

  for (const id of Object.keys(nodes)) {
    if (visited.has(id)) continue;
    const comp: string[] = [];
    const stack = [id];
    visited.add(id);
    while (stack.length > 0) {
      const nid = stack.pop()!;
      comp.push(nid);
      for (const nb of adj.get(nid) || []) {
        if (!visited.has(nb)) {
          visited.add(nb);
          stack.push(nb);
        }
      }
    }
    comps.push(comp);
  }

  return comps;
}

// ---------------------------------------------------------------------------
// 2. Layered layout for a single connected component
//    Sources (no incoming wires) -> layer 0, then BFS breadth-first.
//    Left-to-right column layout: each layer is a column.
//    Nodes are top-aligned (y=0 = component top edge) to avoid packing
//    overlaps when components have different heights.
// ---------------------------------------------------------------------------
function layout_component(
  nodes: Record<string, GraphNode>,
  wires: Record<string, Wire>,
  comp: string[],
): ComponentLayout {
  if (comp.length === 0) return { positions: {}, width: 0, height: 0 };

  // Directed adjacency (outgoing only)
  const out_adj = new Map<string, string[]>();
  const in_deg = new Map<string, number>();
  for (const id of comp) {
    out_adj.set(id, []);
    in_deg.set(id, 0);
  }
  for (const w of Object.values(wires)) {
    out_adj.get(w.source_node_id)?.push(w.target_node_id);
    if (in_deg.has(w.target_node_id)) {
      in_deg.set(w.target_node_id, in_deg.get(w.target_node_id)! + 1);
    }
  }

  // --- Layer assignment (longest-path from sources) ------------------------
  const layer = new Map<string, number>();
  const queue: string[] = [];

  // Sources: no incoming edges from within the component
  for (const id of comp) {
    if (in_deg.get(id) === 0) {
      layer.set(id, 0);
      queue.push(id);
    }
  }

  // If nothing is source (cycle), pick the most connected node
  if (queue.length === 0) {
    let best = comp[0];
    let best_deg = 0;
    for (const id of comp) {
      const deg = out_adj.get(id)!.length + in_deg.get(id)!;
      if (deg > best_deg) {
        best_deg = deg;
        best = id;
      }
    }
    layer.set(best, 0);
    queue.push(best);
  }

  // BFS with longest-path rule
  let front = 0;
  while (front < queue.length) {
    const id = queue[front++];
    const l = layer.get(id)!;
    for (const nb of out_adj.get(id) || []) {
      const next_l = l + 1;
      const existing = layer.get(nb);
      if (existing === undefined || next_l > existing) {
        layer.set(nb, next_l);
        queue.push(nb);
      }
    }
  }

  // Stragglers (not reached from sources) -> layer 0
  for (const id of comp) {
    if (!layer.has(id)) layer.set(id, 0);
  }

  // --- Group by layer -----------------------------------------------------
  const groups = new Map<number, string[]>();
  for (const [id, l] of layer) {
    if (!groups.has(l)) groups.set(l, []);
    groups.get(l)!.push(id);
  }

  const sorted_layers = [...groups.entries()].sort((a, b) => a[0] - b[0]);

  // --- Position nodes -----------------------------------------------------
  const GAP_X = 60;
  const GAP_Y = 40;

  let x = 0;
  const positions: Record<string, Vec2> = {};

  for (const [, ids] of sorted_layers) {
    // Column width = widest node in this layer
    let col_w = 0;
    for (const id of ids) {
      col_w = Math.max(col_w, nodes[id].size.x);
    }

    // Place nodes top-to-bottom, no centering (y=0 = component top edge)
    let y = 0;
    for (const id of ids) {
      const x_offset = (col_w - nodes[id].size.x) / 2;
      positions[id] = vec2_create(x + x_offset, y);
      y += nodes[id].size.y + GAP_Y;
    }

    x += col_w + GAP_X;
  }

  const total_w = Math.max(0, x - GAP_X);

  // Component height = distance from top (0) to bottom of lowest node
  let max_bottom = 0;
  for (const id of comp) {
    const p = positions[id];
    if (!p) continue;
    const b = p.y + nodes[id].size.y;
    if (b > max_bottom) max_bottom = b;
  }
  const total_h = max_bottom;

  return { positions, width: total_w, height: total_h };
}

// ---------------------------------------------------------------------------
// 3. Pack component bounding boxes into a rectangle matching target aspect
//    Uses simple row-based packing (wrap when row overflows).
// ---------------------------------------------------------------------------
function pack_components(
  layouts: ComponentLayout[],
  target_aspect: number,
  gap: number,
): Record<string, Vec2> {
  const result: Record<string, Vec2> = {};
  if (layouts.length === 0) return result;

  // Estimate the container width to roughly match target_aspect
  let total_area = 0;
  for (const l of layouts) {
    total_area += (l.width + gap) * (l.height + gap);
  }

  let container_w = Math.sqrt(total_area * target_aspect);
  container_w = Math.max(container_w, 300);

  // Row packing
  let x = 0;
  let y = 0;
  let row_h = 0;

  for (const l of layouts) {
    const w = l.width;
    const h = l.height;

    // Wrap to next row if doesn't fit (but at least place one item per row)
    if (x + w > container_w && x > 0) {
      x = 0;
      y += row_h + gap;
      row_h = 0;
    }

    // Place all nodes in this component
    for (const [id, pos] of Object.entries(l.positions)) {
      result[id] = vec2_create(pos.x + x, pos.y + y);
    }

    x += w + gap;
    row_h = Math.max(row_h, h);
  }

  return result;
}

// ---------------------------------------------------------------------------
// 4. Public entry point
// ---------------------------------------------------------------------------
export function auto_layout(
  nodes: Record<string, GraphNode>,
  wires: Record<string, Wire>,
  viewport_width: number,
  viewport_height: number,
): {
  positions: Record<string, Vec2>;
  zoom: number;
  camera_pos: Vec2;
} {
  // 1. Connected components
  const comps = find_connected_components(nodes, wires);

  // 2. Layout each component at its own origin
  const layouts: ComponentLayout[] = [];
  for (const comp of comps) {
    if (comp.length === 0) continue;
    layouts.push(layout_component(nodes, wires, comp));
  }

  if (layouts.length === 0) {
    return { positions: {}, zoom: 1, camera_pos: vec2_create(0, 0) };
  }

  // 3. Pack components together
  const padding = 80;
  const target_aspect = viewport_width / viewport_height;
  const positions = pack_components(layouts, target_aspect, padding);

  // 4. Compute overall bounds
  let min_x = Infinity;
  let min_y = Infinity;
  let max_x = -Infinity;
  let max_y = -Infinity;

  for (const [id, pos] of Object.entries(positions)) {
    const n = nodes[id];
    if (!n) continue;
    min_x = Math.min(min_x, pos.x);
    min_y = Math.min(min_y, pos.y);
    max_x = Math.max(max_x, pos.x + n.size.x);
    max_y = Math.max(max_y, pos.y + n.size.y);
  }

  if (min_x === Infinity) {
    return { positions: {}, zoom: 1, camera_pos: vec2_create(0, 0) };
  }

  // 5. Compute camera to frame content in viewport (same logic as do_fit)
  const content_w = max_x - min_x + padding * 2;
  const content_h = max_y - min_y + padding * 2;
  const zoom = Math.min(viewport_width / content_w, viewport_height / content_h, 2);
  const center_x = (min_x + max_x) / 2;
  const center_y = (min_y + max_y) / 2;

  return {
    positions,
    zoom,
    camera_pos: vec2_create(
      viewport_width / 2 - center_x * zoom,
      viewport_height / 2 - center_y * zoom,
    ),
  };
}
