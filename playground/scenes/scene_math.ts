import { vec2_create } from "@/core/math";
import { add_node } from "@/core/node_ops";
import type { State } from "@/core/types";
import type { Dispatch } from "@/runtime/registry";

export const load_math_scene = (dispatch: Dispatch) => {
  dispatch((s) =>
    add_node(s, {
      id: "num_1",
      type: "default",
      position: vec2_create(100, 100),
      size: vec2_create(150, 100),
      title: "Number A",
      inputs: [],
      outputs: [
        { id: "out", label: "Value", type: "output", value_type: "number" },
      ],
      widgets: [{ id: "val", type: "number", label: "Val", value: 5, value_type: "number" }],
      custom_data: {},
    })
  );

  dispatch((s) =>
    add_node(s, {
      id: "num_2",
      type: "default",
      position: vec2_create(100, 250),
      size: vec2_create(150, 100),
      title: "Number B",
      inputs: [],
      outputs: [
        { id: "out", label: "Value", type: "output", value_type: "number" },
      ],
      widgets: [{ id: "val", type: "number", label: "Val", value: 10, value_type: "number" }],
      custom_data: {},
    })
  );

  dispatch((s) =>
    add_node(s, {
      id: "add_1",
      type: "math",
      position: vec2_create(350, 150),
      size: vec2_create(150, 120),
      title: "Add",
      inputs: [
        { id: "a", label: "A", type: "input", accepts: ["number"] },
        { id: "b", label: "B", type: "input", accepts: ["number"] },
      ],
      outputs: [
        { id: "out", label: "Result", type: "output", value_type: "number" },
      ],
      custom_data: { operation: "add" },
    })
  );
};

export const evaluate_math_graph = (state: State): State => {
  const new_nodes = { ...state.nodes };
  let changed = false;

  const get_port_value = (node_id: string, port_id: string): number => {
    const node = state.nodes[node_id];
    if (!node) return 0;
    if (node.type === "default") {
      const widget = node.widgets?.find((w) => w.id === "val");
      return widget ? Number(widget.value) : 0;
    }
    if (node.type === "math") {
      return Number(node.custom_data["result"] || 0);
    }
    return 0;
  };

  for (const node of Object.values(state.nodes)) {
    if (node.type === "math") {
      const wire_a = Object.values(state.wires).find(
        (w) => w.target_node_id === node.id && w.target_port_id === "a"
      );
      const wire_b = Object.values(state.wires).find(
        (w) => w.target_node_id === node.id && w.target_port_id === "b"
      );

      const val_a = wire_a
        ? get_port_value(wire_a.source_node_id, wire_a.source_port_id)
        : 0;
      const val_b = wire_b
        ? get_port_value(wire_b.source_node_id, wire_b.source_port_id)
        : 0;

      let res = 0;
      if (node.custom_data["operation"] === "add") res = val_a + val_b;

      if (node.custom_data["result"] !== res) {
        new_nodes[node.id] = {
          ...node,
          custom_data: { ...node.custom_data, result: res },
        };
        changed = true;
      }
    }
  }

  return changed ? { ...state, nodes: new_nodes } : state;
};
