import { EaselNode } from '@/runtime/registry';
import type { ExecuteContext } from '@/runtime/registry';
import type { GraphNode, State } from '@/core/types';
import { execute_subgraph } from './subgraph_executor';
import { remove_node } from '@/core/node_ops';
import { ICON_CHEVRON_RIGHT, ICON_X } from '@/icons';
import { set_inner_html } from '@/utils/dom';
import {
  document_boundary_add_port_id,
  document_boundary_input_class,
  document_boundary_output_class,
  document_boundary_rail_class,
  get_boundary_rail_direction,
  is_document_boundary_rail,
  type BoundaryRailDirection,
} from '@/runtime/document_boundary_rail';

export class SubgraphNode extends EaselNode {
  private header!: HTMLElement;
  private body!: HTMLElement;

  mount(node_data: GraphNode): void {
    this.header = document.createElement('div');
    this.header.className = 'node-header';

    this.body = document.createElement('div');
    this.body.className = 'node-body';

    this.container.appendChild(this.header);
    this.container.appendChild(this.body);

    this.header.addEventListener('pointerdown', e => {
      const target = e.target as HTMLElement;
      const action_el = target.closest('[data-action]') as HTMLElement | null;
      if (action_el) {
        e.stopPropagation();
        if (e.button !== 0) return;
        const action = action_el.dataset['action'];
        if (action === 'enter_subgraph') {
          if (this.context.app_events) {
            this.context.app_events.emit('enter_subgraph', { node_id: this.node_id });
          }
        } else if (action === 'delete') {
          this.dispatch(s => remove_node(s, this.node_id));
        }
      }
    });

    this.update(node_data, {} as State);
  }

  update(node_data: GraphNode, _state: State): void {
    const hue = (node_data.custom_data['color'] as string) || 'var(--primary-color)';

    const title_html = `
      <div class="type-indicator" style="background: ${hue}"></div>
      <span class="title-text">${node_data.title}</span>
      <div style="flex:1"></div>
      <div class="node-action-btn" data-action="enter_subgraph" title="Enter Subgraph">
        ${ICON_CHEVRON_RIGHT}
      </div>
      <div class="node-action-btn" data-action="delete" title="Delete">
        ${ICON_X}
      </div>
    `;
    set_inner_html(this.header, title_html);

    const ports_html = [
      ...node_data.inputs.map(
        p => `
        <div class="port-row">
          <div class="port" data-port-id="${p.id}" data-port-type="input">
            <div class="port-dot"></div><span class="port-label">${p.label}</span>
          </div>
          <div></div>
        </div>
      `,
      ),
      ...node_data.outputs.map(
        p => `
        <div class="port-row">
          <div></div>
          <div class="port" data-port-id="${p.id}" data-port-type="output">
            <span class="port-label">${p.label}</span><div class="port-dot"></div>
          </div>
        </div>
      `,
      ),
    ].join('');

    set_inner_html(this.body, ports_html);

    // resize handle
    if (node_data.resizable !== false) {
      if (!this.container.querySelector('.node-resize-handle')) {
        const handle = document.createElement('div');
        handle.className = 'node-resize-handle';
        handle.dataset['action'] = 'resize';
        this.container.appendChild(handle);
      }
    }
  }

  async execute(ctx: ExecuteContext): Promise<Record<string, unknown>> {
    return execute_subgraph(ctx);
  }

  unmount(): void {
    this.header.remove();
    this.body.remove();
  }
}

const render_legacy_stub = (node_data: GraphNode): string => {
  const is_input = node_data.type === 'subgraph_input';
  const ports = is_input ? node_data.outputs : node_data.inputs;
  return ports
    .map(
      p => `
      <div class="port" data-port-id="${p.id}" data-port-type="${is_input ? 'output' : 'input'}">
        ${is_input ? `<span class="port-label">${p.label}</span><div class="port-dot"></div>` : `<div class="port-dot"></div><span class="port-label">${p.label}</span>`}
      </div>
    `,
    )
    .join('');
};

const render_boundary_rail = (node_data: GraphNode, direction: BoundaryRailDirection): string => {
  const header_text = direction === 'input' ? 'INPUTS' : 'OUTPUTS';
  const ports = direction === 'input' ? node_data.outputs : node_data.inputs;
  const rows = ports
    .map(port => {
      const type_class = port.value_type != null ? `port-type-${port.value_type}` : '';
      const is_add = port.id === document_boundary_add_port_id;
      const label_class = is_add ? 'boundary-rail-add-label' : '';
      const label = `<span class="boundary-rail-label ${label_class}">${port.label}</span>`;
      const dot = `<div class="port-dot ${type_class}"></div>`;
      const content = direction === 'input' ? `${label}${dot}` : `${dot}${label}`;
      return `<div class="port boundary-rail-port${is_add ? ' boundary-rail-add-row' : ''}" data-port-id="${port.id}" data-port-type="${port.type}"${is_add ? ' data-testid="easel-boundary-add-port"' : ''}>${content}</div>`;
    })
    .join('');
  return `<div class="boundary-rail-header" data-testid="boundary-rail-header">${header_text}</div><div class="boundary-rail-list">${rows}</div>`;
};

const sync_container_mode = (
  node_data: GraphNode,
  container: HTMLElement,
): BoundaryRailDirection | undefined => {
  const direction = get_boundary_rail_direction(node_data);
  const is_rail = is_document_boundary_rail(node_data) && direction !== undefined;
  container.classList.remove(
    'subgraph-input-stub',
    'subgraph-output-stub',
    document_boundary_rail_class,
    document_boundary_input_class,
    document_boundary_output_class,
  );
  if (is_rail) {
    container.classList.add(
      document_boundary_rail_class,
      direction === 'input' ? document_boundary_input_class : document_boundary_output_class,
    );
    container.dataset['viewOnly'] = 'true';
    container.dataset['direction'] = direction;
    return direction;
  }
  delete container.dataset['viewOnly'];
  delete container.dataset['direction'];
  container.classList.add(
    node_data.type === 'subgraph_input' ? 'subgraph-input-stub' : 'subgraph-output-stub',
  );
  return undefined;
};

export class SubgraphInputNode extends EaselNode {
  private body!: HTMLElement;

  mount(node_data: GraphNode): void {
    this.body = document.createElement('div');
    this.body.className = 'node-body';
    this.container.appendChild(this.body);
    this.update(node_data, {} as State);
  }

  update(node_data: GraphNode, _state: State): void {
    const direction = sync_container_mode(node_data, this.container);
    if (direction !== undefined) {
      set_inner_html(this.body, render_boundary_rail(node_data, direction));
      return;
    }
    set_inner_html(this.body, render_legacy_stub(node_data));
  }

  async execute(_ctx: ExecuteContext): Promise<Record<string, unknown>> {
    return {};
  }

  unmount(): void {
    this.body.remove();
  }
}

export class SubgraphOutputNode extends EaselNode {
  private body!: HTMLElement;

  mount(node_data: GraphNode): void {
    this.body = document.createElement('div');
    this.body.className = 'node-body';
    this.container.appendChild(this.body);
    this.update(node_data, {} as State);
  }

  update(node_data: GraphNode, _state: State): void {
    const direction = sync_container_mode(node_data, this.container);
    if (direction !== undefined) {
      set_inner_html(this.body, render_boundary_rail(node_data, direction));
      return;
    }
    set_inner_html(this.body, render_legacy_stub(node_data));
  }

  async execute(ctx: ExecuteContext): Promise<Record<string, unknown>> {
    return { ...ctx.inputs };
  }

  unmount(): void {
    this.body.remove();
  }
}
