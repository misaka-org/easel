import { describe, expect, it } from 'vitest';
import type { GraphNode, Port } from '@/core/types';
import type { GraphBindingRecord, GraphDocument, GraphNodeRecord } from '@/core/graph/types';
import {
  add_binding,
  add_graph,
  add_node,
  create_empty_graph_document,
  type GraphDocumentError,
} from '@/core/graph/document';
import { pack_nodes } from '@/core/graph/subgraph';
import {
  create_document_controller,
  type DocumentController,
  type DocumentControllerError,
  type DocumentGraphView,
} from '@/runtime/document_controller';
import {
  mount_document_bridge,
  project_document_bridge_view,
  sync_document_controller_to_legacy,
  type DocumentBridgeBinding,
} from '@/runtime/document_bridge';
import { Store } from '@/runtime/store';
import * as E from 'fp-ts/Either';
import type { Easel } from '@/runtime/easel';

const port = (id: string, kind: 'input' | 'output'): Port => {
  return { id, label: id, type: kind, value_type: 'text' };
};

const make_node = (
  id: string,
  graph_id: string,
  options: {
    readonly inputs?: readonly Port[];
    readonly outputs?: readonly Port[];
    readonly position?: { readonly x: number; readonly y: number };
    readonly custom_data?: Record<string, unknown>;
    readonly muted?: boolean;
    readonly pinned?: boolean;
    readonly locked?: boolean;
  } = {},
): GraphNodeRecord => {
  return {
    id,
    graph_id,
    type: 'default',
    position: options.position ?? { x: 0, y: 0 },
    size: { x: 100, y: 80 },
    title: id,
    inputs: options.inputs ?? [],
    outputs: options.outputs ?? [],
    custom_data: options.custom_data ?? {},
    ...(options.muted !== undefined ? { muted: options.muted } : {}),
    ...(options.pinned !== undefined ? { pinned: options.pinned } : {}),
    ...(options.locked !== undefined ? { locked: options.locked } : {}),
  };
};

const make_binding = (
  id: string,
  graph_id: string,
  source_id: string,
  source_handle: string,
  target_id: string,
  target_handle: string,
): GraphBindingRecord => {
  return {
    id,
    graph_id,
    source_id,
    source_handle,
    target_id,
    target_handle,
  };
};

const to_legacy_node = (record: GraphNodeRecord): GraphNode => {
  const { graph_id: _graph_id, nested_graph_id: _nested_graph_id, ...node } = record;
  return node;
};

const to_legacy_binding = (record: GraphBindingRecord): DocumentBridgeBinding => {
  const { graph_id: _graph_id, ...binding } = record;
  return binding;
};

const unwrap_document = (result: E.Either<GraphDocumentError, GraphDocument>): GraphDocument => {
  if (E.isLeft(result)) {
    throw new Error(`unexpected document error: ${String(result.left)}`);
  }
  return result.right;
};

const unwrap_controller = (result: E.Either<unknown, DocumentController>): DocumentController => {
  if (E.isLeft(result)) {
    throw new Error(`unexpected controller error: ${String(result.left)}`);
  }
  return result.right;
};

const unwrap_view = (
  result: E.Either<DocumentControllerError, DocumentGraphView>,
): DocumentGraphView => {
  if (E.isLeft(result)) {
    throw new Error(`unexpected controller operation error: ${String(result.left)}`);
  }
  return result.right;
};

