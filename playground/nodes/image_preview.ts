import { EaselNode, GraphNode, type NodeSpec } from '@/index';

// Custom Node Example
export class ImagePreviewNode extends EaselNode {
  static node_spec: NodeSpec = {
    inputs: [{ id: 'in_1', label: 'Image', type: 'input' }],
    outputs: [],
    style_mode: 'borderless',
  };
  private body!: HTMLElement;
  private preview!: HTMLImageElement;
  private toolbar!: HTMLElement;

  mount(node_data: GraphNode): void {
    this.container.classList.add('borderless');
    this.container.style.borderRadius = '0px';

    this.body = document.createElement('div');
    this.body.className = 'node-body';
    this.body.style.width = '100%';
    this.body.style.height = '100%';

    this.preview = document.createElement('img');
    this.preview.style.width = '100%';
    this.preview.style.height = '100%';
    this.preview.style.objectFit = 'cover';
    this.preview.style.pointerEvents = 'none';
    this.preview.src = (node_data.custom_data['url'] as string) || '';

    this.toolbar = document.createElement('div');
    this.toolbar.className = 'image-toolbar';
    this.toolbar.innerHTML = `
      <button>Crop</button>
      <button>Edit</button>
    `;

    this.body.appendChild(this.preview);
    this.body.appendChild(this.toolbar);
    this.container.appendChild(this.body);
  }

  update(_node_data: GraphNode, _state: any): void {
    // 静态内容，仅依赖CSS显示隐藏toolbar
  }

  unmount(): void {
    this.body.remove();
  }
}
