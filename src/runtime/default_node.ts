import { EaselNode } from './registry';
import type { GraphNode } from '../core/types';
import { update_node_data, update_widget_value } from '../core/node_ops';

export class DefaultNode extends EaselNode {
  private header!: HTMLElement;
  private body!: HTMLElement;
  private ports_container!: HTMLElement;
  private widgets_container!: HTMLElement;

  mount(node_data: GraphNode): void {
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

    // Stop propagation so interacting with inputs doesn't drag the node
    this.body.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) {
        e.stopPropagation();
      }
    });

    this.widgets_container.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      const widget_id = target.dataset['widgetId'];
      if (widget_id) {
        let val: string | number | boolean = target.value;
        if (target.type === 'checkbox') val = target.checked;
        if (target.type === 'number') val = parseFloat(target.value);
        this.dispatch((s) => update_widget_value(s, this.node_id, widget_id, val));
      }
    });

    this.header.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement;
      if (target.dataset['action'] === 'toggle_collapse') {
        e.stopPropagation();
        this.dispatch(state => update_node_data(state, this.node_id, n => ({ ...n, collapsed: !n.collapsed })));
      }
    });
  }

  update(node_data: GraphNode, state: import('../core/types').State): void {
    const title_html = `
      <button data-action="toggle_collapse" class="collapse-btn">${node_data.collapsed ? '+' : '-'}</button>
      <span class="title-text">${node_data.title}</span>
      <div style="flex:1"></div>
    `;
    if (this.header.innerHTML !== title_html) {
      this.header.innerHTML = title_html;
    }

    const is_port_connected = (p_id: string) => Object.values(state.wires).some(
      wire => (wire.target_node_id === this.node_id && wire.target_port_id === p_id) || 
              (wire.source_node_id === this.node_id && wire.source_port_id === p_id)
    );

    const ports_html = [
      ...node_data.inputs.map(p => {
        const type_class = p.value_type ? `port-type-${p.value_type}` : '';
        const connected_class = is_port_connected(p.id) ? 'connected' : '';
        return `
        <div class="port-row">
          <div class="port" data-port-id="${p.id}" data-port-type="input">
            <div class="port-dot ${type_class} ${connected_class}"></div><span class="port-label">${p.label}</span>
          </div>
          <div></div>
        </div>
      `}),
      ...node_data.outputs.map(p => {
        const type_class = p.value_type ? `port-type-${p.value_type}` : '';
        const connected_class = is_port_connected(p.id) ? 'connected' : '';
        return `
        <div class="port-row">
          <div></div>
          <div class="port" data-port-id="${p.id}" data-port-type="output">
            <span class="port-label">${p.label}</span><div class="port-dot ${type_class} ${connected_class}"></div>
          </div>
        </div>
      `})
    ].join('');
    
    if (this.ports_container.innerHTML !== ports_html) {
      this.ports_container.innerHTML = ports_html;
    }

    let widgets_html = '';
    if (node_data.widgets) {
      widgets_html += node_data.widgets.map(w => {
        const is_connected = Object.values(state.wires).some(wire => wire.target_node_id === this.node_id && wire.target_port_id === w.id);
        const disabled = is_connected ? 'disabled' : '';
        const type_class = `port-type-${w.type}`;
        const connected_class = is_connected ? 'connected' : '';
        
        let input_html = '';
        if (w.type === 'text') input_html = `<input type="text" data-widget-id="${w.id}" value="${w.value}" ${disabled} />`;
        else if (w.type === 'number') input_html = `<input type="number" data-widget-id="${w.id}" value="${w.value}" min="${w.min ?? ''}" max="${w.max ?? ''}" ${disabled} />`;
        else if (w.type === 'boolean') input_html = `<input type="checkbox" data-widget-id="${w.id}" ${w.value ? 'checked' : ''} ${disabled} />`;

        return `
          <div class="port-row widget-row">
            <div class="port" data-port-id="${w.id}" data-port-type="input">
              <div class="port-dot ${type_class} ${connected_class}"></div>
              <label>${w.label}</label>
            </div>
            ${input_html}
          </div>
        `;
      }).join('');
    }

    const widgets_schema = (node_data.widgets?.map(w => {
      const is_connected = Object.values(state.wires).some(wire => wire.target_node_id === this.node_id && wire.target_port_id === w.id);
      return `${w.id}:${is_connected}`;
    }).join(',') || '');
    
    if (this.widgets_container.dataset['schema'] !== widgets_schema) {
      this.widgets_container.innerHTML = widgets_html;
      this.widgets_container.dataset['schema'] = widgets_schema;
      this.widgets_container.style.display = widgets_html ? 'flex' : 'none';
    } else {
      // Schema matched, safely update values without destroying DOM focus
      node_data.widgets?.forEach(w => {
        const input = this.widgets_container.querySelector(`[data-widget-id="${w.id}"]`) as HTMLInputElement;
        if (input) {
          if (w.type === 'boolean' && input.type === 'checkbox') {
            input.checked = w.value as boolean;
          } else if (input.value !== String(w.value)) {
            input.value = String(w.value);
          }
        }
      });
    }
    
    if (node_data.resizable && !node_data.collapsed) {
      if (!this.container.querySelector('.node-resize-handle')) {
        const handle = document.createElement('div');
        handle.className = 'node-resize-handle';
        handle.dataset['action'] = 'resize';
        this.container.appendChild(handle);
      }
    } else {
      const handle = this.container.querySelector('.node-resize-handle');
      if (handle) handle.remove();
    }
  }

  unmount(): void {
    this.header.remove();
    this.body.remove();
  }
}