import { EaselNode } from '@/runtime/registry';
import type { GraphNode, State } from '@/core/types';
import { remove_node } from '@/core/node_ops';
import { ICON_CHEVRON_RIGHT, ICON_X } from '@/icons';
import { set_inner_html } from '@/utils/dom';

export class SubgraphNode extends EaselNode {
  private header!: HTMLElement;
  private body!: HTMLElement;

  mount(node_data: GraphNode): void {
    this.header = document.createElement('div');
    this.header.className = 'node-header';

    this.body = document.createElement('div');
    this.body.className = 'node-body';

    this.container.appendChild(this.header);
    this.container.appendChild(this.body);

    this.header.addEventListener('pointerdown', e => {
      const target = e.target as HTMLElement;
      const action_el = target.closest('[data-action]') as HTMLElement | null;
      if (action_el) {
        e.stopPropagation();
        if (e.button !== 0) return;
        const action = action_el.dataset['action'];
        if (action === 'enter_subgraph') {
          if (this.context.app_events) {
            this.context.app_events.emit('enter_subgraph', { node_id: this.node_id });
          }
        } else if (action === 'delete') {
          this.dispatch(s => remove_node(s, this.node_id));
        }
      }
    });

    this.update(node_data, {} as State);
  }

  update(node_data: GraphNode, _state: State): void {
    const hue = node_data.custom_data['color'] || 'var(--primary-color)';
    const title_html = `
      <div class="type-indicator" style="background: ${hue}"></div>
      <span class="title-text">${node_data.title}</span>
      <div style="flex:1"></div>
      <div class="node-action-btn" data-action="enter_subgraph" title="Enter Subgraph">
        ${ICON_CHEVRON_RIGHT}
      </div>
      <div class="node-action-btn" data-action="delete" title="Delete">
        ${ICON_X}
      </div>
    `;
    set_inner_html(this.header, title_html);

    const ports_html = [
      ...node_data.inputs.map(
        p => `
        <div class="port-row">
          <div class="port" data-port-id="${p.id}" data-port-type="input">
            <div class="port-dot"></div><span class="port-label">${p.label}</span>
          </div>
          <div></div>
        </div>
      `,
      ),
      ...node_data.outputs.map(
        p => `
        <div class="port-row">
          <div></div>
          <div class="port" data-port-id="${p.id}" data-port-type="output">
            <span class="port-label">${p.label}</span><div class="port-dot"></div>
          </div>
        </div>
      `,
      ),
    ].join('');

    set_inner_html(this.body, ports_html);
  }

  unmount(): void {
    this.header.remove();
    this.body.remove();
  }
}

export class SubgraphInputNode extends EaselNode {
  private body!: HTMLElement;

  mount(node_data: GraphNode): void {
    this.container.classList.add('subgraph-input-stub');
    this.body = document.createElement('div');
    this.body.className = 'node-body';
    this.container.appendChild(this.body);
    this.update(node_data, {} as State);
  }

  update(node_data: GraphNode, _state: State): void {
    const html = node_data.outputs
      .map(
        p => `
      <div class="port" data-port-id="${p.id}" data-port-type="output">
        <span class="port-label">${p.label}</span><div class="port-dot"></div>
      </div>
    `,
      )
      .join('');
    set_inner_html(this.body, html);
  }

  unmount(): void {
    this.body.remove();
  }
}

export class SubgraphOutputNode extends EaselNode {
  private body!: HTMLElement;

  mount(node_data: GraphNode): void {
    this.container.classList.add('subgraph-output-stub');
    this.body = document.createElement('div');
    this.body.className = 'node-body';
    this.container.appendChild(this.body);
    this.update(node_data, {} as State);
  }

  update(node_data: GraphNode, _state: State): void {
    const html = node_data.inputs
      .map(
        p => `
      <div class="port" data-port-id="${p.id}" data-port-type="input">
        <div class="port-dot"></div><span class="port-label">${p.label}</span>
      </div>
    `,
      )
      .join('');
    set_inner_html(this.body, html);
  }

  unmount(): void {
    this.body.remove();
  }
}
