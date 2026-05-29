// Core exports
export { create_initial_state } from './core/state';

export {
  add_node,
  move_node,
  move_nodes,
  update_node_data,
  update_widget_value,
  remove_node,
  create_subgraph_from_selection,
  expand_subgraph,
} from './core/node_ops';

export * from './core/math';
export * from './core/types';

// Runtime exports
export { Easel, type EaselEvents } from './runtime/easel';
export { KeybindingManager, type KeybindingDef } from './runtime/keybindings';
export { auto_layout } from './runtime/auto_layout';
export {
  EaselNode,
  register_node_type,
  get_node_constructor,
  get_registered_types,
  type ExecuteContext,
} from './runtime/registry';
export type { Dispatch } from './runtime/store';
export {
  register_node_spec,
  create_node_data,
  resolve_node_spec,
  type NodeSpec,
} from './runtime/registry';
export { register_node_ns, get_node_ns } from './runtime/registry';
export { DefaultNode } from './runtime/default_node';
export { Register, get_widget_type } from './runtime/register';
export type { WidgetTypeDef, WidgetUpdateOptions } from './runtime/register';
export { default_theme, light_theme, apply_theme, type Theme } from './runtime/theme';

// Executor exports
export { GraphExecutor } from './executor/engine';
export * from './executor/types';

// Plugins (optional)
export { minimap_plugin } from './plugins/minimap';
export { controls_plugin } from './plugins/controls';
export { context_menu_plugin, ContextMenuService } from './plugins/context_menu';
export type {
  ContextMenuContext,
  ContextMenuItem,
  ContextMenuProvider,
} from './plugins/context_menu/types';
export { history_plugin } from './plugins/history';
export { auto_pan_plugin } from './plugins/auto_pan';
export { executor_plugin } from './plugins/executor_plugin';

export { guidelines_plugin } from './plugins/guidelines';
export { toolbar_plugin } from './plugins/toolbar';
export { node_picker_plugin } from './plugins/node_picker';
export { subgraph_plugin } from './plugins/subgraph';

// Built-in nodes (for backward compat; no longer needed since easel.register handles it)
import { register_node_type } from './runtime/registry';
import { vec2_create } from './core/math';
import { SubgraphNode, SubgraphInputNode, SubgraphOutputNode } from './nodes/subgraph';
import { GroupNode } from './nodes/group';

export function register_builtin_nodes() {
  register_node_type('subgraph', SubgraphNode);
  register_node_type('group', GroupNode);
  register_node_type('subgraph_input', SubgraphInputNode, {
    resizable: false,
    size: vec2_create(20, 20),
  });
  register_node_type('subgraph_output', SubgraphOutputNode, {
    resizable: false,
    size: vec2_create(20, 20),
  });
}
