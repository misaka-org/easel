export type Theme = {
  canvas_bg: string;
  node_bg: string;
  node_border: string;
  node_header_bg: string;
  text_color: string;
  text_muted: string;
  primary_color: string;
  wire_color: string;
  wire_active_color: string;
  port_color: string;
  selection_bg: string;
  selection_border: string;
};

export const default_theme: Theme = {
  canvas_bg: '#09090b',
  node_bg: '#09090b',
  node_border: '#27272a',
  node_header_bg: 'transparent',
  text_color: '#fafafa',
  text_muted: '#a1a1aa',
  primary_color: '#fafafa',
  wire_color: '#52525b',
  wire_active_color: '#fafafa',
  port_color: '#52525b',
  selection_bg: 'rgba(250, 250, 250, 0.1)',
  selection_border: 'rgba(250, 250, 250, 0.5)'
};

export const light_theme: Theme = {
  canvas_bg: '#f5f5f5',
  node_bg: '#ffffff',
  node_border: '#cccccc',
  node_header_bg: '#e0e0e0',
  text_color: '#333333',
  text_muted: '#666666',
  primary_color: '#007acc',
  wire_color: '#999999',
  wire_active_color: '#007acc',
  port_color: '#999999',
  selection_bg: 'rgba(0, 122, 204, 0.1)',
  selection_border: 'rgba(0, 122, 204, 0.8)'
};

export const apply_theme = (container: HTMLElement, theme: Theme) => {
  for (const [key, value] of Object.entries(theme)) {
    container.style.setProperty(`--${key.replace(/_/g, '-')}`, value);
  }
};

export const get_base_css = () => `
  :host {
    display: block;
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--canvas-bg);
    color: var(--text-color);
    font-family: sans-serif;
  }
  
  * {
    box-sizing: border-box;
  }

  .easel-container {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
    background-color: var(--canvas-bg);
    background-image: radial-gradient(#27272a 1px, transparent 1px);
  }

  .nodes-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    transform-origin: 0 0;
  }

  .node {
    position: absolute;
    background: var(--node-bg);
    border: 1px solid var(--node-border);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    user-select: none;
    display: flex;
    flex-direction: column;
    contain: layout style;
  }

  .node.selected {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 1px var(--primary-color), 0 4px 6px rgba(0, 0, 0, 0.3);
  }

  .node.borderless {
    background: transparent;
    border: none;
    box-shadow: none;
  }

  .node.borderless.selected {
    box-shadow: 0 0 0 2px var(--primary-color);
  }

  .node.borderless .node-header {
    display: none;
  }

  .node.borderless .node-body {
    padding: 0;
    gap: 0;
  }

  .node-header {
    background: var(--node-header-bg);
    padding: 10px 12px 6px 12px;
    border-bottom: none;
    font-size: 12px;
    font-weight: 600;
    border-radius: 8px 8px 0 0;
    cursor: grab;
    display: flex;
    align-items: center;
    color: var(--text-color);
  }

  .type-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 6px;
    flex-shrink: 0;
  }

  .collapse-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 16px;
    line-height: 1;
    padding: 0 4px 0 0;
    cursor: pointer;
  }

  .collapse-btn:hover {
    color: var(--text-color);
    background: transparent;
  }

  .node-header:active {
    cursor: grabbing;
  }

  .node-body {
    padding: 0 12px 12px 12px;
    font-size: 12px;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .node.collapsed .node-body {
    display: none !important;
  }

  .node-resize-handle {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 10px;
    height: 10px;
    cursor: se-resize;
    background: linear-gradient(135deg, transparent 50%, var(--port-color) 50%);
    border-bottom-right-radius: 8px;
  }

  .port-row {
    display: flex;
    justify-content: space-between;
    min-height: 16px;
    align-items: center;
  }

  .port {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .port-label {
    color: var(--text-muted);
    font-size: 11px;
  }

  .port-dot {
    width: 8px;
    height: 8px;
    background: var(--port-color);
    border-radius: 50%;
    border: 1px solid var(--node-bg);
    box-shadow: 0 0 0 1px var(--port-color);
    box-sizing: border-box;
    transition: transform 0.1s;
  }

  .port-dot:hover {
    transform: scale(1.3);
  }

  .port-dot.connected {
    background: var(--text-color);
  }

  .port-type-text { background: #3b82f6; box-shadow: 0 0 0 1px #3b82f6; }
  .port-type-image { background: #10b981; box-shadow: 0 0 0 1px #10b981; }
  .port-type-video { background: #8b5cf6; box-shadow: 0 0 0 1px #8b5cf6; }
  .port-type-audio { background: #f59e0b; box-shadow: 0 0 0 1px #f59e0b; }
  .port-type-number { background: #0dcaf0; box-shadow: 0 0 0 1px #0dcaf0; }

  .widgets-container {
    margin-top: 2px;
    border-top: 1px solid var(--node-border);
    padding-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .widget-row {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .widget-row label {
    color: var(--text-muted);
    font-size: 11px;
  }

  .widget-row input[type="text"],
  .widget-row input[type="number"] {
    width: 100%;
    background: transparent;
    border: 1px solid var(--node-border);
    color: var(--text-color);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    box-sizing: border-box;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  
  .widget-row input[type="text"]:focus,
  .widget-row input[type="number"]:focus {
    outline: none;
    border-color: var(--text-color);
    box-shadow: 0 0 0 1px var(--text-color);
  }

  .widget-row input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .selection-box {
    position: absolute;
    border: 1px solid var(--selection-border);
    background: var(--selection-bg);
    pointer-events: none;
    z-index: 1000;
  }

  .wires-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    transform-origin: 0 0;
    overflow: visible;
    z-index: 10;
  }

  .wire {
    fill: none;
    stroke: var(--wire-color);
    stroke-width: 2px;
    stroke-dasharray: 8 6;
    vector-effect: non-scaling-stroke;
    opacity: 0.8;
  }

  .wire:hover {
    opacity: 1;
    stroke-width: 3px;
  }

  .wire-active {
    fill: none;
    stroke: var(--wire-active-color);
    stroke-width: 2px;
    stroke-dasharray: 4;
    vector-effect: non-scaling-stroke;
  }

  .lod-min .node-body {
    display: none !important;
  }

  .group-node {
    z-index: -1;
  }

  .group-node.selected {
    box-shadow: none !important;
  }

  .group-body {
    pointer-events: none;
  }
`;