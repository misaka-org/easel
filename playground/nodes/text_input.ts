import { EaselNode, type NodeSpec } from '@/index';
import type { GraphNode, State } from '@/core/types';
import type { ExecuteContext } from '@/index';
import { update_widget_value } from '@/core/node_ops';
import { set_inner_html } from '@/utils/dom';

export class TextInputNode extends EaselNode {
  static node_spec: NodeSpec = {
    inputs: [],
    outputs: [{ id: 'query', label: 'Query', type: 'output', value_type: 'text' }],
    widgets: [{ id: 'value', type: 'text', label: 'Value', value: '', value_type: 'text' }],
  };
  private header!: HTMLElement;
  private body!: HTMLElement;
  private ports_container!: HTMLElement;
  private widgets_container!: HTMLElement;

  async execute({ node }: ExecuteContext) {
    const value = (node.widgets?.find(w => w.id === 'value')?.value as string) || '';
    return { query: value };
  }

  mount(node_data: GraphNode): void {
    this.container.style.minWidth = '220px';

    this.header = document.createElement('div');
    this.header.className = 'node-header';

    this.body = document.createElement('div');
    this.body.className = 'node-body';

    this.ports_container = document.createElement('div');
    this.ports_container.className = 'ports-container';

    this.widgets_container = document.createElement('div');
    this.widgets_container.className = 'widgets-container';

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

  update(node_data: GraphNode, _state: State): void {
    // Header
    const hue = (node_data.custom_data?.['color'] as string) || '#22c55e';
    const title_html = `
      <div class="type-indicator" style="background:${hue};flex-shrink:0;margin-right:6px;"></div>
      <span class="title-text">${node_data.title}</span>
      <div style="flex:1"></div>
    `;
    set_inner_html(this.header, title_html);

    // Ports
const ports_html = node_data.outputs
      .map(p => {
        const connected_class = '';
        return `
        <div class="port-row">
          <div></div>
          <div class="port" data-port-id="${p.id}" data-port-type="output">
            <span class="port-label">${p.label}</span><div class="port-dot port-type-text ${connected_class}"></div>
          </div>
        </div>
      `;
      })
      .join('');

    set_inner_html(this.ports_container, ports_html);

    // Widgets
    const widgets_html = (node_data.widgets || [])
      .map(w => {
        const is_connected = false;
        const disabled = is_connected ? 'disabled' : '';
        return `
          <div class="widget-row">
            <span class="port-label">${w.label}</span>
            <div class="widget-input-container">
              <input type="text" data-widget-id="${w.id}" value="${w.value}" ${disabled} />
            </div>
          </div>
        `;
      })
      .join('');

    // Schema: only changes when widget structure or connection state changes (not on every value edit)
    const widgets_schema = (node_data.widgets || [])
      .map(w => {
        const is_connected = false;
        return `${w.id}:${is_connected}`;
      })
      .join(',');

    if (this.widgets_container.dataset['schema'] !== widgets_schema) {
      // Rebuild DOM only when schema changes (structure / port connections)
      this.widgets_container.innerHTML = widgets_html;
      this.widgets_container.dataset['schema'] = widgets_schema;
    } else {
      // Schema unchanged – update values in-place without destroying focus
      node_data.widgets?.forEach(w => {
        const input = this.widgets_container.querySelector(
          `[data-widget-id="${w.id}"]`,
        ) as HTMLInputElement;
        if (input) {
          const current = input.value;
          const target = String(w.value);
          if (current !== target) {
            input.value = target;
          }
        }
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
