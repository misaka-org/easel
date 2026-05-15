import { EaselNode } from '@/runtime/registry';
import { update_widget_value } from '@/core/node_ops';
import type { ContextMenuContext, ContextMenuItem } from '@/plugins/context_menu/types';
import type { GraphNode, State } from '@/core/types';

/**
 * Demo node — shows how a node subclass can provide its own
 * context menu items via get_context_menu_items().
 *
 * Right-click on this node to see counter-specific actions
 * below the standard Delete / Duplicate items.
 */
export class CounterNode extends EaselNode {
  private body!: HTMLElement;
  private display!: HTMLElement;

  mount(node_data: GraphNode): void {
    this.body = document.createElement('div');
    this.body.className = 'node-body';
    this.body.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:12px;';

    this.display = document.createElement('div');
    this.display.style.cssText = [
      'font-size:32px;font-weight:bold;text-align:center;',
      'font-variant-numeric:tabular-nums;padding:12px 0;',
      'color:var(--text-color,#fafafa);',
    ].join('');
    this.display.textContent = '0';
    this.body.appendChild(this.display);

    this.container.appendChild(this.body);
    this.body.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  update(node_data: GraphNode, _state: State): void {
    const val = node_data.widgets?.find(w => w.id === 'value')?.value ?? 0;
    this.display.textContent = String(val);
    this.context._last_value = val;
  }

  unmount(): void {
    this.body.remove();
  }

  // -----------------------------------------------------------------------
  // Context menu: actions only for this node type.
  // The built-in __builtin_node_instance provider picks this up
  // automatically via duck-typing check.
  // -----------------------------------------------------------------------
  get_context_menu_items(_ctx: ContextMenuContext): readonly ContextMenuItem[] {
    const val = this.context._last_value ?? 0;

    return [
      // Non-interactive label showing node status
      {
        id: 'counter_info',
        kind: 'label',
        label: `Current: ${val}`,
        icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>',
      },
      {
        id: 'counter_reset',
        label: 'Reset to 0',
        icon: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
        action: () => {
          this.dispatch(s => update_widget_value(s, this.node_id, 'value', 0));
        },
      },
      {
        id: 'counter_inc',
        label: 'Increment +1',
        icon: '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
        action: () => {
          this.dispatch(s => {
            const cur = (s.nodes[this.node_id]?.widgets?.find(w => w.id === 'value')?.value as number) ?? 0;
            return update_widget_value(s, this.node_id, 'value', cur + 1);
          });
        },
      },
      {
        id: 'counter_dec',
        label: 'Decrement -1',
        icon: '<svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
        action: () => {
          this.dispatch(s => {
            const cur = (s.nodes[this.node_id]?.widgets?.find(w => w.id === 'value')?.value as number) ?? 0;
            return update_widget_value(s, this.node_id, 'value', cur - 1);
          });
        },
      },
      {
        id: 'counter_double',
        label: 'Double',
        group: 'extras',
        icon: '<svg viewBox="0 0 24 24"><polyline points="18,15 21,12 18,9"/><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>',
        action: () => {
          this.dispatch(s => {
            const cur = (s.nodes[this.node_id]?.widgets?.find(w => w.id === 'value')?.value as number) ?? 0;
            return update_widget_value(s, this.node_id, 'value', cur * 2);
          });
        },
      },
    ];
  }
}
