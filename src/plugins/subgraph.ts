import type { EaselPlugin } from '@/runtime/easel';
import { create_initial_state } from '@/core/state';
import { update_node_data, create_subgraph_from_selection } from '@/core/node_ops';
import type { State } from '@/core/types';

declare module '@/runtime/easel' {
  interface EaselPluginData {
    subgraph?: {
      exit: () => void;
      clear: () => void;
      stack_depth: () => number;
    };
  }
}

export const subgraph_plugin: EaselPlugin = easel => {
  type StackItem = { parent_node_id: string; parent_state: State };
  const graph_stack: StackItem[] = [];

  // Enter subgraph: swap state to internal graph
  easel.app_events.on('enter_subgraph', ({ node_id }) => {
    const node = easel.state.value.nodes[node_id];
    if (!node) return;

    graph_stack.push({ parent_node_id: node_id, parent_state: easel.state.value });

    const inner_graph = (node.custom_data?.['graph'] as
      | { nodes: any; bindings: any }
      | undefined) || { nodes: {}, bindings: {} };

    easel.dispatch(() => ({
      ...create_initial_state(),
      nodes: inner_graph.nodes,
      bindings: inner_graph.bindings,
    }));
  });

  // Exit subgraph: save inner state back, restore parent
  const exit_subgraph = () => {
    if (graph_stack.length === 0) return;
    const parent = graph_stack.pop()!;
    const inner_nodes = easel.state.value.nodes;
    const inner_bindings = easel.state.value.bindings;

    const parent_state = update_node_data(
      parent.parent_state,
      parent.parent_node_id,
      n => ({
        ...n,
        custom_data: {
          ...n.custom_data,
          graph: { nodes: inner_nodes, bindings: inner_bindings },
        },
      }),
    );

    easel.dispatch(() => parent_state);
  };

  const clear_stack = () => { graph_stack.length = 0; };

  easel.plugin_data.subgraph = {
    exit: exit_subgraph,
    clear: clear_stack,
    stack_depth: () => graph_stack.length,
  };

  // Escape → exit subgraph
  easel.keybindings.register({
    id: 'subgraph.exit',
    key: 'Escape',
    handler: exit_subgraph,
    description: 'Exit current subgraph',
  });

  // Ctrl+Shift+G → create subgraph from selection
  easel.keybindings.register({
    id: 'subgraph.create',
    key: 'g',
    ctrl: true,
    shift: true,
    handler: () => {
      easel.dispatch(s => create_subgraph_from_selection(s));
    },
    description: 'Create subgraph from selection',
  });
};