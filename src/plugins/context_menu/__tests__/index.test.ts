// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { build_ns_menu, context_menu_plugin } from '@/plugins/context_menu';
import { register_node_ns, register_node_type, EaselNode } from '@/runtime/registry';

class StubNode extends EaselNode {
  mount() {}
  update() {}
  unmount() {}
}

describe('build_ns_menu', () => {
  it('returns flat list when no ns is registered', () => {
    const entries = [
      { type: 'node_a', label: 'Node A', action: () => {} },
      { type: 'node_b', label: 'Node B', action: () => {} },
    ];
    const items = build_ns_menu(entries);
    expect(items.length).toBe(2);
    expect(items[0].id).toBe('add_node_a');
    expect(items[1].id).toBe('add_node_b');
  });

  it('groups entries by namespace into submenus', () => {
    register_node_type('ns_test_img', StubNode);
    register_node_type('ns_test_txt', StubNode);
    register_node_ns('ns_test_img', ['Generate', 'Image']);
    register_node_ns('ns_test_txt', ['Generate', 'Text']);

    const entries = [
      { type: 'ns_test_img', label: 'Image', action: () => {} },
      { type: 'ns_test_txt', label: 'Text', action: () => {} },
    ];
    const items = build_ns_menu(entries);

    expect(items.length).toBe(1);
    expect(items[0].label).toBe('Generate');
    expect(items[0].submenu).toBeDefined();
    expect(items[0].submenu!.length).toBe(2);

    const sub = items[0].submenu!;
    const imageItem = sub.find(i => i.id === 'add_ns_test_img');
    const textItem = sub.find(i => i.id === 'add_ns_test_txt');
    expect(imageItem).toBeDefined();
    expect(textItem).toBeDefined();
    expect(imageItem!.label).toBe('Image');
    expect(textItem!.label).toBe('Text');
  });

  it('places non-ns entries under Other when ns entries exist', () => {
    register_node_type('ns_test_x', StubNode);
    register_node_ns('ns_test_x', ['Cat']);

    const entries = [
      { type: 'ns_test_x', label: 'X', action: () => {} },
      { type: 'plain_y', label: 'Y', action: () => {} },
    ];
    const items = build_ns_menu(entries);

    expect(items.length).toBe(2);
    expect(items[0].id).toBe('add_ns_test_x');
    expect(items[0].label).toBe('X');
    expect(items[1].label).toBe('Other');
    expect(items[1].submenu?.length).toBe(1);
    expect(items[1].submenu![0].label).toBe('Y');
  });
});

