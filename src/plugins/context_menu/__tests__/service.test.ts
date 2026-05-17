// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContextMenuService } from '@/plugins/context_menu/service';
import type { ContextMenuContext } from '@/plugins/context_menu/types';
import { vec2_create } from '@/core/math';

function makeCtx(overrides: Partial<ContextMenuContext> = {}): ContextMenuContext {
  return {
    screen_pos: vec2_create(0, 0),
    world_pos: vec2_create(0, 0),
    container: document.createElement('div'),
    ...overrides,
  };
}

describe('ContextMenuService', () => {
  let container: HTMLElement;
  let service: ContextMenuService;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    service = new ContextMenuService(container);
  });

  afterEach(() => {
    service.hide();
    container.remove();
  });

  it('register adds provider and returns unregister fn', () => {
    const unreg = service.register({ id: 't', get_items: () => [] });
    expect(unreg).toBeTypeOf('function');
    unreg();
  });

  it('unregister removes provider', () => {
    service.register({
      id: 't',
      get_items: ctx => (ctx.node_id ? [{ id: 'x', label: 'X', action: () => {} }] : []),
    });
    service.unregister('t');
    service.show(makeCtx({ node_id: 'n1' }), vec2_create(0, 0));
    expect(service.menu_element.children.length).toBe(0);
  });

  it('show creates menu items', () => {
    service.register({
      id: 't',
      get_items: () => [{ id: 'a', label: 'Item A', action: () => {} }],
    });
    service.show(makeCtx(), vec2_create(10, 10));
    expect(service.menu_element.style.display).toBe('flex');
    expect(service.menu_element.children.length).toBe(1);
    expect(service.menu_element.children[0].textContent).toContain('Item A');
  });

  it('collect sorts providers by priority descending', () => {
    // collect() iterates twice (exclusive check then normal collect), so providers
    // are called in priority order in each pass
    const order: string[] = [];
    service.register({
      id: 'low',
      priority: 0,
      get_items: () => {
        order.push('low');
        return [{ id: 'a', label: 'A', action: () => {} }];
      },
    });
    service.register({
      id: 'high',
      priority: 100,
      get_items: () => {
        order.push('high');
        return [{ id: 'b', label: 'B', action: () => {} }];
      },
    });
    service.show(makeCtx(), vec2_create(0, 0));
    // Each of the two passes iterates high first, then low
    expect(order.slice(0, 2)).toEqual(['high', 'low']);
    expect(order.slice(2, 4)).toEqual(['high', 'low']);
  });

  it('exclusive provider replaces all others', () => {
    service.register({
      id: 'normal',
      get_items: () => [{ id: 'n', label: 'Normal', action: () => {} }],
    });
    service.register({
      id: 'excl',
      exclusive: true,
      get_items: () => [{ id: 'o', label: 'Only', action: () => {} }],
    });
    service.show(makeCtx(), vec2_create(0, 0));
    expect(service.menu_element.children.length).toBe(1);
    expect(service.menu_element.children[0].textContent).toContain('Only');
  });

  it('hide closes the menu', () => {
    service.register({ id: 't', get_items: () => [{ id: 'x', label: 'X', action: () => {} }] });
    service.show(makeCtx(), vec2_create(0, 0));
    expect(service.menu_element.style.display).toBe('flex');
    service.hide();
    expect(service.menu_element.style.display).toBe('none');
    expect(service.menu_element.innerHTML).toBe('');
  });

  it('inserts separators on group change', () => {
    service.register({
      id: 't',
      get_items: () => [
        { id: 'a', label: 'A', group: 'g1', action: () => {} },
        { id: 'b', label: 'B', group: 'g2', action: () => {} },
      ],
    });
    service.show(makeCtx(), vec2_create(0, 0));
    // 2 items + 1 separator = 3 children
    expect(service.menu_element.children.length).toBe(3);
    expect(service.menu_element.children[1].className).toContain('separator');
  });

  it('label items use label element class', () => {
    service.register({
      id: 't',
      get_items: () => [
        { id: 'l', kind: 'label', label: 'My Label' },
        { id: 'a', label: 'Action', action: () => {} },
      ],
    });
    service.show(makeCtx(), vec2_create(0, 0));
    expect(service.menu_element.children[0].className).toContain('label');
    expect(service.menu_element.children[1].className).toContain('item');
  });

  it('items with submenu get arrow indicator', () => {
    service.register({
      id: 't',
      get_items: () => [
        { id: 'm', label: 'Menu', submenu: [{ id: 'c', label: 'Child', action: () => {} }] },
      ],
    });
    service.show(makeCtx(), vec2_create(0, 0));
    expect(service.menu_element.querySelector('.easel-context-menu-item-arrow')).toBeTruthy();
  });

  it('disabled items do not respond to clicks', () => {
    const action = vi.fn();
    service.register({
      id: 't',
      get_items: () => [{ id: 'd', label: 'Disabled', disabled: true, action }],
    });
    service.show(makeCtx(), vec2_create(0, 0));
    const el = service.menu_element.children[0] as HTMLElement;
    expect(el.className).toContain('disabled');
    el.click();
    expect(action).not.toHaveBeenCalled();
  });

  it('positioning clamps to container bounds', () => {
    service.show(makeCtx(), vec2_create(-100, -100));
    const left = parseInt(service.menu_element.style.left);
    const top = parseInt(service.menu_element.style.top);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(top).toBeGreaterThanOrEqual(0);
  });
});
