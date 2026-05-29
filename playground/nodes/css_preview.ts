import { EaselNode, type NodeSpec } from '@/index';
import type { GraphNode, State } from '@/core/types';
import type { ExecuteContext } from '@/index';
import { set_inner_html } from '@/utils/dom';

export class CSSPreviewNode extends EaselNode {
  static node_spec: NodeSpec = {
    inputs: [{ id: 'css_in', label: 'CSS', type: 'input', value_type: 'text' }],
    outputs: [],
  };
  private header!: HTMLElement;
  private body!: HTMLElement;
  private ports_container!: HTMLElement;
  private preview_el!: HTMLElement;
  private cached_css = '';

  async execute({ node: _node, inputs }: ExecuteContext) {
    const css = (inputs['css_in'] as string) || '';
    this.dispatch(state => ({
      ...state,
      nodes: {
        ...state.nodes,
        [this.node_id]: {
          ...state.nodes[this.node_id],
          custom_data: {
            ...state.nodes[this.node_id].custom_data,
            display_css: css,
          },
        },
      },
    }));
    return {};
  }

  mount(node_data: GraphNode): void {
    this.container.style.minWidth = '360px';
    this.container.style.minHeight = '220px';

    this.header = document.createElement('div');
    this.header.className = 'node-header';

    this.body = document.createElement('div');
    this.body.className = 'node-body';
    this.body.style.display = 'flex';
    this.body.style.flexDirection = 'column';
    this.body.style.flex = '1';

    this.ports_container = document.createElement('div');
    this.ports_container.className = 'ports-container';

    this.preview_el = document.createElement('div');
    this.preview_el.style.cssText = `
      flex:1; min-height:160px; border-radius:8px; margin:6px;
      border:1px solid rgba(255,255,255,0.1);
      transition: background 0.15s ease;
      display:flex; align-items:center; justify-content:center;
      color:rgba(255,255,255,0.4); font-size:12px;
    `;
    this.preview_el.textContent = 'Connect and run to preview...';

    this.body.appendChild(this.ports_container);
    this.body.appendChild(this.preview_el);
    this.container.appendChild(this.header);
    this.container.appendChild(this.body);

    this.update(node_data, {} as State);
  }

  update(node_data: GraphNode, state: State): void {
    const hue = '#10b981';
    const title_html = `
      <div class="type-indicator" style="background:${hue};flex-shrink:0;margin-right:6px;"></div>
      <span class="title-text">${node_data.title}</span>
      <div style="flex:1"></div>
    `;
    set_inner_html(this.header, title_html);

    const is_connected = (_p_id: string) => false;

    const ports_html = (node_data.inputs || [])
      .map(p => {
        const cc = is_connected(p.id) ? 'connected' : '';
        return `<div class="port-row"><div class="port" data-port-id="${p.id}" data-port-type="input"><div class="port-dot port-type-text ${cc}"></div><span class="port-label">${p.label}</span></div><div></div></div>`;
      })
      .join('');
    set_inner_html(this.ports_container, ports_html);

    const css = node_data.custom_data?.['display_css'] as string;
    if (css && css !== this.cached_css) {
      this.cached_css = css;
      this.preview_el.style.background = css;
      this.preview_el.textContent = '';
    } else if (!css && this.cached_css !== '') {
      this.cached_css = '';
      this.preview_el.textContent = 'Connect and run to preview...';
    }
  }

  unmount(): void {
    this.header.remove();
    this.ports_container.remove();
    this.body.remove();
  }
}
