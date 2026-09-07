import type { GraphNode } from '@/core/types';
import type { NodeFlag } from '@/core/node_ops';
import { ICON_LOCK } from '@/icons';
import { toggle_node_flag } from '@/core/node_ops';
import type { Dispatch } from '@/runtime/store';
import type { DocumentController } from '@/runtime/document_controller';
import type { ContextMenuItem } from '@/plugins/context_menu/types';
import * as E from 'fp-ts/Either';
import { translate } from './i18n';

export type { NodeFlag };

const is_view_only_rail = (node: GraphNode): boolean => {
  const direction = node.custom_data['boundary_direction'];
  return (
    node.custom_data['view_only'] === true &&
    (node.type === 'subgraph_input' || node.type === 'subgraph_output') &&
    (direction === 'input' || direction === 'output')
  );
};

export const supports_node_flag = (node: GraphNode): boolean => {
  if (is_view_only_rail(node)) {
    return false;
  }
  return node.type !== 'subgraph_input' && node.type !== 'subgraph_output';
};

export const is_node_flag_set = (node: GraphNode, flag: NodeFlag): boolean => {
  switch (flag) {
    case 'muted':
      return node.muted === true;
    case 'pinned':
      return node.pinned === true;
    case 'locked':
      return node.locked === true;
  }
};

export const get_node_flag_context_menu_items = (
  node_id: string,
  node: GraphNode,
  on_toggle: (flag: NodeFlag) => void,
): readonly ContextMenuItem[] => {
  if (!supports_node_flag(node)) {
    return [];
  }
  const is_muted = is_node_flag_set(node, 'muted');
  const is_pinned = is_node_flag_set(node, 'pinned');
  const is_locked = is_node_flag_set(node, 'locked');
  return [
    {
      id: 'toggle_muted',
      label: translate(is_muted ? 'context_unmute' : 'context_mute'),
      icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/></svg>',
      group: 'node_state',
      action: () => on_toggle('muted'),
    },
    {
      id: 'toggle_pinned',
      label: translate(is_pinned ? 'context_unpin' : 'context_pin'),
      icon: '<svg viewBox="0 0 24 24"><path d="M9 4h6v4l2 4v2H7v-2l2-4V4z"/><line x1="12" y1="14" x2="12" y2="20"/></svg>',
      group: 'node_state',
      action: () => on_toggle('pinned'),
    },
    {
      id: 'toggle_locked',
      label: translate(is_locked ? 'context_unlock' : 'context_lock'),
      icon: ICON_LOCK,
      group: 'node_state',
      action: () => on_toggle('locked'),
    },
  ];
};

const with_next_flag = <T extends GraphNode>(node: T, flag: NodeFlag): T => {
  const current_value = is_node_flag_set(node, flag);
  const next_value = !current_value;
  switch (flag) {
    case 'muted':
      return { ...node, muted: next_value };
    case 'pinned':
      return { ...node, pinned: next_value };
    case 'locked':
      return { ...node, locked: next_value };
  }
};

export const toggle_document_node_flag = (
  controller: DocumentController,
  node_id: string,
  flag: NodeFlag,
): void => {
  const result = controller.update_node(node_id, node => with_next_flag(node, flag));
  if (E.isLeft(result)) {
    console.warn(`[playground] node flag update failed: ${String(result.left.type)}`);
  }
};

export const toggle_legacy_node_flag = (
  dispatch: Dispatch,
  node_id: string,
  flag: NodeFlag,
): void => {
  dispatch(state => toggle_node_flag(state, node_id, flag));
};

export const toggle_node_flag_for_context = (
  controller: DocumentController | undefined,
  dispatch: Dispatch,
  node_id: string,
  flag: NodeFlag,
): void => {
  if (controller?.view.nodes[node_id] != null) {
    toggle_document_node_flag(controller, node_id, flag);
  } else {
    toggle_legacy_node_flag(dispatch, node_id, flag);
  }
};
