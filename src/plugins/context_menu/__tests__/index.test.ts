import { describe, it, expect, beforeEach } from 'vitest';
import { build_ns_menu } from '@/plugins/context_menu';
import { register_node_ns, register_node_type, get_node_ns } from '@/runtime/registry';
import { EaselNode } from '@/runtime/registry';

class StubNode extends EaselNode {
  mount() {}
  update() {}
  unmount() {}
}

describe('build_ns_menu', () => {
  // Use unique type names per test to avoid cross-contamination

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

    // Should have one root item: "Generate" with nested submenu
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

  it('places non-ns entries under "Other" when ns entries exist', () => {
    register_node_type('ns_test_x', StubNode);
    register_node_ns('ns_test_x', ['Cat']);

    const entries = [
      { type: 'ns_test_x', label: 'X', action: () => {} },
      { type: 'plain_y', label: 'Y', action: () => {} },
    ];
    const items = build_ns_menu(entries);

    // Single-level ns ('Cat') means items are flat.
    // Multi-level ns ('Gen/Image') creates submenu wrappers.
    expect(items.length).toBe(2);
    expect(items[0].id).toBe('add_ns_test_x');
    expect(items[0].label).toBe('X');
    expect(items[1].label).toBe('Other');
    expect(items[1].submenu?.length).toBe(1);
    expect(items[1].submenu![0].label).toBe('Y');
  });
});