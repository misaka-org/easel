import { EaselNode } from '@/index';
import type { GraphNode, State } from '@/core/types';
import { update_widget_value } from '@/core/node_ops';

import type { ExecuteContext } from '@/index';

export class MathNode extends EaselNode {
  async execute({ node, inputs, report_progress }: ExecuteContext) {
    report_progress(30);
    await new Promise((r) => setTimeout(r, 500));
    report_progress(60);
    await new Promise((r) => setTimeout(r, 500));
    
    const a = Number(inputs['a'] || 0);
    const b = Number(inputs['b'] || 0);
    
    const op = node.custom_data['operation'] || 'add';
    const res = op === 'add' ? a + b : 0;
    
    report_progress(100);
    return { out: res };
  }

  private body!: HTMLElement;
  private header!: HTMLElement;

  mount(node_data: GraphNode): void {
    this.header = document.createElement('div');
    this.header.className = 'node-header';
    this.body = document.createElement('div');
    this.body.className = 'node-body';
    
    this.container.appendChild(this.header);
    this.container.appendChild(this.body);
    this.update(node_data, { wires: {} } as State);
  }

  update(node_data: GraphNode, state: State): void {
    if (this.header.textContent !== node_data.title) {
      this.header.textContent = node_data.title;
    }

    const html = `
      ${node_data.inputs.map(p => `
        <div class="port-row">
          <div class="port" data-port-id="${p.id}" data-port-type="input">
            <div class="port-dot"></div><span class="port-label">${p.label}</span>
          </div>
        </div>
      `).join('')}
      ${node_data.outputs.map(p => `
        <div class="port-row">
          <div></div>
          <div class="port" data-port-id="${p.id}" data-port-type="output">
            <span class="port-label">${p.label}</span><div class="port-dot"></div>
          </div>
        </div>
      `).join('')}
      <div style="margin-top: 8px; font-weight: bold; text-align: center;">
        Val: ${node_data.custom_data['result'] ?? '?'}
      </div>
    `;

    if (this.body.innerHTML !== html) {
      this.body.innerHTML = html;
    }
  }

  unmount(): void {
    this.header.remove();
    this.body.remove();
  }
}