const make_packed_document = (): GraphDocument => {
  const source = make_node('source', 'root', {
    position: { x: 10, y: 20 },
    outputs: [port('source_out', 'output')],
    custom_data: { root_flag: true },
  });
  const a = make_node('a', 'root', {
    position: { x: 30, y: 40 },
    inputs: [port('a_in', 'input')],
    outputs: [port('a_out', 'output')],
    custom_data: { nested: { keep: true } },
  });
  const b = make_node('b', 'root', {
    position: { x: 50, y: 60 },
    inputs: [port('b_in', 'input')],
    outputs: [port('b_out', 'output')],
    custom_data: { nested: { keep: true } },
  });
  const sink = make_node('sink', 'root', {
    position: { x: 70, y: 80 },
    inputs: [port('sink_in', 'input')],
  });

  let document = unwrap_document(add_node(create_empty_graph_document(), source));
  document = unwrap_document(add_node(document, a));
  document = unwrap_document(add_node(document, b));
  document = unwrap_document(add_node(document, sink));
  document = unwrap_document(
    add_binding(document, make_binding('external', 'root', 'source', 'source_out', 'a', 'a_in')),
  );
  document = unwrap_document(
    add_binding(document, make_binding('internal', 'root', 'a', 'a_out', 'b', 'b_in')),
  );
  document = unwrap_document(
    add_binding(document, make_binding('output_result', 'root', 'b', 'b_out', 'sink', 'sink_in')),
  );

  return unwrap_document(
    pack_nodes(document, {
      source_graph_id: 'root',
      node_ids: ['a', 'b'],
      graph_id: 'child',
      host_node_id: 'host',
      host_title: 'Child',
    }),
  );
};

const make_empty_child_document = (): GraphDocument => {
  const document = unwrap_document(
    add_graph(create_empty_graph_document(), {
      id: 'child',
      kind: 'subgraph',
      parent_graph_id: 'root',
      title: 'Empty Child',
      input_slots: [],
      output_slots: [],
    }),
  );
  const host: GraphNodeRecord = {
    ...make_node('host', 'root'),
    nested_graph_id: 'child',
  };
  return unwrap_document(add_node(document, host));
};

const make_legacy_node = (id: string): GraphNode => {
  return {
    id,
    type: 'default',
    position: { x: 0, y: 0 },
    size: { x: 100, y: 80 },
    title: id,
    inputs: [],
    outputs: [],
    custom_data: {},
  };
};

const make_fake_easel = (): {
  readonly easel: Easel;
  readonly bindings: DocumentBridgeBinding[];
} => {
  const store = new Store();
  const bindings: DocumentBridgeBinding[] = [];
  const wire = {
    get_bindings: () => bindings.slice(),
    add_binding: (binding: DocumentBridgeBinding) => {
      bindings.push(binding);
    },
    remove_binding: (binding_id: string) => {
      const index = bindings.findIndex(binding => binding.id === binding_id);
      if (index !== -1) {
        bindings.splice(index, 1);
      }
    },
  };
  return {
    easel: { store, plugin_data: { wire } } as unknown as Easel,
    bindings,
  };
};

