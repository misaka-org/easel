export type Theme = {
  canvas_bg: string;
  node_bg: string;
  node_border: string;
  node_header_bg: string;
  text_color: string;
  text_muted: string;
  primary_color: string;
  primary_hover: string;
  wire_color: string;
  wire_active_color: string;
  port_color: string;
  selection_bg: string;
  selection_border: string;
};

export const default_theme: Theme = {
  canvas_bg: "#09090b",
  node_bg: "#09090b",
  node_border: "#27272a",
  node_header_bg: "transparent",
  text_color: "#fafafa",
  text_muted: "#a1a1aa",
  primary_color: "#fafafa",
  primary_hover: "rgba(255, 255, 255, 0.5)",
  wire_color: "#52525b",
  wire_active_color: "#fafafa",
  port_color: "#52525b",
  selection_bg: "rgba(250, 250, 250, 0.1)",
  selection_border: "rgba(250, 250, 250, 0.5)",
};

export const light_theme: Theme = {
  canvas_bg: "#f5f5f5",
  node_bg: "#ffffff",
  node_border: "#e5e7eb",
  node_header_bg: "#f9fafb",
  text_color: "#171717",
  text_muted: "#525252",
  primary_color: "#000000",
  primary_hover: "rgba(0, 0, 0, 0.5)",
  wire_color: "#d4d4d8",
  wire_active_color: "#000000",
  port_color: "#a1a1aa",
  selection_bg: "rgba(0, 0, 0, 0.05)",
  selection_border: "rgba(0, 0, 0, 0.3)",
};

export const apply_theme = (container: HTMLElement, theme: Theme) => {
  for (const [key, value] of Object.entries(theme)) {
    container.style.setProperty(`--${key.replace(/_/g, "-")}`, value);
  }
};

/**
 * 用于触发 vscode 语法高亮用的临时函数
 */
const css = (x: TemplateStringsArray, ...v: any[]) =>
  x.map((s, i) => s + (v[i] || "")).join("");
