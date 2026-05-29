import { EaselNode, type NodeSpec } from '@/index';
import type { GraphNode, State } from '@/core/types';
import type { ExecuteContext } from '@/index';
import { update_widget_value } from '@/core/node_ops';
import { set_inner_html } from '@/utils/dom';

export class ColorSourceNode extends EaselNode {
  static node_spec: NodeSpec = {
    inputs: [],
    outputs: [{ id: 'out', label: 'Color', type: 'output' }],
    widgets: [{ id: 'color', type: 'color', label: 'Color', value: '#ff0000' }],
  };
  private header!: HTMLElement;
  private body!: HTMLElement;
  private ports_container!: HTMLElement;
  private widgets_container!: HTMLElement;

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

    this.ports_container = document.createElement('div');
    this.ports_container.className = 'ports-container';

    this.widgets_container = document.createElement('div');
    this.widgets_container.className = 'widgets-container';
    this.widgets_container.style.display = 'flex';
    this.widgets_container.style.flexDirection = 'column';
    this.widgets_container.style.gap = '4px';

    this.body.appendChild(this.ports_container);
    this.body.appendChild(this.widgets_container);
    this.container.appendChild(this.header);
    this.container.appendChild(this.body);

    this.body.addEventListener('pointerdown', e => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) {
        e.stopPropagation();
      }
    });

    this.widgets_container.addEventListener('input', e => {
      const target = e.target as HTMLInputElement;
      const widget_id = target.dataset['widgetId'];
      if (widget_id) {
        this.dispatch(s => update_widget_value(s, this.node_id, widget_id, target.value));
      }
    });

    this.update(node_data, {} as State);
  }

  update(node_data: GraphNode, state: State): void {
    const hue = '#f97316';
    const title_html = `
      <div class="type-indicator" style="background:${hue};flex-shrink:0;margin-right:6px;"></div>
      <span class="title-text">${node_data.title}</span>
      <div style="flex:1"></div>
    `;
    set_inner_html(this.header, title_html);

    const ports_html = (node_data.outputs || [])
      .map(p => {
        const cc = '';
        return `<div class="port-row"><div></div><div class="port" data-port-id="${p.id}" data-port-type="output"><span class="port-label">${p.label}</span><div class="port-dot port-type-text ${cc}"></div></div></div>`;
      })
      .join('');
    set_inner_html(this.ports_container, ports_html);

    const widgets_schema = (node_data.widgets || []).map(w => `${w.id}:${w.type}`).join(',');
    if (this.widgets_container.dataset['schema'] !== widgets_schema) {
      const whtml = (node_data.widgets || [])
        .map(
          w =>
            `<div class="widget-row" style="display:flex;align-items:center;gap:8px;padding:4px 8px;">
          <span style="font-size:11px;min-width:36px;">${w.label}</span>
          <input type="color" data-widget-id="${w.id}" value="${w.value}" style="width:100%;height:32px;border:none;cursor:pointer;" />
        </div>`,
        )
        .join('');
      this.widgets_container.innerHTML = whtml;
      this.widgets_container.dataset['schema'] = widgets_schema;
    } else {
      (node_data.widgets || []).forEach(w => {
        const inp = this.widgets_container.querySelector(
          `[data-widget-id="${w.id}"]`,
        ) as HTMLInputElement;
        if (inp && inp.value !== String(w.value)) inp.value = String(w.value);
      });
    }
  }

  unmount(): void {
    this.header.remove();
    this.ports_container.remove();
    this.widgets_container.remove();
    this.body.remove();
  }
}
