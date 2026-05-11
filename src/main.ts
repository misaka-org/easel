import { effect } from "@vue/reactivity";
import EventEmitter from "eventemitter3";
import { create_store } from "./runtime/store";
import { setup_events } from "./runtime/events";
import { render_nodes } from "./runtime/render";
import { render_wires } from "./runtime/render_wires";
import { EaselNode, register_node_type } from "./runtime/registry";
import { with_guidelines } from "./plugins/guidelines";
import { add_node, update_node_data } from "./core/node_ops";
import { create_initial_state } from "./core/state";
import { serialize_state, deserialize_state } from "./core/serialization";
import { vec2_create } from "./core/math";
import type { GraphNode, State } from "./core/types";

import {
  SubgraphNode,
  SubgraphInputNode,
  SubgraphOutputNode,
} from "./nodes/subgraph";
import { MathNode } from "./nodes/math";
import { GroupNode } from "./nodes/group";
import { load_math_scene, evaluate_math_graph } from "./scenes/scene_math";
import { load_perf_scene } from "./scenes/scene_perf";

import "./style.css";

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
    // this.preview.style.borderRadius = "8px";
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
register_node_type("math", MathNode);
register_node_type("group", GroupNode);

const init = () => {
  const canvas_el = document.getElementById("canvas");
  if (!canvas_el) return;

  const { state, dispatch } = create_store();
  const context = { app_events };

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
          widgets: [{ id: "seed", type: "number", label: "Seed", value: 42 }],
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
    }
  };

  document.getElementById("scene-selector")?.addEventListener("change", (e) => {
    load_scene((e.target as HTMLSelectElement).value);
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

  const enhanced_dispatch = with_guidelines(canvas_el, state, dispatch);

  render_nodes(canvas_el, state, enhanced_dispatch, context);
  render_wires(canvas_el, state);
  setup_events(canvas_el, enhanced_dispatch, app_events);

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