describe('document bridge', () => {
  it('projects muted, pinned and locked onto legacy nodes', () => {
    const flagged = make_node('flagged', 'root', {
      position: { x: 1, y: 2 },
      muted: true,
      pinned: true,
      locked: true,
    });
    const document = unwrap_document(add_node(create_empty_graph_document(), flagged));
    const controller = unwrap_controller(create_document_controller(document));
    const view = project_document_bridge_view(controller.view);

    expect(view.nodes['flagged']?.muted).toBe(true);
    expect(view.nodes['flagged']?.pinned).toBe(true);
    expect(view.nodes['flagged']?.locked).toBe(true);
    expect(view.nodes['flagged']).not.toHaveProperty('graph_id');
    expect(view.nodes['flagged']).not.toHaveProperty('nested_graph_id');
  });

  it('projects root scope without graph-only fields, non-root content, or boundary proxies', () => {
    const document = make_packed_document();
    const controller = unwrap_controller(create_document_controller(document));
    const view = project_document_bridge_view(controller.view);

    expect(view.path).toEqual(['root']);
    expect(view.graph.id).toBe('root');
    expect(view.graph.input_slots).toEqual([]);
    expect(view.graph.output_slots).toEqual([]);
    expect(Object.keys(view.nodes).sort()).toEqual(['host', 'sink', 'source']);
    expect(Object.keys(view.bindings).sort()).toEqual(['external', 'output_result']);
    expect(view.view_only_node_ids).toEqual([]);
    expect(view.view_only_binding_ids).toEqual([]);

    const host = view.nodes['host']!;
    expect(host).toEqual(to_legacy_node(controller.document.nodes['host']!));
    expect(host).not.toHaveProperty('graph_id');
    expect(host).not.toHaveProperty('nested_graph_id');
    expect(view.bindings['external']).toEqual(
      to_legacy_binding(controller.document.bindings['external']!),
    );
    expect(view.bindings['external']).not.toHaveProperty('graph_id');
    expect(view.bindings['output_result']).toEqual(
      to_legacy_binding(controller.document.bindings['output_result']!),
    );
  });

  it('projects packed child content with view-only boundary proxies and mappings', () => {
    const controller = unwrap_controller(create_document_controller(make_packed_document()));
    const child_view = unwrap_view(controller.enter_subgraph('host'));
    const view = project_document_bridge_view(child_view);

    expect(view.path).toEqual(['root', 'child']);
    expect(view.graph.id).toBe('child');
    expect(view.graph.input_slots.map(slot => slot.id)).toEqual(['input_0']);
    expect(view.graph.output_slots.map(slot => slot.id)).toEqual(['output_0']);
    expect(view.nodes['host']).toBeUndefined();

    const input_proxy = Object.values(view.nodes).find(
      node =>
        node.type === 'subgraph_input' && node.custom_data?.['boundary_direction'] === 'input',
    );
    const output_proxy = Object.values(view.nodes).find(
      node =>
        node.type === 'subgraph_output' && node.custom_data?.['boundary_direction'] === 'output',
    );
    expect(input_proxy).toBeDefined();
    expect(output_proxy).toBeDefined();
    expect(input_proxy?.inputs).toEqual([]);
    expect(input_proxy?.outputs.map(port => port.id)).toEqual([
      'input_0',
      '__easel_boundary_add__',
    ]);
    expect(output_proxy?.inputs.map(port => port.id)).toEqual([
      'output_0',
      '__easel_boundary_add__',
    ]);
    expect(output_proxy?.outputs).toEqual([]);
    expect(input_proxy?.custom_data).toEqual({
      boundary_direction: 'input',
      scope_graph_id: 'child',
      view_only: true,
    });
    expect(output_proxy?.custom_data).toEqual({
      boundary_direction: 'output',
      scope_graph_id: 'child',
      view_only: true,
    });
    expect(input_proxy?.outputs[0]?.value_type).toBe('text');
    expect(output_proxy?.inputs[0]?.value_type).toBe('text');
    expect(input_proxy?.position.x).toBeLessThan(
      view.nodes['a']?.position.x ?? Number.POSITIVE_INFINITY,
    );
    expect(output_proxy?.position.x).toBeGreaterThan(
      view.nodes['b']?.position.x ?? Number.NEGATIVE_INFINITY,
    );
    expect(Object.keys(view.nodes).sort()).toEqual(['a', 'b', ...view.view_only_node_ids].sort());

    const input_binding = Object.values(view.bindings).find(
      binding => binding.source_id === input_proxy?.id,
    );
    const output_binding = Object.values(view.bindings).find(
      binding => binding.target_id === output_proxy?.id,
    );
    expect(input_binding).toBeDefined();
    expect(output_binding).toBeDefined();
    expect(input_binding?.source_handle).toBe('input_0');
    expect(input_binding?.target_id).toBe('a');
    expect(input_binding?.target_handle).toBe('a_in');
    expect(output_binding?.source_id).toBe('b');
    expect(output_binding?.source_handle).toBe('b_out');
    expect(output_binding?.target_handle).toBe('output_0');

    expect(Object.keys(view.bindings).sort()).toEqual(
      ['internal', ...view.view_only_binding_ids].sort(),
    );
    expect(view.view_only_node_ids).toHaveLength(2);
    expect(view.view_only_binding_ids).toHaveLength(2);
    expect(new Set(view.view_only_node_ids).has(input_proxy?.id ?? '')).toBe(true);
    expect(new Set(view.view_only_node_ids).has(output_proxy?.id ?? '')).toBe(true);
    expect(new Set(view.view_only_binding_ids).has(input_binding?.id ?? '')).toBe(true);
    expect(new Set(view.view_only_binding_ids).has(output_binding?.id ?? '')).toBe(true);

    const a = view.nodes['a']!;
    expect(a).toEqual(to_legacy_node(controller.document.nodes['a']!));
    expect(a).not.toHaveProperty('graph_id');
    expect(a).not.toHaveProperty('nested_graph_id');
    expect(a.custom_data).toEqual({ nested: { keep: true } });
    expect(view.bindings['internal']).toEqual(
      to_legacy_binding(controller.document.bindings['internal']!),
    );
    expect(view.bindings['internal']).not.toHaveProperty('graph_id');

    for (const node of Object.values(view.nodes)) {
      expect(node).not.toHaveProperty('graph_id');
      expect(node).not.toHaveProperty('nested_graph_id');
    }
    for (const binding of Object.values(view.bindings)) {
      expect(binding).not.toHaveProperty('graph_id');
    }
  });

  it('projects an empty child scope with both rails and add ports', () => {
    const controller = unwrap_controller(create_document_controller(make_empty_child_document()));
    const child_view = unwrap_view(controller.enter_subgraph('host'));
    const view = project_document_bridge_view(child_view);

    expect(view.graph.kind).toBe('subgraph');
    expect(view.graph.input_slots).toEqual([]);
    expect(view.graph.output_slots).toEqual([]);
    expect(Object.keys(view.nodes)).toEqual(view.view_only_node_ids);
    expect(view.view_only_node_ids).toHaveLength(2);

    const input_proxy = Object.values(view.nodes).find(node => node.type === 'subgraph_input');
    const output_proxy = Object.values(view.nodes).find(node => node.type === 'subgraph_output');
    expect(input_proxy?.outputs.map(port => port.id)).toEqual(['__easel_boundary_add__']);
    expect(output_proxy?.inputs.map(port => port.id)).toEqual(['__easel_boundary_add__']);
    expect(input_proxy?.custom_data?.['scope_graph_id']).toBe('child');
    expect(output_proxy?.custom_data?.['scope_graph_id']).toBe('child');
    expect(input_proxy?.position.x).toBeLessThan(output_proxy?.position.x ?? 0);
    expect(Object.keys(view.bindings)).toEqual([]);
    expect(view.view_only_binding_ids).toEqual([]);
  });

  it('does not modify the controller view while projecting', () => {
    const controller = unwrap_controller(create_document_controller(make_packed_document()));
    const view = controller.view;
    const document_snapshot = JSON.stringify(controller.document);
    const view_snapshot = JSON.stringify(view);

    const projected = project_document_bridge_view(view);
    expect(projected.nodes['a']).toBeUndefined();
    expect(JSON.stringify(controller.document)).toBe(document_snapshot);
    expect(JSON.stringify(controller.view)).toBe(view_snapshot);
  });

  it('syncs only the current scope into legacy store and wire bindings', () => {
    const controller = unwrap_controller(create_document_controller(make_packed_document()));
    const fake = make_fake_easel();
    const store = fake.easel.store;

    store.nodes.put('stale_node', make_legacy_node('stale_node'));
    fake.bindings.push({
      id: 'stale_wire',
      source_id: 'stale_node',
      source_handle: 'out',
      target_id: 'stale_target',
      target_handle: 'in',
    });

    sync_document_controller_to_legacy(fake.easel, controller);
    expect(store.nodes.keys().sort()).toEqual(['host', 'sink', 'source']);
    expect(fake.bindings.map(binding => binding.id).sort()).toEqual(['external', 'output_result']);
    expect(store.nodes.get('host')).not.toHaveProperty('graph_id');
    expect(store.nodes.get('host')).not.toHaveProperty('nested_graph_id');
    expect(fake.bindings[0]).not.toHaveProperty('graph_id');

    unwrap_view(controller.enter_subgraph('host'));
    const projected_child = project_document_bridge_view(controller.view);
    sync_document_controller_to_legacy(fake.easel, controller);
    expect(store.nodes.keys().sort()).toEqual(Object.keys(projected_child.nodes).sort());
    expect(fake.bindings.map(binding => binding.id).sort()).toEqual(
      Object.keys(projected_child.bindings).sort(),
    );
    expect(store.nodes.get('host')).toBeUndefined();
    expect(store.nodes.get('a')).not.toHaveProperty('graph_id');
    expect(store.nodes.get('a')).not.toHaveProperty('nested_graph_id');
    expect(fake.bindings.find(binding => binding.id === 'internal')).not.toHaveProperty('graph_id');
  });

  it('mounts a controller-to-legacy effect and stops cleanly without reverse sync', () => {
    const controller = unwrap_controller(create_document_controller(make_packed_document()));
    const fake = make_fake_easel();
    const stop = mount_document_bridge(fake.easel, controller);

    expect(fake.easel.store.nodes.keys().sort()).toEqual(['host', 'sink', 'source']);
    fake.easel.store.nodes.delete('source');
    expect(fake.easel.store.nodes.has('source')).toBe(false);

    unwrap_view(
      controller.add_node(
        make_node('added', 'root', {
          position: { x: 1, y: 1 },
          custom_data: { from_controller: true },
        }),
      ),
    );
    expect(fake.easel.store.nodes.has('added')).toBe(true);
    expect(fake.easel.store.nodes.has('source')).toBe(true);

    stop();
    unwrap_view(
      controller.add_node(
        make_node('after_stop', 'root', {
          position: { x: 2, y: 2 },
        }),
      ),
    );
    expect(fake.easel.store.nodes.has('after_stop')).toBe(false);
  });

  it('keeps user-moved rail positions when controller changes trigger resync', () => {
    const controller = unwrap_controller(create_document_controller(make_packed_document()));
    const fake = make_fake_easel();
    const stop = mount_document_bridge(fake.easel, controller);
    try {
      unwrap_view(controller.enter_subgraph('host'));
      const projected = project_document_bridge_view(controller.view);
      const rail = Object.values(projected.nodes).find(
        node =>
          node.type === 'subgraph_input' && node.custom_data?.['boundary_direction'] === 'input',
      );
      if (rail == null) {
        throw new Error('expected projected input rail');
      }
      const legacy_rail = fake.easel.store.nodes.get(rail.id);
      if (legacy_rail == null) {
        throw new Error('expected legacy input rail after mount');
      }
      fake.easel.store.nodes.put(rail.id, {
        ...legacy_rail,
        position: { x: 999, y: 777 },
      });

      unwrap_view(
        controller.add_node(
          make_node('extra', 'child', {
            position: { x: 5, y: 5 },
          }),
        ),
      );

      expect(fake.easel.store.nodes.get(rail.id)?.position).toEqual({ x: 999, y: 777 });
      expect(controller.document.nodes[rail.id]).toBeUndefined();
    } finally {
      stop();
    }
  });

  it('restores user-moved rail positions when re-entering the same scope', () => {
    const controller = unwrap_controller(create_document_controller(make_packed_document()));
    const fake = make_fake_easel();
    const stop = mount_document_bridge(fake.easel, controller);
    try {
      unwrap_view(controller.enter_subgraph('host'));
      const projected = project_document_bridge_view(controller.view);
      const rail = Object.values(projected.nodes).find(
        node =>
          node.type === 'subgraph_input' && node.custom_data?.['boundary_direction'] === 'input',
      );
      if (rail == null) {
        throw new Error('expected projected input rail');
      }
      const legacy_rail = fake.easel.store.nodes.get(rail.id);
      if (legacy_rail == null) {
        throw new Error('expected legacy input rail after mount');
      }
      fake.easel.store.nodes.put(rail.id, {
        ...legacy_rail,
        position: { x: 321, y: 654 },
      });

      unwrap_view(controller.exit_subgraph());
      expect(fake.easel.store.nodes.get(rail.id)).toBeUndefined();

      unwrap_view(controller.enter_subgraph('host'));
      expect(fake.easel.store.nodes.get(rail.id)?.position).toEqual({ x: 321, y: 654 });
    } finally {
      stop();
    }
  });

  it('patches node flags without replacing legacy nodes or legacy wire bindings', () => {
    const controller = unwrap_controller(create_document_controller(make_packed_document()));
    const fake = make_fake_easel();
    const stop = mount_document_bridge(fake.easel, controller);
    try {
      unwrap_view(controller.enter_subgraph('host'));
      const legacy_a = fake.easel.store.nodes.get('a');
      if (legacy_a == null) {
        throw new Error('expected legacy node after child mount');
      }
      fake.easel.store.nodes.put('a', { ...legacy_a, position: { x: 321, y: 654 } });
      fake.bindings.push({
        id: 'legacy_extra',
        source_id: 'b',
        source_handle: 'b_out',
        target_id: 'legacy_only_target',
        target_handle: 'in',
      });

      unwrap_view(controller.update_node('a', node => ({ ...node, muted: true })));
      expect(fake.easel.store.nodes.get('a')?.position).toEqual({ x: 321, y: 654 });
      expect(fake.bindings.map(binding => binding.id)).toContain('legacy_extra');
      expect(fake.easel.store.nodes.get('a')?.muted).toBe(true);
      expect(controller.document.nodes['a']?.muted).toBe(true);

      const extra_index = fake.bindings.findIndex(binding => binding.id === 'legacy_extra');
      if (extra_index !== -1) {
        fake.bindings.splice(extra_index, 1);
      }
      unwrap_view(controller.update_node('a', node => ({ ...node, pinned: true })));
      expect(fake.easel.store.nodes.get('a')?.position).toEqual({ x: 321, y: 654 });
      expect(fake.bindings.map(binding => binding.id)).not.toContain('legacy_extra');
      expect(fake.easel.store.nodes.get('a')?.muted).toBe(true);
      expect(fake.easel.store.nodes.get('a')?.pinned).toBe(true);
      expect(controller.document.nodes['a']?.pinned).toBe(true);
    } finally {
      stop();
    }
  });

  it('still full-syncs when the scope changes after a flag-only patch', () => {
    const controller = unwrap_controller(create_document_controller(make_packed_document()));
    const fake = make_fake_easel();
    const stop = mount_document_bridge(fake.easel, controller);
    try {
      unwrap_view(controller.enter_subgraph('host'));
      unwrap_view(controller.update_node('a', node => ({ ...node, muted: true })));
      expect(fake.easel.store.nodes.get('a')?.muted).toBe(true);

      fake.bindings.push({
        id: 'legacy_child_extra',
        source_id: 'a',
        source_handle: 'a_out',
        target_id: 'legacy_child_target',
        target_handle: 'in',
      });
      unwrap_view(controller.exit_subgraph());

      expect(fake.easel.store.nodes.get('a')).toBeUndefined();
      expect(fake.easel.store.nodes.get('source')).toBeDefined();
      expect(fake.bindings.map(binding => binding.id)).not.toContain('legacy_child_extra');
      expect(controller.document.nodes['a']?.muted).toBe(true);
    } finally {
      stop();
    }
  });
});
