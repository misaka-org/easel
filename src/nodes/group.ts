import { EaselNode } from '@/runtime/registry';
import type { GraphNode, State } from '@/core/types';
import { aabb_contains } from '@/core/math';
import { update_node_data, is_ancestor } from '@/core/node_ops';
import { apply_styles } from '@/utils/css';
import { set_inner_html } from '@/utils/dom';

export class GroupNode extends EaselNode {
  private header!: HTMLElement;
  private body!: HTMLElement;
  private is_editing = false;
  private current_title = '';

  mount(_node_data: GraphNode): void {
    this.container.classList.add('group-node');

    this.header = document.createElement('div');
    this.header.className = 'node-header group-header';

    this.body = document.createElement('div');
    this.body.className = 'node-body group-body';

    this.container.appendChild(this.header);
    this.container.appendChild(this.body);

    if (this.context.app_events) {
      this.context.app_events.on('nodes_dropped', this.on_nodes_dropped);
      this.context.app_events.on('node_dblclick', this.on_node_dblclick);
    }
  }

  on_node_dblclick = ({ node_id, target }: { node_id: string; target: HTMLElement }) => {
    if (node_id !== this.node_id) return;
    if (!target.closest('.group-header')) return;
    if (target.tagName === 'INPUT') return;

    this.is_editing = true;
    this.header.innerHTML = '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'group-title-input';
    input.value = this.current_title;
    apply_styles(input, {
      width: '100%',
      background: 'transparent',
      border: 'none',
      color: 'white',
      fontSize: '14px',
      fontWeight: 'bold',
      outline: 'none',
      fontFamily: 'inherit',
      pointerEvents: 'auto',
    });
    this.header.appendChild(input);
    input.focus();
    input.select();

    input.addEventListener('pointerdown', e => e.stopPropagation());

    const finish_edit = () => {
      if (!this.is_editing) return;
      this.is_editing = false;
      const new_title = input.value || 'Group';
      this.dispatch(s => update_node_data(s, this.node_id, n => ({ ...n, title: new_title })));
    };

    input.addEventListener('blur', finish_edit);
    input.addEventListener('keydown', ke => {
      if (ke.key === 'Enter') {
        input.blur();
      }
    });
  };

  on_nodes_dropped = (dropped_ids: string[]) => {
    this.dispatch(state => {
      const group = state.nodes[this.node_id];
      if (!group) return state;

      const group_rect = { pos: group.position, size: group.size };
      const children = new Set((group.custom_data['children'] as string[]) || []);

      let changed = false;
      for (const id of Object.keys(state.nodes)) {
        if (id === this.node_id) continue;
        const node = state.nodes[id];
        if (!node) continue;

        const is_inside = aabb_contains(group_rect.pos, group_rect.size, node.position, node.size);

        if (is_inside && !children.has(id)) {
          if (!is_ancestor(state.nodes, this.node_id, id)) {
            children.add(id);
            changed = true;
          }
        } else if (
          !is_inside &&
          children.has(id) &&
          (dropped_ids.includes(id) || dropped_ids.includes(this.node_id))
        ) {
          children.delete(id);
          changed = true;
        }
      }

      if (changed) {
        return update_node_data(state, this.node_id, n => ({
          ...n,
          custom_data: { ...n.custom_data, children: Array.from(children) },
        }));
      }
      return state;
    });
  };

  update(node_data: GraphNode, _state: State): void {
    this.current_title = node_data.title;
    if (!this.is_editing) {
      const title_html = `
        <span class="title-text">${node_data.title}</span>
      `;
      set_inner_html(this.header, title_html);
    }

    const hue = node_data.custom_data['hue'] ?? 210;
    apply_styles(this.container, {
      backgroundColor: `hsla(${hue}, 50%, 30%, 0.15)`,
      borderColor: `hsla(${hue}, 50%, 50%, 0.4)`,
    });
    apply_styles(this.header, {
      backgroundColor: `hsla(${hue}, 50%, 20%, 0.5)`,
      borderBottomColor: `hsla(${hue}, 50%, 50%, 0.4)`,
    });

    if (node_data.resizable !== false) {
      if (!this.container.querySelector('.node-resize-handle')) {
        const handle = document.createElement('div');
        handle.className = 'node-resize-handle';
        handle.dataset['action'] = 'resize';
        this.container.appendChild(handle);
      }
    }
  }

  unmount(): void {
    if (this.context.app_events) {
      this.context.app_events.off('nodes_dropped', this.on_nodes_dropped);
      this.context.app_events.off('node_dblclick', this.on_node_dblclick);
    }
    this.header.remove();
    this.body.remove();
  }
}
