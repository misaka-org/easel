// Core exports
export { create_initial_state } from "./core/state";
export { serialize_state, deserialize_state } from "./core/serialization";
export { add_node, move_node, move_nodes, update_node_data, update_widget_value, remove_node } from "./core/node_ops";
export { add_wire, remove_wire, clear_wires } from "./core/wire_ops";
export * from "./core/math";
export * from "./core/types";

// Runtime exports
export { mount_easel } from "./runtime/mount";
export { EaselNode, register_node_type, get_node_constructor, get_registered_types, type Dispatch } from "./runtime/registry";
export { default_theme, light_theme, apply_theme, type Theme } from "./runtime/theme";

// Executor exports
export { register_execute_fn, get_execute_fn } from "./executor/registry";
export { init_execution, step_execution, run_execution, create_initial_execution_state } from "./executor/engine";
export * from "./executor/types";

// Plugins (optional)
export { minimap_plugin } from "./plugins/minimap";
export { controls_plugin } from "./plugins/controls";
export { context_menu_plugin } from "./plugins/context_menu";
export { history_plugin } from "./plugins/history";
export { auto_pan_plugin } from "./plugins/auto_pan";
export { executor_plugin } from "./plugins/executor_plugin";
export { with_guidelines } from "./plugins/guidelines";

// Built-in nodes (internal)
import { SubgraphNode, SubgraphInputNode, SubgraphOutputNode } from "./nodes/subgraph";
import { GroupNode } from "./nodes/group";
import { register_node_type } from "./runtime/registry";

export function register_builtin_nodes() {
  register_node_type("subgraph", SubgraphNode);
  register_node_type("subgraph_input", SubgraphInputNode);
  register_node_type("subgraph_output", SubgraphOutputNode);
  register_node_type("group", GroupNode);
}