import { EaselNode } from '@/index';
import type { GraphNode, State } from '@/core/types';
import type { ExecuteContext } from '@/index';

export class CSSPreviewNode extends EaselNode {
  private header!: HTMLElement;
  private body!: HTMLElement;
  private portsContainer!: HTMLElement;
  private previewEl!: HTMLElement;
  private cachedCss = '';

  async execute({ node, inputs }: ExecuteContext) {
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

    this.portsContainer = document.createElement('div');
    this.portsContainer.className = 'ports-container';

    this.previewEl = document.createElement('div');
    this.previewEl.style.cssText = `
      flex:1; min-height:160px; border-radius:8px; margin:6px;
      border:1px solid rgba(255,255,255,0.1);
      transition: background 0.15s ease;
      display:flex; align-items:center; justify-content:center;
      color:rgba(255,255,255,0.4); font-size:12px;
    `;
    this.previewEl.textContent = 'Connect and run to preview...';

    this.body.appendChild(this.portsContainer);
    this.body.appendChild(this.previewEl);
    this.container.appendChild(this.header);
    this.container.appendChild(this.body);

    this.update(node_data, { wires: {} } as State);
  }

  update(node_data: GraphNode, state: State): void {
    const hue = '#10b981';
    const title_html = `
      <div class="type-indicator" style="background:${hue};flex-shrink:0;margin-right:6px;"></div>
      <span class="title-text">${node_data.title}</span>
      <div style="flex:1"></div>
    `;
    if (this.header.innerHTML !== title_html) this.header.innerHTML = title_html;

    const is_connected = (p_id: string) => Object.values(state.wires).some(
      w => (w.target_node_id === this.node_id && w.target_port_id === p_id) ||
           (w.source_node_id === this.node_id && w.source_port_id === p_id));

    const ports_html = (node_data.inputs || []).map(p => {
      const cc = is_connected(p.id) ? 'connected' : '';
      return `<div class="port-row"><div class="port" data-port-id="${p.id}" data-port-type="input"><div class="port-dot port-type-text ${cc}"></div><span class="port-label">${p.label}</span></div><div></div></div>`;
    }).join('');
    if (this.portsContainer.innerHTML !== ports_html) this.portsContainer.innerHTML = ports_html;

    const css = node_data.custom_data?.['display_css'] as string;
    if (css && css !== this.cachedCss) {
      this.cachedCss = css;
      this.previewEl.style.background = css;
      this.previewEl.textContent = '';
    } else if (!css && this.cachedCss !== '') {
      this.cachedCss = '';
      this.previewEl.textContent = 'Connect and run to preview...';
    }
  }

  unmount(): void { this.header.remove(); this.portsContainer.remove(); this.body.remove(); }
}
