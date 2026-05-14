import { EaselNode } from '@/index';
import type { GraphNode, State } from '@/core/types';
import type { ExecuteContext } from '@/index';

export class CSSBuilderNode extends EaselNode {
  private header!: HTMLElement;
  private body!: HTMLElement;
  private portsContainer!: HTMLElement;

  async execute({ node, inputs }: ExecuteContext) {
    const c1 = (inputs['c1'] as string) || '';
    const c2 = (inputs['c2'] as string) || '';
    const c3 = (inputs['c3'] as string) || '';
    const c4 = (inputs['c4'] as string) || '';
    const angle = (inputs['angle'] as number) ?? 45;
    const type_g = (inputs['type_g'] as string) || 'linear';

    const stops = [c1, c2];
    if (c3) stops.push(c3);
    if (c4) stops.push(c4);

    let css: string;
    if (type_g === 'radial') {
      css = `radial-gradient(circle at center, ${stops.join(', ')})`;
    } else {
      css = `linear-gradient(${angle}deg, ${stops.join(', ')})`;
    }

    return { css_out: css };
  }

  mount(node_data: GraphNode): void {
    this.container.style.minWidth = '240px';

    this.header = document.createElement('div');
    this.header.className = 'node-header';

    this.body = document.createElement('div');
    this.body.className = 'node-body';

    this.portsContainer = document.createElement('div');
    this.portsContainer.className = 'ports-container';

    this.body.appendChild(this.portsContainer);
    this.container.appendChild(this.header);
    this.container.appendChild(this.body);

    this.update(node_data, { wires: {} } as State);
  }

  update(node_data: GraphNode, state: State): void {
    const hue = '#8b5cf6';
    const title_html = `
      <div class="type-indicator" style="background:${hue};flex-shrink:0;margin-right:6px;"></div>
      <span class="title-text">${node_data.title}</span>
      <div style="flex:1"></div>
    `;
    if (this.header.innerHTML !== title_html) this.header.innerHTML = title_html;

    const is_connected = (p_id: string) => Object.values(state.wires).some(
      w => (w.target_node_id === this.node_id && w.target_port_id === p_id) ||
           (w.source_node_id === this.node_id && w.source_port_id === p_id));

    const phtml = (() => {
      const rows: string[] = [];
      for (const p of node_data.inputs) {
        const cc = is_connected(p.id) ? 'connected' : '';
        rows.push(`<div class="port-row"><div class="port" data-port-id="${p.id}" data-port-type="input"><div class="port-dot port-type-text ${cc}"></div><span class="port-label">${p.label}</span></div><div></div></div>`);
      }
      for (const p of node_data.outputs) {
        const cc = is_connected(p.id) ? 'connected' : '';
        rows.push(`<div class="port-row"><div></div><div class="port" data-port-id="${p.id}" data-port-type="output"><span class="port-label">${p.label}</span><div class="port-dot port-type-text ${cc}"></div></div></div>`);
      }
      return rows.join('');
    })();
    if (this.portsContainer.innerHTML !== phtml) this.portsContainer.innerHTML = phtml;
  }

  unmount(): void { this.header.remove(); this.portsContainer.remove(); this.body.remove(); }
}
