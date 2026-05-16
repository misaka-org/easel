import { effect } from "@vue/reactivity";
import { Easel, register_node_type, register_node_ns, EaselNode, type ExecuteContext, type NodeSpec } from "@/index";
import { add_node, update_node_data } from "@/core/node_ops";
import { create_initial_state } from "@/core/state";
import { serialize_state, deserialize_state } from "@/core/serialization";
import { vec2_create } from "@/core/math";
import type { GraphNode, State } from "@/core/types";
import { light_theme, default_theme } from "@/runtime/theme";
import { minimap_plugin } from "@/plugins/minimap";
import { controls_plugin } from "@/plugins/controls";
import { context_menu_plugin } from "@/plugins/context_menu";
import { history_plugin } from "@/plugins/history";
import { auto_pan_plugin } from "@/plugins/auto_pan";
import { executor_plugin } from "@/plugins/executor_plugin";
import { node_picker_plugin } from "@/plugins/node_picker";
import { DefaultNode } from "@/index";
import type { ContextMenuContext, ContextMenuItem } from "@/plugins/context_menu/types";


import { MathNode } from "./nodes/math";
import { load_math_scene, evaluate_math_graph } from "./scenes/scene_math";
import { load_perf_scene } from "./scenes/scene_perf";
import { load_executor_scene } from "./scenes/scene_executor";
import { ImagePreviewNode } from "./nodes/image_preview";
import { IpApiNode } from "./nodes/ip_api";
import { TextInputNode } from "./nodes/text_input";
import { TextViewNode } from "./nodes/text_view";
import { ColorSourceNode } from "./nodes/color_source";
import { CSSBuilderNode } from "./nodes/css_builder";
import { CSSPreviewNode } from "./nodes/css_preview";
import { CounterNode } from "./nodes/counter_node";

import { load_realtime_scene } from "./scenes/scene_realtime";
import { load_ip_api_scene } from "./scenes/scene_ip_api";
import { load_context_menu_scene } from "./scenes/scene_context_menu";

class ExecutableDefaultNode extends DefaultNode {
  static node_spec: NodeSpec = {};
  async execute({ node, inputs, report_progress }: ExecuteContext) {
    report_progress(50);
    await new Promise((r) => setTimeout(r, 500));
    report_progress(100);
    return { out: (inputs['val'] as number) || 0 };
  }
}

class TextGenNode extends DefaultNode {
  static node_spec: NodeSpec = {
    inputs: [{ id: 'prompt', label: 'Prompt', type: 'input', value_type: 'text', required: true }],
    outputs: [{ id: 'out_list', label: 'List [ ]', type: 'output', value_type: 'text' }],
    widgets: [
      { id: 'min_len', type: 'number', label: 'Minimum list length', value: 6, value_type: 'number' },
      { id: 'max_len', type: 'number', label: 'Maximum list length', value: 8, value_type: 'number' },
    ],
  };
  async execute({ node, inputs, report_progress, signal }: ExecuteContext) {
    report_progress(30);
    await new Promise((r) => setTimeout(r, 400));
    if (signal?.aborted) throw new Error("Aborted");
    report_progress(70);
    await new Promise((r) => setTimeout(r, 400));
    if (signal?.aborted) throw new Error("Aborted");
    report_progress(100);
    return { out_list: `Gen: ${inputs['prompt'] || 'empty'}` };
  }
}

class ImageGenNode extends DefaultNode {
  static node_spec: NodeSpec = {
    inputs: [
      { id: 'prompt', label: '[ ] Prompt', type: 'input', value_type: 'image' },
      { id: 'ref', label: 'Reference Image', type: 'input', value_type: 'image' },
    ],
    outputs: [{ id: 'out_img', label: 'Image [ ]', type: 'output', value_type: 'image' }],
    widgets: [{ id: 'model', type: 'text', label: 'Model', value: 'Flux Dev', value_type: 'text' }],
  };
  async execute({ node, inputs, report_progress, signal }: ExecuteContext) {
    report_progress(10);
    await new Promise((r) => setTimeout(r, 300));
    if (signal?.aborted) throw new Error("Aborted");
    report_progress(50);
    await new Promise((r) => setTimeout(r, 600));
    if (signal?.aborted) throw new Error("Aborted");
    report_progress(100);
    return { out_img: `Image for: ${inputs['prompt']}` };
  }
}