export const get_base_css = () => css`
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
    user-select: none;
    contain: strict;
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

    contain: layout style paint content;
    content-visibility: auto;
    text-rendering: optimizeSpeed;
    -webkit-font-smoothing: none;
  }

  .node.selected {
    border-color: var(--primary-color);
  }

  .node.borderless {
    background: transparent;
    border: none;
    box-shadow: none;
  }

  .node.borderless.selected {
    box-shadow: 0 0 0 1px var(--primary-color);
  }

  .node.borderless .node-header {
    display: none;
  }

  .node.borderless .node-body {
    padding: 0;
    gap: 0;
  }

  .node.subgraph-input-stub,
  .node.subgraph-output-stub {
    position: absolute;
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0;
    display: flex;
    contain: none;
    width: auto !important;
    height: auto !important;
    min-width: 0;
    min-height: 0;
  }
  .node.subgraph-input-stub {
    justify-content: flex-end;
    border-right: 1px solid var(--node-border) !important;
    padding: 10px 12px 10px 6px;
    border-radius: 0 !important;
    cursor: grab;
  }
  .node.subgraph-input-stub.selected {
    border-right-color: var(--primary-color) !important;
  }
  .node.subgraph-input-stub:active {
    cursor: grabbing;
  }
  .node.subgraph-output-stub {
    justify-content: flex-start;
    border-left: 1px solid var(--node-border) !important;
    padding: 10px 6px 10px 12px;
    border-radius: 0 !important;
    cursor: grab;
  }
  .node.subgraph-output-stub.selected {
    border-left-color: var(--primary-color) !important;
  }
  .node.subgraph-output-stub:active {
    cursor: grabbing;
  }
  .node.subgraph-input-stub .node-body,
  .node.subgraph-output-stub .node-body {
    display: flex;
    flex-direction: column;
    padding: 0;
    gap: 6px;
    background: transparent;
    flex: none;
  }
  .node.subgraph-input-stub .node-body {
    align-items: flex-end;
  }
  .node.subgraph-output-stub .node-body {
    align-items: flex-start;
  }
  .node.subgraph-input-stub .port-dot,
  .node.subgraph-output-stub .port-dot {
    width: 10px;
    height: 10px;
  }
  .node.subgraph-input-stub .port,
  .node.subgraph-output-stub .port {
    gap: 8px;
  }
  .node.subgraph-input-stub .port-label,
  .node.subgraph-output-stub .port-label {
    font-size: 11px;
    white-space: nowrap;
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
  .node-header .title-text {
    line-height: 20px;
    margin-right: 4px;

    // 提升为单独的层
    will-change: transform;
  }

  .type-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 6px;
    flex-shrink: 0;
  }

  .type-indicator {
    cursor: pointer;
    transition: box-shadow 0.15s, opacity 0.15s;
  }
  .type-indicator:hover {
    box-shadow: 0 0 0 2px var(--text-muted);
  }

  .node-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 6px;
    height: 20px;
    border-radius: 4px;
    cursor: pointer;
    opacity: 0.4;
    transition: opacity 0.15s;
  }
  .node-action-btn:hover {
    opacity: 1;
  }
  .node-action-btn svg {
    display: block;
    width: 14px;
    height: 14px;
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

  .port-type-text {
    background: #3b82f6;
    box-shadow: 0 0 0 1px #3b82f6;
  }
  .port-type-image {
    background: #10b981;
    box-shadow: 0 0 0 1px #10b981;
  }
  .port-type-video {
    background: #8b5cf6;
    box-shadow: 0 0 0 1px #8b5cf6;
  }
  .port-type-audio {
    background: #f59e0b;
    box-shadow: 0 0 0 1px #f59e0b;
  }
  .port-type-number {
    background: #0dcaf0;
    box-shadow: 0 0 0 1px #0dcaf0;
  }

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
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .widget-row .port {
    flex-shrink: 0;
  }
  .widget-row .widget-input-container {
    flex-grow: 1;
    text-align: right;
  }

  .widget-row input[type="text"],
  .widget-row input[type="number"] {
    width: 80px;
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

  .widget-row textarea {
    width: 120px;
    background: transparent;
    border: 1px solid var(--node-border);
    color: var(--text-color);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    box-sizing: border-box;
    resize: vertical;
    font-family: inherit;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .widget-row textarea:focus {
    outline: none;
    border-color: var(--text-color);
    box-shadow: 0 0 0 1px var(--text-color);
  }

  .widget-row select {
    width: 80px;
    background: transparent;
    border: 1px solid var(--node-border);
    color: var(--text-color);
    padding: 4px 4px;
    border-radius: 4px;
    font-size: 11px;
    box-sizing: border-box;
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .widget-row select:focus {
    outline: none;
    border-color: var(--text-color);
  }
  .widget-row select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .widget-row input[type="range"] {
    width: 80px;
    height: 4px;
    margin: 0;
    vertical-align: middle;
    accent-color: var(--primary-color, #fafafa);
  }
  .widget-row input[type="range"]:disabled {
    opacity: 0.5;
  }

  .widget-row .easel-switch {
    position: relative;
    display: inline-flex;
    align-items: center;
    width: 32px;
    height: 18px;
    cursor: pointer;
    vertical-align: middle;
  }
  .widget-row .easel-switch-input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }
  .widget-row .easel-switch-slider {
    position: absolute;
    inset: 0;
    background: var(--node-border, #333);
    border-radius: 18px;
    transition: background 0.2s;
  }
  .widget-row .easel-switch-slider::before {
    content: "";
    position: absolute;
    width: 14px;
    height: 14px;
    left: 2px;
    bottom: 2px;
    background: var(--text-color, #fafafa);
    border-radius: 50%;
    transition: transform 0.2s;
  }
  .widget-row .easel-switch-input:checked + .easel-switch-slider {
    background: var(--primary-color, #fafafa);
  }
  .widget-row .easel-switch-input:checked + .easel-switch-slider::before {
    transform: translateX(14px);
  }
  .widget-row .easel-switch-input:disabled + .easel-switch-slider {
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

  @keyframes easel-wire-flow {
    to {
      stroke-dashoffset: -16;
    }
  }

  .wire {
    fill: none;
    stroke: var(--wire-color);
    stroke-width: 2px;
    stroke-dasharray: 8 8;
    animation: easel-wire-flow 1s linear infinite;
    vector-effect: non-scaling-stroke;
    opacity: 0.8;
  }

  .wire[data-value-type="text"] {
    stroke: #3b82f6;
  }
  .wire[data-value-type="image"] {
    stroke: #10b981;
  }
  .wire[data-value-type="video"] {
    stroke: #8b5cf6;
  }
  .wire[data-value-type="audio"] {
    stroke: #f59e0b;
  }
  .wire[data-value-type="number"] {
    stroke: #0dcaf0;
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

  /* shadcn 风格全局变量 */
  :host {
    --popover-bg: #18181b;
    --border-color: #27272a;
    --radius-md: 0.375rem;
    --radius-lg: 0.5rem;
  }

  .lod-min {
    box-shadow: none !important;
    filter: none !important;
    backdrop-filter: none !important;
    color: transparent;
  }

  .lod-min * {
    box-shadow: none !important;
    filter: none !important;
    backdrop-filter: none !important;
    color: transparent;
  }

  .lod-min .node-body {
    display: none !important;
  }
  .lod-min.borderless {
    background-color: var(--node-bg);
  }

  .group-node {
    z-index: -1;
  }

  .group-node.selected {
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.4);
  }

  .group-body {
    pointer-events: none;
  }
`;
