import { EaselNode } from '@/index';
import type { GraphNode, State } from '@/core/types';
import type { ExecuteContext } from '@/index';

export class TextViewNode extends EaselNode {
  private header!: HTMLElement;
  private body!: HTMLElement;
  private portsContainer!: HTMLElement;
  private contentEl!: HTMLElement;
  private cachedContent = '';

  async execute({ node, inputs }: ExecuteContext) {
    const content = inputs['content'];
    // Store into custom_data so update() picks it up via reactivity
    this.dispatch(state => ({
      ...state,
      nodes: {
        ...state.nodes,
        [this.node_id]: {
          ...state.nodes[this.node_id],
          custom_data: {
            ...state.nodes[this.node_id].custom_data,
            display_content: content,
          },
        },
      },
    }));
    return {};
  }

  mount(node_data: GraphNode): void {
    this.container.style.minWidth = '320px';
    this.container.style.minHeight = '200px';

    this.header = document.createElement('div');
    this.header.className = 'node-header';

    this.body = document.createElement('div');
    this.body.className = 'node-body';
    this.body.style.display = 'flex';
    this.body.style.flexDirection = 'column';
    this.body.style.flex = '1';

    this.portsContainer = document.createElement('div');
    this.portsContainer.className = 'ports-container';

    // Scrollable content area
    this.contentEl = document.createElement('div');
    this.contentEl.style.cssText = `
      flex:1; overflow:auto; font-family:monospace; font-size:11px;
      line-height:1.6; white-space:pre-wrap; word-break:break-word;
      background:rgba(0,0,0,0.2); border-radius:4px; padding:8px;
      min-height:120px;
    `;
    this.contentEl.textContent = 'Awaiting data...';

    this.body.appendChild(this.portsContainer);
    this.body.appendChild(this.contentEl);
    this.container.appendChild(this.header);
    this.container.appendChild(this.body);

    this.update(node_data, { wires: {} } as State);
  }

  update(node_data: GraphNode, state: State): void {
    // Header
    const hue = (node_data.custom_data?.['color'] as string) || '#a855f7';
    const title_html = `
      <div class="type-indicator" style="background:${hue};flex-shrink:0;margin-right:6px;"></div>
      <span class="title-text">${node_data.title}</span>
      <div style="flex:1"></div>
    `;
    if (this.header.innerHTML !== title_html) {
      this.header.innerHTML = title_html;
    }

    // Ports
    const is_port_connected = (p_id: string) =>
      Object.values(state.wires).some(
        wire =>
          (wire.target_node_id === this.node_id && wire.target_port_id === p_id) ||
          (wire.source_node_id === this.node_id && wire.source_port_id === p_id),
      );

    const ports_html = node_data.inputs
      .map(p => {
        const connected_class = is_port_connected(p.id) ? 'connected' : '';
        return `
        <div class="port-row">
          <div class="port" data-port-id="${p.id}" data-port-type="input">
            <div class="port-dot port-type-text ${connected_class}"></div><span class="port-label">${p.label}</span>
          </div>
          <div></div>
        </div>
      `;
      })
      .join('');

    if (this.portsContainer.innerHTML !== ports_html) {
      this.portsContainer.innerHTML = ports_html;
    }

    // Display content from custom_data
    const content = node_data.custom_data?.['display_content'];

    if (content === undefined || content === null) {
      if (this.cachedContent !== '') {
        this.contentEl.textContent = 'Awaiting data...';
        this.cachedContent = '';
      }
      return;
    }

    // Format display
    let displayText: string;
    let isFormatted = false;

    if (typeof content === 'object') {
      displayText = JSON.stringify(content, null, 2);
      isFormatted = true;
    } else {
      displayText = String(content);
    }

    if (displayText !== this.cachedContent) {
      this.cachedContent = displayText;
      this.contentEl.innerHTML = '';

      if (isFormatted && content.status === 'success') {
        // Rich display for IP API result
        const d = content;
        const rows = [
          ['Status', `<span style="color:#4ade80;">${d.status}</span>`],
          ['IP', `<span style="color:#93c5fd;">${d.query}</span>`],
          ['Country', `${d.country || 'N/A'}${d.countryCode ? ' (' + d.countryCode + ')' : ''}`],
          ['Region', d.regionName || 'N/A'],
          ['City', `${d.city || 'N/A'}${d.zip ? ' ' + d.zip : ''}`],
          ['Coordinates', `${d.lat}, ${d.lon}`],
          ['Timezone', d.timezone || 'N/A'],
          ['ISP', d.isp || 'N/A'],
          ['Org', d.org || 'N/A'],
          ['AS', d.as || 'N/A'],
        ];

        const table = rows
          .map(
            ([label, val]) =>
              `<div style="display:grid;grid-template-columns:80px 1fr;gap:2px 8px;">
                <span style="color:#94a3b8;">${label}</span>
                <span>${val}</span>
              </div>`,
          )
          .join('');

        this.contentEl.innerHTML = `<div style="padding:4px;">${table}</div>`;
      } else {
        // Plain text or generic JSON
        this.contentEl.textContent = displayText;
      }
    }
  }

  unmount(): void {
    this.header.remove();
    this.portsContainer.remove();
    this.body.remove();
  }
}