register_node_type("default", ExecutableDefaultNode);
register_node_type("text_generation", TextGenNode);
register_node_type("image_generation", ImageGenNode);
register_node_type("image_preview", ImagePreviewNode);
register_node_type("math", MathNode);
register_node_type("ip_api", IpApiNode);
register_node_type("text_input", TextInputNode);
register_node_type("text_view", TextViewNode);
register_node_type("color_source", ColorSourceNode);
register_node_type("css_builder", CSSBuilderNode);
register_node_type("css_preview", CSSPreviewNode);
register_node_type("counter", CounterNode);

// -------------------------------------------------------------------
// Namespace registration 锟?organizes the "Add Node" submenu
// into hierarchical submenus. Nodes without ns appear under "Other".
// -------------------------------------------------------------------
register_node_ns("image_generation", ["生成", "图像"]);
register_node_ns("text_generation", ["生成", "文本"]);
register_node_ns("audio_generation", ["生成", "音频"]);
register_node_ns("video_concatenation", ["生成", "视频"]);
register_node_ns("ip_api", ["网络"]);
register_node_ns("math", ["数学"]);
register_node_ns("counter", ["数学"]);
register_node_ns("image_preview", ["预览"]);
register_node_ns("text_view", ["预览"]);
register_node_ns("css_preview", ["预览"]);
register_node_ns("css_builder", ["预览"]);
register_node_ns("text_input", ["输入"]);
register_node_ns("color_source", ["输入"]);
const init = () => {
  const canvas_el = document.getElementById("canvas");
  if (!canvas_el) return;

  const easel = new Easel(canvas_el, {
    plugins: [
      context_menu_plugin,
      minimap_plugin,
      controls_plugin,
      history_plugin,
      auto_pan_plugin,
      node_picker_plugin,
      executor_plugin
    ],
    custom_css: `
      .image-toolbar {
        position: absolute;
        bottom: -50px;
        left: 0;
        width: 100%;
        display: none;
        gap: 8px;
        background: var(--node-bg);
        padding: 8px;
        border-radius: 8px;
        box-sizing: border-box;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.5);
        border: 1px solid var(--node-border);
      }
      .node.selected .image-toolbar {
        display: flex;
      }
      .image-toolbar button {
        background: var(--primary-color);
        color: var(--canvas-bg);
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        flex: 1;
        transition: background 0.2s, color 0.2s;
      }
      .image-toolbar button:hover {
        background: var(--primary-hover, #0098ff);
      }
    `,
  });

  const { state, dispatch, app_events, set_theme } = easel;

  // Graph Stack Management
  type StackItem = { parent_node_id: string; parent_state: State };
  const graph_stack: StackItem[] = [];

  app_events.on("enter_subgraph", ({ node_id }) => {
    const node = easel.state.value.nodes[node_id];
    if (!node) return;

    graph_stack.push({ parent_node_id: node_id, parent_state: state.value });

    const inner_graph = (node.custom_data["graph"] as {
      nodes: any;
      wires: any;
    }) || { nodes: {}, wires: {} };

    dispatch(() => ({
      ...create_initial_state(),
      nodes: inner_graph.nodes,
      wires: inner_graph.wires,
    }));
  });

  const exit_subgraph_fn = () => {
    if (graph_stack.length === 0) return;
    const parent = graph_stack.pop()!;

    // Sync inner I/O nodes to parent node ports
    const inner_nodes = state.value.nodes;
    const inner_wires = state.value.wires;

    const parent_state = parent.parent_state;
    const next_parent_state = update_node_data(
      parent_state,
      parent.parent_node_id,
      (n) => ({
        ...n,
        custom_data: {
          ...n.custom_data,
          graph: { nodes: inner_nodes, wires: inner_wires },
        },
      })
    );

    dispatch(() => next_parent_state);
  };

  document
    .getElementById("btn-exit-subgraph")
    ?.addEventListener("click", exit_subgraph_fn);

  // Scene Management
  const load_scene = (name: string) => {
    graph_stack.length = 0;
    dispatch(() => create_initial_state());

    if (name === "default") {
      dispatch((s) =>
        add_node(s, {
          id: "node_1",
          type: "default",
          position: vec2_create(100, 100),
          size: vec2_create(200, 160),
          title: "Generate Noise",
          inputs: [],
          outputs: [
            {
              id: "out_1",
              label: "Image",
              type: "output",
              value_type: "image",
            },
          ],
          widgets: [{ id: "seed", type: "number", label: "Seed", value: 42, value_type: 'number' }],
          custom_data: {},
        })
      );
      dispatch((s) =>
        add_node(s, {
          id: "node_2",
          type: "image_preview",
          position: vec2_create(400, 100),
          size: vec2_create(480, 640),
          title: "Preview",
          inputs: [{ id: "in_1", label: "Image", type: "input" }],
          outputs: [],
          style_mode: "borderless",
          custom_data: { url: "https://picsum.photos/480/640" },
        })
      );
      dispatch((s) =>
        add_node(s, {
          id: "sub_1",
          type: "subgraph",
          position: vec2_create(100, 300),
          size: vec2_create(200, 120),
          title: "My Subgraph",
          inputs: [{ id: "in_1", label: "In", type: "input" }],
          outputs: [{ id: "out_1", label: "Out", type: "output" }],
          custom_data: {
            graph: {
              nodes: {
                in_1: {
                  id: "in_1",
                  type: "subgraph_input",
                  position: vec2_create(100, 100),
                  size: vec2_create(150, 100),
                  title: "Input",
                  inputs: [],
                  outputs: [{ id: "out_1", label: "In", type: "output" }],
                  custom_data: {},
                },
                out_1: {
                  id: "out_1",
                  type: "subgraph_output",
                  position: vec2_create(400, 100),
                  size: vec2_create(150, 100),
                  title: "Output",
                  inputs: [{ id: "in_1", label: "Out", type: "input" }],
                  outputs: [],
                  custom_data: {},
                },
              },
              wires: {},
            },
          },
        })
      );
    } else if (name === "perf") {
      load_perf_scene(dispatch);
    } else if (name === "math") {
      load_math_scene(dispatch);
    } else if (name === "executor") {
      load_executor_scene(dispatch);
    } else if (name === 'realtime') {
      load_realtime_scene(dispatch);
    } else if (name === "ip_api") {
      load_ip_api_scene(dispatch);
    } else if (name === "context_menu") {
      load_context_menu_scene(dispatch);
    }
  };

  document.getElementById("scene-selector")?.addEventListener("change", (e) => {
    load_scene((e.target as HTMLSelectElement).value);
  });

  document.getElementById("theme-selector")?.addEventListener("change", (e) => {
    const val = (e.target as HTMLSelectElement).value;
    if (val === "light") {
      set_theme(light_theme);
      document.body.style.background = "#e0e0e0";
      document.body.style.color = "#333";
      document.getElementById("hud")!.style.background = "#f5f5f5";
      document.getElementById("hud")!.style.color = "#333";
      document.getElementById("hud")!.style.borderColor = "#ccc";
      document
        .querySelectorAll(".hud-section")
        .forEach((el) => ((el as HTMLElement).style.background = "#fff"));
    } else {
      set_theme(default_theme);
      document.body.style.background = "#1e1e1e";
      document.body.style.color = "#fff";
      document.getElementById("hud")!.style.background = "#252526";
      document.getElementById("hud")!.style.color = "#fff";
      document.getElementById("hud")!.style.borderColor = "#333";
      document
        .querySelectorAll(".hud-section")
        .forEach((el) => ((el as HTMLElement).style.background = "#1e1e1e"));
    }
  });

  // Math Evaluator Effect
  effect(() => {
    if (
      (document.getElementById("scene-selector") as HTMLSelectElement)
        ?.value === "math"
    ) {
      dispatch((s) => evaluate_math_graph(s));
    }
  });

  // HUD 闁槒锟?
  const stats_el = document.getElementById("hud-stats");
  if (stats_el) {
    effect(() => {
      const s = state.value;
      const textContent = [
        `Nodes: ${Object.keys(s.nodes).length}`,
        `Wires: ${Object.keys(s.wires).length}`,
        `Camera: [${s.camera.position.x.toFixed(
          1
        )}, ${s.camera.position.y.toFixed(1)}] @ ${s.camera.zoom.toFixed(2)}x`,
        `Selected: ${
          s.selected_node_ids.length > 0
            ? s.selected_node_ids.join(", ")
            : "None"
        }`,
        `Interaction: ${s.interaction.mode}`,
        `Stack Depth: ${graph_stack.length}`,
      ].join("\n");
      if (stats_el.textContent !== textContent) {
        stats_el.textContent = textContent;
      }

      const btn_exit = document.getElementById("btn-exit-subgraph");
      if (btn_exit) {
        btn_exit.style.display = graph_stack.length > 0 ? "block" : "none";
      }
    });
  }

  // Drag and Drop Node Creation
  canvas_el.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  canvas_el.addEventListener('drop', (e) => {
    e.preventDefault();
    const type = e.dataTransfer?.getData('text/plain');
    if (!type) return;

    const rect = canvas_el.getBoundingClientRect();
    const screen_x = e.clientX - rect.left;
    const screen_y = e.clientY - rect.top;

    const s = state.value;
    const world_x = (screen_x - s.camera.position.x) / s.camera.zoom;
    const world_y = (screen_y - s.camera.position.y) / s.camera.zoom;

    const id = `${type}_${Date.now()}`;
    
    let node_data: GraphNode = {
      id,
      type: 'default',
      position: vec2_create(world_x, world_y),
      size: vec2_create(200, 120),
      title: type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      inputs: [],
      outputs: [],
      custom_data: {}
    };

    if (type === 'text_generation') {
      node_data = {
        ...node_data,
        custom_data: { color: '#3b82f6' },
        inputs: [
          { id: 'prompt', label: 'Prompt', type: 'input', value_type: 'text', required: true }
        ],
        outputs: [
          { id: 'out_list', label: 'List [ ]', type: 'output', value_type: 'text' }
        ],
        widgets: [
          { id: 'min_len', type: 'number', label: 'Minimum list length', value: 6, value_type: 'number' },
          { id: 'max_len', type: 'number', label: 'Maximum list length', value: 8, value_type: 'number' }
        ]
      };
    } else if (type === 'image_generation') {
      node_data = {
        ...node_data,
        custom_data: { color: '#10b981' },
        inputs: [
          { id: 'prompt', label: '[ ] Prompt', type: 'input', value_type: 'image' },
          { id: 'ref', label: 'Reference Image', type: 'input', value_type: 'image' }
        ],
        outputs: [
          { id: 'out_img', label: 'Image [ ]', type: 'output', value_type: 'image' }
        ],
        widgets: [
          { id: 'model', type: 'text', label: 'Model', value: 'Flux Dev', value_type: 'text' }
        ]
      };
    } else if (type === 'audio_generation') {
      node_data = {
        ...node_data,
        custom_data: { color: '#f59e0b' },
        inputs: [
          { id: 'script', label: '[ ] Script', type: 'input', value_type: 'audio' }
        ],
        outputs: [
          { id: 'out_audio', label: 'Audio [ ]', type: 'output', value_type: 'audio' }
        ],
        widgets: [
          { id: 'voice_id', type: 'text', label: 'Voice ID', value: 'Storyteller', value_type: 'text' }
        ]
      };
    } else if (type === 'video_concatenation') {
      node_data = {
        ...node_data,
        custom_data: { color: '#8b5cf6' },
        inputs: [
          { id: 'videos', label: '[ ] Videos', type: 'input', value_type: 'video' }
        ],
        outputs: [
          { id: 'out_video', label: 'Video [ ]', type: 'output', value_type: 'video' }
        ]
      };
    } else if (type === 'ip_api') {
      node_data = {
        ...node_data,
        custom_data: { color: '#06b6d4' },
        inputs: [{ id: 'query', label: 'Query', type: 'input', value_type: 'text' }],
        outputs: [
          { id: 'result', label: 'Result', type: 'output', value_type: 'object' },
          { id: 'country', label: 'Country', type: 'output', value_type: 'text' },
          { id: 'city', label: 'City', type: 'output', value_type: 'text' },
          { id: 'isp', label: 'ISP', type: 'output', value_type: 'text' },
          { id: 'lat', label: 'Lat', type: 'output', value_type: 'number' },
          { id: 'lon', label: 'Lon', type: 'output', value_type: 'number' },
          { id: 'query_ip', label: 'Queried', type: 'output', value_type: 'text' },
        ],
      };
    } else if (type === 'text_input') {
      node_data = {
        ...node_data,
        custom_data: { color: '#22c55e' },
        inputs: [],
        outputs: [{ id: 'query', label: 'Query', type: 'output', value_type: 'text' }],
        widgets: [{ id: 'value', type: 'text', label: 'Value', value: '', value_type: 'text' }],
      };
    } else if (type === 'text_view') {
      node_data = {
        ...node_data,
        custom_data: { color: '#a855f7' },
        inputs: [{ id: 'content', label: 'Content', type: 'input', value_type: 'text' }],
        outputs: [],
        resizable: false,
      };
    } else if (type === 'counter') {
      node_data = {
        ...node_data,
        type: 'counter',
        custom_data: { color: '#f97316' },
        inputs: [],
        outputs: [{ id: 'val', label: 'Value', type: 'output', value_type: 'number' }],
        widgets: [{ id: 'value', type: 'number', label: 'Value', value: 0, value_type: 'number' }],
        resizable: false,
      };
    }

    dispatch(st => add_node(st, node_data));
  });

  document.querySelectorAll('.node-drag-item').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      const type = (e.target as HTMLElement).dataset['type'];
      (e as DragEvent).dataTransfer?.setData('text/plain', type || '');
    });
  });

  // -------------------------------------------------------------------
  // Context menu demo 锟?plugin-level provider.
  // This registers extra items on every node to show how plugins
  // can augment the context menu without modifying node code.
  // -------------------------------------------------------------------
  if ((easel as any).context_menu) {
    const service = (easel as any).context_menu;

    service.register({
      id: 'playground_demo',
      priority: -5,
      get_items: (ctx: ContextMenuContext): readonly ContextMenuItem[] => {
        const items: ContextMenuItem[] = [];

        // Node info label 锟?shown when right-clicking any node
        if (ctx.node_id) {
          items.push({
            id: 'demo_node_info',
            kind: 'label',
            label: `Node: ${ctx.node_id} 路 ${ctx.node_type}`,
            icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
          });
        }

        // Item visible on any node
        if (ctx.node_id) {
          items.push({
            id: 'demo_log_info',
            label: 'Log Node Info',
            group: 'playground',
            icon: '<svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
            action: () => {
              const node = easel.state.value.nodes[ctx.node_id!];
              console.log('[ContextMenu Demo] Node:', ctx.node_id, 'Type:', ctx.node_type, 'Data:', node);
            },
          });
        }

        // Item only on text_input nodes
        if (ctx.node_type === 'text_input') {
          items.push({
            id: 'demo_fill_hello',
            label: "Fill 'Hello'",
            group: 'playground',
            icon: '<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>',
            action: () => {
              const node_id = ctx.node_id!;
              easel.dispatch(s => {
                const node = s.nodes[node_id];
                if (!node) return s;
                const widgets = (node.widgets || []).map(w =>
                  w.id === 'value' ? { ...w, value: 'Hello from ContextMenu!' } : w,
                );
                return { ...s, nodes: { ...s.nodes, [node_id]: { ...node, widgets } } };
              });
            },
          });
        }

        return items;
      },
    });

    console.log('[ContextMenu Demo] Plugin-level provider registered. Right-click any node to see demo items.');
  }

  // Load initial scene
  load_scene("default");

  document.getElementById("btn-save")?.addEventListener("click", () => {
    const json = serialize_state(state.value);
    localStorage.setItem("easel_save", json);
    alert("Saved to LocalStorage!");
  });

  document.getElementById("btn-load")?.addEventListener("click", () => {
    const json = localStorage.getItem("easel_save");
    if (json) {
      dispatch(() => deserialize_state(json));
    } else {
      alert("No save found.");
    }
  });
};

init();
