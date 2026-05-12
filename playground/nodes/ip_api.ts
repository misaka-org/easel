import { EaselNode } from '@/index';
import type { GraphNode, State } from '@/core/types';
import type { ExecuteContext } from '@/index';

export class IpApiNode extends EaselNode {
  private header!: HTMLElement;
  private body!: HTMLElement;
  private portsContainer!: HTMLElement;
  private statusEl!: HTMLElement;

  async execute({ node, inputs, report_progress, signal }: ExecuteContext) {
    const query = (inputs['query'] as string) || '';
    if (!query) throw new Error('No query input');

    report_progress(10);
    if (signal?.aborted) throw new Error('Aborted');

    const url = `http://ip-api.com/json/${encodeURIComponent(query)}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query`;

    report_progress(40);
    if (signal?.aborted) throw new Error('Aborted');

    const res = await fetch(url);
    const data = await res.json();

    if (signal?.aborted) throw new Error('Aborted');
    report_progress(90);

    // Write result into custom_data so update() can display it
    this.dispatch(state => ({
      ...state,
      nodes: {
        ...state.nodes,
        [this.node_id]: {
          ...state.nodes[this.node_id],
          custom_data: {
            ...state.nodes[this.node_id].custom_data,
            last_query: query,
            api_result: data,
          },
        },
      },
    }));

    report_progress(100);

    return {
      result: data,
      country: data.country || '',
      city: data.city || '',
      region: data.regionName || '',
      isp: data.isp || '',
      lat: data.lat ?? 0,
      lon: data.lon ?? 0,
      query_ip: data.query || '',
    };
  }

  mount(node_data: GraphNode): void {
    this.container.style.minWidth = '280px';

    this.header = document.createElement('div');
    this.header.className = 'node-header';

    this.body = document.createElement('div');
    this.body.className = 'node-body';

    this.portsContainer = document.createElement('div');
    this.portsContainer.className = 'ports-container';

    this.statusEl = document.createElement('div');
    this.statusEl.style.cssText =
      'font-size:11px;color:#888;margin-top:4px;text-align:center;padding:4px;';
    this.statusEl.textContent = 'Awaiting execution...';

    this.body.appendChild(this.portsContainer);
    this.body.appendChild(this.statusEl);
    this.container.appendChild(this.header);
    this.container.appendChild(this.body);

    this.update(node_data, { wires: {} } as State);
  }

  update(node_data: GraphNode, state: State): void {
    // Header
    const hue = (node_data.custom_data?.['color'] as string) || '#06b6d4';
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

    const ports_html = [
      ...node_data.inputs.map(p => {
        const connected_class = is_port_connected(p.id) ? 'connected' : '';
        return `
        <div class="port-row">
          <div class="port" data-port-id="${p.id}" data-port-type="input">
            <div class="port-dot port-type-text ${connected_class}"></div><span class="port-label">${p.label}</span>
          </div>
          <div></div>
        </div>
      `;
      }),
      ...node_data.outputs.map(p => {
        const connected_class = is_port_connected(p.id) ? 'connected' : '';
        return `
        <div class="port-row">
          <div></div>
          <div class="port" data-port-id="${p.id}" data-port-type="output">
            <span class="port-label">${p.label}</span><div class="port-dot port-type-text ${connected_class}"></div>
          </div>
        </div>
      `;
      }),
    ].join('');

    if (this.portsContainer.innerHTML !== ports_html) {
      this.portsContainer.innerHTML = ports_html;
    }

    // Show result status if available
    const result = node_data.custom_data?.['api_result'];
    const query = node_data.custom_data?.['last_query'] as string;

    if (result) {
      if (result.status === 'success') {
        this.statusEl.innerHTML = `
          <div style="color:#4ade80;font-weight:600;">✓ ${query || result.query}</div>
          <div style="color:#aaa;margin-top:2px;">${result.country} / ${result.city || 'N/A'} &middot; ${result.isp || 'N/A'}</div>
        `;
      } else {
        this.statusEl.innerHTML = `<div style="color:#f87171;">✗ ${result.message || 'Request failed'}</div>`;
      }
    } else {
      this.statusEl.textContent = 'Awaiting execution...';
    }
  }

  unmount(): void {
    this.header.remove();
    this.portsContainer.remove();
    this.body.remove();
  }
}
