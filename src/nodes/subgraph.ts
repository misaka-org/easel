import { EaselNode } from '../runtime/registry';
import type { GraphNode, State } from '../core/types';
import { update_node_data, remove_node } from '../core/node_ops';

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

    this.header.addEventListener('pointerdown', (e) => {
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

    this.update(node_data, { wires: {} } as State);
  }

  update(node_data: GraphNode, _state: State): void {
    const hue = node_data.custom_data['color'] || 'var(--primary-color)';
    const title_html = `
      <div class="type-indicator" style="background: ${hue}"></div>
      <span class="title-text">${node_data.title}</span>
      <div style="flex:1"></div>
      <div class="node-action-btn" data-action="enter_subgraph" title="Enter Subgraph">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </div>
      <div class="node-action-btn" data-action="delete" title="Delete">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </div>
    `;
    if (this.header.innerHTML !== title_html) {
      this.header.innerHTML = title_html;
    }

    const ports_html = [
      ...node_data.inputs.map(p => `
        <div class="port-row">
          <div class="port" data-port-id="${p.id}" data-port-type="input">
            <div class="port-dot"></div><span class="port-label">${p.label}</span>
          </div>
          <div></div>
        </div>
      `),
      ...node_data.outputs.map(p => `
        <div class="port-row">
          <div></div>
          <div class="port" data-port-id="${p.id}" data-port-type="output">
            <span class="port-label">${p.label}</span><div class="port-dot"></div>
          </div>
        </div>
      `)
    ].join('');

    if (this.body.innerHTML !== ports_html) {
      this.body.innerHTML = ports_html;
    }
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
    const html = node_data.outputs.map(p => `
      <div class="port" data-port-id="${p.id}" data-port-type="output">
        <div class="port-dot"></div><span class="port-label">${p.label}</span>
      </div>
    `).join('');
    if (this.body.innerHTML !== html) {
      this.body.innerHTML = html;
    }
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
    const html = node_data.inputs.map(p => `
      <div class="port" data-port-id="${p.id}" data-port-type="input">
        <div class="port-dot"></div><span class="port-label">${p.label}</span>
      </div>
    `).join('');
    if (this.body.innerHTML !== html) {
      this.body.innerHTML = html;
    }
  }

  unmount(): void {
    this.body.remove();
  }
}