describe('built-in providers', () => {
  function createMockEasel(extra: Record<string, any> = {}) {
    const container = document.createElement('div');
    const mt = () => ({
      get: () => undefined,
      list: () => [],
      keys: () => [],
      put: () => true,
      delete() {},
      has: () => false,
      on_before_change: () => () => {},
      on_after_change: () => () => {},
    });
    return {
      container,
      plugin_data: {} as any,
      dispatch: vi.fn(),
      app_events: { on: vi.fn(), emit: vi.fn(), off: vi.fn() },
      node_events: new Map(),
      store: {
        state: { value: {} },
        dispatch: vi.fn(),
        nodes: mt() as any,
        bindings: mt() as any,
        serialize: () => ({}),
        transact: (fn: any) => fn(),
      },
      camera: {
        set: vi.fn(),
        animate_to: vi.fn(),
        cancel: vi.fn(),
        zoom_in: vi.fn(),
        zoom_out: vi.fn(),
        zoom_reset: vi.fn(),
        fit_to_view: vi.fn(),
        is_animating: false,
      } as any,
      set_theme: vi.fn(),
      tools: { register: vi.fn(), activate: vi.fn(), get: vi.fn(), list: vi.fn(() => []) },
      state: {
        value: {
          nodes: {},
          bindings: {},
          camera: { position: { x: 0, y: 0 }, zoom: 1 },
          selected_node_ids: [],
          active_tool: 'select',
        },
      } as any,
      node_instances: new Map(),
      get_node_instance: vi.fn(),
      register: {
        add_node: vi.fn(),
        add_node_spec: vi.fn(),
        add_node_ns: vi.fn(),
        add_widget: vi.fn(),
      },
      keybindings: { register: vi.fn() },
      theme: {},
      ...extra,
    } as any;
  }

  it('registers service on plugin_data', () => {
    const easel = createMockEasel();
    context_menu_plugin.setup(easel);
    const service = easel.plugin_data.context_menu;
    expect(service).toBeDefined();
  });

  it('node_ops_provider returns delete/duplicate for a regular node', () => {
    const easel = createMockEasel();
    context_menu_plugin.setup(easel);
    const service = easel.plugin_data.context_menu;
    const items = service.collect({
      node_id: 'test_node',
      node_type: 'custom',
      screen_pos: { x: 0, y: 0 },
      world_pos: { x: 0, y: 0 },
      container: easel.container,
    });
    expect(items.some((i: any) => i.id === 'delete_node')).toBe(true);
    expect(items.some((i: any) => i.id === 'duplicate_node')).toBe(true);
  });

  it('node_ops_provider returns empty for subgraph_input node', () => {
    const easel = createMockEasel();
    context_menu_plugin.setup(easel);
    const service = easel.plugin_data.context_menu;
    const items = service.collect({
      node_id: 'sub_in',
      node_type: 'subgraph_input',
      screen_pos: { x: 0, y: 0 },
      world_pos: { x: 0, y: 0 },
      container: easel.container,
    });
    expect(items.some((i: any) => i.id === 'delete_node')).toBe(false);
  });

  it('canvas_ops_provider returns items when no node targeted', () => {
    const easel = createMockEasel();
    context_menu_plugin.setup(easel);
    const service = easel.plugin_data.context_menu;
    const items = service.collect({
      node_id: undefined,
      screen_pos: { x: 0, y: 0 },
      world_pos: { x: 0, y: 0 },
      container: easel.container,
    });
    expect(items.some((i: any) => i.id === 'reset_camera')).toBe(true);
    expect(items.some((i: any) => i.id === 'clear_wires')).toBe(true);
  });

  it('canvas_ops_provider returns empty when node targeted', () => {
    const easel = createMockEasel();
    context_menu_plugin.setup(easel);
    const service = easel.plugin_data.context_menu;
    const items = service.collect({
      node_id: 'some_node',
      node_type: 'test',
      screen_pos: { x: 0, y: 0 },
      world_pos: { x: 0, y: 0 },
      container: easel.container,
    });
    expect(items.some((i: any) => i.id === 'reset_camera')).toBe(false);
    expect(items.some((i: any) => i.id === 'clear_wires')).toBe(false);
  });

  it('canvas clear wires removes only unlocked bindings', () => {
    const nodes = [
      { id: 'free_source', locked: false },
      { id: 'locked_source', locked: true },
      { id: 'locked_target', locked: true },
    ];
    const bindings = [
      { id: 'free', source_id: 'free_source', target_id: 'free_target' },
      { id: 'source_locked', source_id: 'locked_source', target_id: 'free_target' },
      { id: 'target_locked', source_id: 'free_source', target_id: 'locked_target' },
    ];
    const removed: string[] = [];
    const easel = createMockEasel({
      plugin_data: {
        wire: {
          get_bindings: () => bindings.slice(),
          remove_binding: (id: string) => removed.push(id),
        },
      },
      store: {
        nodes: {
          list: () => nodes,
        },
      },
    });
    context_menu_plugin.setup(easel);
    const service = easel.plugin_data.context_menu;
    const items = service.collect({
      node_id: undefined,
      screen_pos: { x: 0, y: 0 },
      world_pos: { x: 0, y: 0 },
      container: easel.container,
    });
    const clear = items.find((item: any) => item.id === 'clear_wires');
    expect(clear).toBeDefined();
    clear?.action?.();
    expect(removed).toEqual(['free']);
  });

  it('node_instance_provider delegates to get_context_menu_items', () => {
    const getContextItems = vi
      .fn()
      .mockReturnValue([{ id: 'custom_item', label: 'Custom', action: vi.fn() }]);
    const nodeInstances = new Map();
    nodeInstances.set('test_node', { inst: { get_context_menu_items: getContextItems } });

    const easel = createMockEasel({ node_instances: nodeInstances });
    context_menu_plugin.setup(easel);
    const service = easel.plugin_data.context_menu;
    const items = service.collect({
      node_id: 'test_node',
      node_type: 'custom',
      screen_pos: { x: 0, y: 0 },
      world_pos: { x: 0, y: 0 },
      container: easel.container,
    });
    expect(getContextItems).toHaveBeenCalled();
    expect(items.some((i: any) => i.id === 'custom_item')).toBe(true);
  });

  it('add_node_provider returns Add Node item with submenu', () => {
    const easel = createMockEasel();
    context_menu_plugin.setup(easel);
    const service = easel.plugin_data.context_menu;
    const items = service.collect({
      node_id: undefined,
      screen_pos: { x: 0, y: 0 },
      world_pos: { x: 0, y: 0 },
      container: easel.container,
    });
    const addNode = items.find((i: any) => i.id === 'add_node');
    expect(addNode).toBeDefined();
    expect(addNode.label).toBe('Add Node');
    expect(addNode.submenu).toBeDefined();
  });

  it('injects menu styles that cap width and wrap long labels', () => {
    const easel = createMockEasel();
    context_menu_plugin.setup(easel);

    const style_el = easel.container.querySelector(
      '#easel-context-menu-style',
    ) as HTMLStyleElement | null;
    const css = style_el?.textContent ?? '';

    const menu_rule = css.match(/\.easel-context-menu\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(menu_rule).toContain('max-width: min(320px, 100%);');

    const item_label_rule = css.match(/\.easel-context-menu-item-label\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(item_label_rule).toContain('min-width: 0;');
    expect(item_label_rule).toContain('overflow-wrap: anywhere;');

    const label_text_rule = css.match(/\.easel-context-menu-label-text\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(label_text_rule).toContain('min-width: 0;');
    expect(label_text_rule).toContain('overflow-wrap: anywhere;');

    expect(css).not.toContain('white-space: nowrap');
  });
});
