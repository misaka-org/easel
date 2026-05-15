import { EaselNode } from '@/index';
import type { GraphNode, State } from '@/core/types';
import type { ExecuteContext } from '@/index';
import { update_widget_value } from '@/core/node_ops';

export class ColorSourceNode extends EaselNode {
  private header!: HTMLElement;
  private body!: HTMLElement;
  private portsContainer!: HTMLElement;
  private widgetsContainer!: HTMLElement;

  async execute({ node }: ExecuteContext) {
    const color = (node.widgets?.find(w => w.id === 'color')?.value as string) || '#ff0000';
    return { out: color };
  }

  mount(node_data: GraphNode): void {
    this.container.style.minWidth = '200px';

    this.header = document.createElement('div');
    this.header.className = 'node-header';

    this.body = document.createElement('div');
    this.body.className = 'node-body';

    this.portsContainer = document.createElement('div');
    this.portsContainer.className = 'ports-container';

    this.widgetsContainer = document.createElement('div');
    this.widgetsContainer.className = 'widgets-container';
    this.widgetsContainer.style.display = 'flex';
    this.widgetsContainer.style.flexDirection = 'column';
    this.widgetsContainer.style.gap = '4px';

    this.body.appendChild(this.portsContainer);
    this.body.appendChild(this.widgetsContainer);
    this.container.appendChild(this.header);
    this.container.appendChild(this.body);

    this.body.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) {
        e.stopPropagation();
      }
    });

    this.widgetsContainer.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      const widget_id = target.dataset['widgetId'];
      if (widget_id) {
        this.dispatch(s => update_widget_value(s, this.node_id, widget_id, target.value));
      }
    });

    this.update(node_data, { wires: {} } as State);
  }

  update(node_data: GraphNode, state: State): void {
    const hue = '#f97316';
    const title_html = `
      <div class="type-indicator" style="background:${hue};flex-shrink:0;margin-right:6px;"></div>
      <span class="title-text">${node_data.title}</span>
      <div style="flex:1"></div>
    `;
    if (this.header.innerHTML !== title_html) this.header.innerHTML = title_html;

    const is_port_connected = (p_id: string) => Object.values(state.wires).some(
      w => (w.target_node_id === this.node_id && w.target_port_id === p_id) ||
           (w.source_node_id === this.node_id && w.source_port_id === p_id));

    const ports_html = (node_data.outputs || []).map(p => {
      const cc = is_port_connected(p.id) ? 'connected' : '';
      return `<div class="port-row"><div></div><div class="port" data-port-id="${p.id}" data-port-type="output"><span class="port-label">${p.label}</span><div class="port-dot port-type-text ${cc}"></div></div></div>`;
    }).join('');
    if (this.portsContainer.innerHTML !== ports_html) this.portsContainer.innerHTML = ports_html;

    const widgets_schema = (node_data.widgets || []).map(w => `${w.id}:${w.type}`).join(',');
    if (this.widgetsContainer.dataset['schema'] !== widgets_schema) {
      const whtml = (node_data.widgets || []).map(w =>
        `<div class="widget-row" style="display:flex;align-items:center;gap:8px;padding:4px 8px;">
          <span style="font-size:11px;min-width:36px;">${w.label}</span>
          <input type="color" data-widget-id="${w.id}" value="${w.value}" style="width:100%;height:32px;border:none;cursor:pointer;" />
        </div>`
      ).join('');
      this.widgetsContainer.innerHTML = whtml;
      this.widgetsContainer.dataset['schema'] = widgets_schema;
    } else {
      (node_data.widgets || []).forEach(w => {
        const inp = this.widgetsContainer.querySelector(`[data-widget-id="${w.id}"]`) as HTMLInputElement;
        if (inp && inp.value !== String(w.value)) inp.value = String(w.value);
      });
    }
  }

  unmount(): void {
    this.header.remove(); this.portsContainer.remove(); this.widgetsContainer.remove(); this.body.remove();
  }
}
