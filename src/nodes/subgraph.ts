import { EaselNode } from '../runtime/registry';
import type { GraphNode, State } from '../core/types';

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

    this.body.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'BUTTON' && target.dataset['action'] === 'enter_subgraph') {
        if (this.context.app_events) {
          this.context.app_events.emit('enter_subgraph', { node_id: this.node_id });
        }
      }
    });

    this.update(node_data, { wires: {} } as State); // initial mock state
  }

  update(node_data: GraphNode, _state: State): void {
    if (this.header.textContent !== node_data.title) {
      this.header.textContent = node_data.title;
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

    const btn_html = `<div class="widget-row" style="margin-top:8px;"><button data-action="enter_subgraph">Enter Subgraph</button></div>`;
    const full_html = ports_html + btn_html;

    if (this.body.innerHTML !== full_html) {
      this.body.innerHTML = full_html;
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
    this.container.style.background = 'var(--primary-color)';
    this.body = document.createElement('div');
    this.body.className = 'node-body';
    this.container.appendChild(this.body);
    this.update(node_data, {} as State);
  }

  update(node_data: GraphNode, _state: State): void {
    this.body.innerHTML = `
      <div style="font-weight:bold; margin-bottom:8px;">Graph Input</div>
      ${node_data.outputs.map(p => `
        <div class="port-row">
          <div></div>
          <div class="port" data-port-id="${p.id}" data-port-type="output">
            <span class="port-label">${p.label}</span><div class="port-dot"></div>
          </div>
        </div>
      `).join('')}
    `;
  }

  unmount(): void { this.body.remove(); }
}

export class SubgraphOutputNode extends EaselNode {
  private body!: HTMLElement;

  mount(node_data: GraphNode): void {
    this.container.style.background = 'var(--port-color)';
    this.body = document.createElement('div');
    this.body.className = 'node-body';
    this.container.appendChild(this.body);
    this.update(node_data, {} as State);
  }

  update(node_data: GraphNode, _state: State): void {
    this.body.innerHTML = `
      <div style="font-weight:bold; margin-bottom:8px;">Graph Output</div>
      ${node_data.inputs.map(p => `
        <div class="port-row">
          <div class="port" data-port-id="${p.id}" data-port-type="input">
            <div class="port-dot"></div><span class="port-label">${p.label}</span>
          </div>
        </div>
      `).join('')}
    `;
  }

  unmount(): void { this.body.remove(); }
}