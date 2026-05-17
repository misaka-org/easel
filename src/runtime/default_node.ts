import { EaselNode } from './registry';
import type { GraphNode, State } from '@/core/types';
import { update_node_data, update_widget_value, remove_node } from '@/core/node_ops';
import { get_widget_type } from './register';
import { ICON_X } from '@/icons';
import { set_inner_html } from '@/utils/dom';

export class DefaultNode extends EaselNode {
  private header!: HTMLElement;
  private body!: HTMLElement;
  private ports_container!: HTMLElement;
  private widgets_container!: HTMLElement;
  private widget_elements = new Map<string, HTMLElement>();
  private last_widget_schema = '';

  mount(_node_data: GraphNode): void {
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

    // Widget input handler - uses dataset.widgetType to find the parse function
    this.widgets_container.addEventListener('input', (e) => {
      const target = e.target as HTMLElement;
      const widget_id = target.dataset['widgetId'];
      if (!widget_id) return;
      const widget_type = target.dataset['widgetType'];
      if (!widget_type) return;
      const def = get_widget_type(widget_type);
      if (def?.parse) {
        const val = def.parse(target);
        this.dispatch((s) => update_widget_value(s, this.node_id, widget_id, val));
      }
    });

    this.header.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement;
      const action_el = target.closest('[data-action]') as HTMLElement | null;
      if (action_el) {
        e.stopPropagation();
        if (e.button !== 0) return;
        const action = action_el.dataset['action'];
        if (action === 'toggle_collapse') {
          this.dispatch(state => update_node_data(state, this.node_id, n => ({ ...n, collapsed: !n.collapsed })));
        } else if (action === 'delete') {
          this.dispatch(s => remove_node(s, this.node_id));
        }
      }
    });
  }

  update(node_data: GraphNode, state: State): void {
    this.update_header(node_data);
    this.update_ports(node_data, state);
    this.update_widgets(node_data, state);
    this.update_resize_handle(node_data);
  }

  protected update_header(node_data: GraphNode): void {
    const hue = (node_data.custom_data['color'] as string) || 'var(--primary-color)';
    const title_html = `
      <div class="type-indicator" data-action="toggle_collapse" style="background: ${hue}; flex-shrink: 0; margin-right: 6px;"></div>
      <span class="title-text">${node_data.title}</span>
      <div style="flex:1"></div>
      <div class="node-action-btn" data-action="delete" title="Delete">
        ${ICON_X}
      </div>
    `;
    set_inner_html(this.header, title_html);
  }

  protected update_ports(node_data: GraphNode, state: State): void {
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

    set_inner_html(this.ports_container, ports_html);
  }

  protected update_widgets(node_data: GraphNode, state: State): void {
    const widgets = node_data.widgets || [];

    // Build schema: widget id + type + connection state
    const schema = widgets.map(w => {
      const connected = Object.values(state.wires).some(
        wire => wire.target_node_id === this.node_id && wire.target_port_id === w.id
      );
      return `${w.id}:${w.type}:${connected}`;
    }).join(',');

    if (schema !== this.last_widget_schema) {
      // Schema changed -> rebuild widget DOM
      this.last_widget_schema = schema;
      this.widget_elements.clear();
      this.widgets_container.innerHTML = '';

      for (const w of widgets) {
        const def = get_widget_type(w.type);
        if (!def) continue;
        const el = def.create(w);
        // Initialize widget value on creation (update() called later for incremental sync)
        def.update(el, w, { connected: false, disabled: false });
        // Tag element so input handler can find widget type without state lookup
        el.dataset.widgetType = w.type;
        // Tag child elements too (e.g. switch inner input)
        el.querySelectorAll('[data-widget-id]').forEach((child) => {
          (child as HTMLElement).dataset.widgetType = w.type;
        });
        this.widget_elements.set(w.id, el);

        // Wrapper row for consistent layout
        const row = document.createElement('div');
        row.className = 'widget-row';
        const connected = Object.values(state.wires).some(
          wire => wire.target_node_id === this.node_id && wire.target_port_id === w.id
        );
        const type_class = `port-type-${w.type}`;
        const connected_class = connected ? 'connected' : '';

        // Port dot + label on the left, widget input on the right
        const label_html = `
          <div class="port" data-port-id="${w.id}" data-port-type="input">
            <div class="port-dot ${type_class} ${connected_class}"></div>
            <span class="port-label">${w.label}</span>
          </div>
        `;
        const label_wrapper = document.createElement('div');
        label_wrapper.innerHTML = label_html;
        row.appendChild(label_wrapper.firstElementChild || label_wrapper);

        const input_wrapper = document.createElement('div');
        input_wrapper.className = 'widget-input-container';
        input_wrapper.appendChild(el);
        row.appendChild(input_wrapper);
        this.widgets_container.appendChild(row);
      }
      this.widgets_container.style.display = widgets.length > 0 ? 'flex' : 'none';
    } else {
      // Schema unchanged -> update values in-place without destroying focus
      for (const w of widgets) {
        const el = this.widget_elements.get(w.id);
        if (!el) continue;
        const def = get_widget_type(w.type);
        if (!def) continue;
        const connected = Object.values(state.wires).some(
          wire => wire.target_node_id === this.node_id && wire.target_port_id === w.id
        );
        def.update(el, w, { connected, disabled: connected });
      }
    }
  }

  protected update_resize_handle(node_data: GraphNode): void {
    if ((node_data.resizable !== false) && !node_data.collapsed) {
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
    this.widget_elements.clear();
  }
}
