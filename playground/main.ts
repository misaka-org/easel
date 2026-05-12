import { effect } from "@vue/reactivity";
import { mount_easel, register_node_type, register_execute_fn, EaselNode } from "@/index";
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

import { SubgraphNode, SubgraphInputNode, SubgraphOutputNode } from "@/nodes/subgraph";
import { GroupNode } from "@/nodes/group";
import { MathNode } from "./nodes/math";
import { load_math_scene, evaluate_math_graph } from "./scenes/scene_math";
import { load_perf_scene } from "./scenes/scene_perf";
import { load_executor_scene } from "./scenes/scene_executor";
import EventEmitter from "eventemitter3";

const app_events = new EventEmitter();

// Custom Node Example
class ImagePreviewNode extends EaselNode {
  private body!: HTMLElement;
  private preview!: HTMLImageElement;
  private toolbar!: HTMLElement;

  mount(node_data: GraphNode): void {
    this.container.classList.add("borderless");
    this.container.style.borderRadius = "0px";

    this.body = document.createElement("div");
    this.body.className = "node-body";
    this.body.style.width = "100%";
    this.body.style.height = "100%";

    this.preview = document.createElement("img");
    this.preview.style.width = "100%";
    this.preview.style.height = "100%";
    this.preview.style.objectFit = "cover";
    this.preview.style.pointerEvents = "none";
    this.preview.src = (node_data.custom_data["url"] as string) || "";

    this.toolbar = document.createElement("div");
    this.toolbar.className = "image-toolbar";
    this.toolbar.innerHTML = `
      <button>Crop</button>
      <button>Edit</button>
    `;

    this.body.appendChild(this.preview);
    this.body.appendChild(this.toolbar);
    this.container.appendChild(this.body);
  }

  update(_node_data: GraphNode, _state: any): void {
    // 静态内容，仅依靠CSS显示隐藏toolbar
  }

  unmount(): void {
    this.body.remove();
  }
}

register_node_type("image_preview", ImagePreviewNode);
register_node_type("subgraph", SubgraphNode);
register_node_type("subgraph_input", SubgraphInputNode);
register_node_type("subgraph_output", SubgraphOutputNode);
register_node_type("group", GroupNode);
register_node_type("math", MathNode);

register_execute_fn("math", async ({ node, inputs, report_progress }) => {
  report_progress(30);
  await new Promise((r) => setTimeout(r, 500));
  report_progress(60);
  await new Promise((r) => setTimeout(r, 500));
  const a = Number(inputs['a'] || 0);
  const b = Number(inputs['b'] || 0);
  const op = node.custom_data['operation'] || 'add';
  const res = op === 'add' ? a + b : 0;
  report_progress(100);
  return { out: res };
});

register_execute_fn("default", async ({ node, inputs, report_progress }) => {
  report_progress(50);
  await new Promise((r) => setTimeout(r, 500));
  report_progress(100);
  return { out: (inputs['val'] as number) || 0 };
});

register_execute_fn("text_generation", async ({ inputs, report_progress }) => {
  report_progress(30);
  await new Promise((r) => setTimeout(r, 400));
  report_progress(70);
  await new Promise((r) => setTimeout(r, 400));
  report_progress(100);
  return { out_list: `Gen: ${inputs['prompt'] || 'empty'}` };
});

register_execute_fn("image_generation", async ({ inputs, report_progress }) => {
  report_progress(10);
  await new Promise((r) => setTimeout(r, 300));
  report_progress(50);
  await new Promise((r) => setTimeout(r, 600));
  report_progress(100);
  return { out_img: `Image for: ${inputs['prompt']}` };
});

const init = () => {
  const canvas_el = document.getElementById("canvas");
  if (!canvas_el) return;

  const { state, dispatch, app_events, set_theme } = mount_easel(canvas_el, {
    plugins: [
      minimap_plugin,
      controls_plugin,
      context_menu_plugin,
      history_plugin,
      auto_pan_plugin,
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
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        flex: 1;
      }
      .image-toolbar button:hover {
        background: var(--primary-hover, #0098ff);
      }
    `,
  });

  // Graph Stack Management
  type StackItem = { parent_node_id: string; parent_state: State };
  const graph_stack: StackItem[] = [];

  app_events.on("enter_subgraph", ({ node_id }) => {
    const node = state.value.nodes[node_id];
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

  // HUD 逻辑
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
          { id: 'prompt', label: 'Prompt', type: 'input', value_type: 'text' }
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
    }

    dispatch(st => add_node(st, node_data));
  });

  document.querySelectorAll('.node-drag-item').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      const type = (e.target as HTMLElement).dataset['type'];
      (e as DragEvent).dataTransfer?.setData('text/plain', type || '');
    });
  });

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