import { describe, expect, it } from 'vitest';
import type { GraphNode } from '@/core/types';
import type { Dispatch } from '@/runtime/store';
import { add_node } from '@/core/node_ops';
import { create_initial_state } from '@/core/state';
import {
  create_document_subgraph_controller,
  create_document_subgraph_document,
} from './scenes/scene_document_subgraph';
import {
  get_node_flag_context_menu_items,
  supports_node_flag,
  toggle_node_flag_for_context,
} from './node_flag_context_menu';
import { set_locale } from './i18n';
import { zh_messages } from './i18n/zh';

const make_node = (overrides: Partial<GraphNode> = {}): GraphNode => {
  return {
    id: 'node_1',
    type: 'default',
    position: { x: 0, y: 0 },
    size: { x: 100, y: 80 },
    title: 'Node 1',
    inputs: [],
    outputs: [],
    custom_data: {},
    ...overrides,
  };
};

describe('playground node flag context menu', () => {
  it('builds locale-aware mute, pin and lock items', () => {
    set_locale('en');
    const calls: string[] = [];
    const items = get_node_flag_context_menu_items('node_1', make_node(), flag => {
      calls.push(flag);
    });

    expect(items.map(item => item.label)).toEqual(['Mute', 'Pin', 'Lock']);
    items[0]?.action?.();
    items[1]?.action?.();
    items[2]?.action?.();
    expect(calls).toEqual(['muted', 'pinned', 'locked']);

    set_locale('zh');
    const chinese = get_node_flag_context_menu_items(
      'node_1',
      make_node({ muted: true, pinned: true, locked: true }),
      () => undefined,
    );
    expect(chinese.map(item => item.label)).toEqual([
      zh_messages.context_unmute,
      zh_messages.context_unpin,
      zh_messages.context_unlock,
    ]);
    set_locale('en');
  });

  it('excludes view-only boundary rails and legacy boundary stubs', () => {
    const rail = make_node({
      id: 'rail',
      type: 'subgraph_input',
      custom_data: { view_only: true, boundary_direction: 'input' },
    });
    const stub = make_node({ id: 'stub', type: 'subgraph_output' });

    expect(supports_node_flag(rail)).toBe(false);
    expect(supports_node_flag(stub)).toBe(false);
    expect(get_node_flag_context_menu_items('rail', rail, () => undefined)).toEqual([]);
    expect(get_node_flag_context_menu_items('stub', stub, () => undefined)).toEqual([]);
  });

  it('routes toggles through legacy dispatch', () => {
    let state = add_node(create_initial_state(), make_node());
    const dispatch: Dispatch = updater => {
      state = updater(state);
    };

    toggle_node_flag_for_context(undefined, dispatch, 'node_1', 'muted');
    expect(state.nodes['node_1']?.muted).toBe(true);

    toggle_node_flag_for_context(undefined, dispatch, 'node_1', 'pinned');
    expect(state.nodes['node_1']?.pinned).toBe(true);

    toggle_node_flag_for_context(undefined, dispatch, 'node_1', 'locked');
    expect(state.nodes['node_1']?.locked).toBe(true);

    toggle_node_flag_for_context(undefined, dispatch, 'node_1', 'muted');
    expect(state.nodes['node_1']?.muted).toBe(false);

    toggle_node_flag_for_context(undefined, dispatch, 'node_1', 'locked');
    expect(state.nodes['node_1']?.locked).toBe(false);
  });

  it('routes toggles into the active GraphDocument controller', () => {
    const controller = create_document_subgraph_controller({
      document: create_document_subgraph_document(),
    });
    expect(controller.view.nodes['source']).toBeDefined();

    const noop_dispatch: Dispatch = () => undefined;
    toggle_node_flag_for_context(controller, noop_dispatch, 'source', 'muted');
    toggle_node_flag_for_context(controller, noop_dispatch, 'source', 'pinned');
    toggle_node_flag_for_context(controller, noop_dispatch, 'source', 'locked');

    expect(controller.document.nodes['source']?.muted).toBe(true);
    expect(controller.document.nodes['source']?.pinned).toBe(true);
    expect(controller.document.nodes['source']?.locked).toBe(true);
    expect(controller.serialize({ pretty: true })).toContain('"muted": true');
    expect(controller.serialize({ pretty: true })).toContain('"pinned": true');
    expect(controller.serialize({ pretty: true })).toContain('"locked": true');
  });
});
