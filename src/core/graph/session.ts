import type {
  BindingId,
  BoundaryId,
  GraphBindingRecord,
  GraphBoundaryBinding,
  GraphDocument,
  GraphId,
  GraphNodeRecord,
  GraphScope,
  NodeId,
} from './types';
import * as E from 'fp-ts/Either';
import * as O from 'fp-ts/Option';

/** 保存完整 GraphDocument 与当前 scope 导航路径。path 最后一个 id 是当前 graph。 */
export type GraphSession = {
  readonly document: GraphDocument;
  readonly path: readonly GraphId[];
};

export type GraphSessionError =
  | { readonly type: 'root_graph_not_found'; readonly root_graph_id: GraphId }
  | { readonly type: 'root_graph_kind_invalid'; readonly root_graph_id: GraphId }
  | { readonly type: 'empty_path' }
  | {
      readonly type: 'path_root_mismatch';
      readonly path_root_id: GraphId;
      readonly root_graph_id: GraphId;
    }
  | { readonly type: 'path_graph_not_found'; readonly graph_id: GraphId }
  | {
      readonly type: 'path_parent_mismatch';
      readonly graph_id: GraphId;
      readonly expected_parent_graph_id: GraphId;
      readonly parent_graph_id?: GraphId;
    }
  | { readonly type: 'cannot_exit_root' }
  | {
      readonly type: 'host_not_found';
      readonly host_node_id: NodeId;
      readonly current_graph_id: GraphId;
    }
  | {
      readonly type: 'host_not_in_current_graph';
      readonly host_node_id: NodeId;
      readonly node_graph_id: GraphId;
      readonly current_graph_id: GraphId;
    }
  | { readonly type: 'nested_graph_required'; readonly host_node_id: NodeId }
  | {
      readonly type: 'nested_graph_not_found';
      readonly host_node_id: NodeId;
      readonly nested_graph_id: GraphId;
    }
  | {
      readonly type: 'nested_graph_parent_mismatch';
      readonly host_node_id: NodeId;
      readonly nested_graph_id: GraphId;
      readonly nested_parent_graph_id?: GraphId;
      readonly current_graph_id: GraphId;
    };

const get_validated_root = (
  document: GraphDocument,
): E.Either<GraphSessionError, GraphScope> => {
  const root_graph = document.graphs[document.root_graph_id];
  if (root_graph == null) {
    return E.left({ type: 'root_graph_not_found', root_graph_id: document.root_graph_id });
  }
  if (root_graph.kind !== 'root') {
    return E.left({ type: 'root_graph_kind_invalid', root_graph_id: document.root_graph_id });
  }
  return E.right(root_graph);
};

const validate_session_path = (
  document: GraphDocument,
  path: readonly GraphId[],
): E.Either<GraphSessionError, GraphScope> => {
  const root_result = get_validated_root(document);
  if (E.isLeft(root_result)) {
    return root_result;
  }

  if (path.length === 0) {
    return E.left({ type: 'empty_path' });
  }

  if (path[0] !== document.root_graph_id) {
    return E.left({
      type: 'path_root_mismatch',
      path_root_id: path[0],
      root_graph_id: document.root_graph_id,
    });
  }

  for (let index = 0; index < path.length; index++) {
    const graph_id = path[index];
    const graph = document.graphs[graph_id];
    if (graph == null) {
      return E.left({ type: 'path_graph_not_found', graph_id });
    }

    if (index > 0) {
      const parent_graph_id = graph.parent_graph_id;
      const expected_parent_graph_id = path[index - 1];
      if (parent_graph_id !== expected_parent_graph_id) {
        return E.left({
          type: 'path_parent_mismatch',
          graph_id,
          expected_parent_graph_id,
          parent_graph_id,
        });
      }
    }
  }

  const current_graph_id = path[path.length - 1];
  const current_graph = document.graphs[current_graph_id];
  if (current_graph == null) {
    return E.left({ type: 'path_graph_not_found', graph_id: current_graph_id });
  }
  return E.right(current_graph);
};

/**
 * 创建从 root 开始的 GraphSession。
 * @param document - 完整图文档
 * @returns 新 session 或错误
 */
export const create_graph_session = (
  document: GraphDocument,
): E.Either<GraphSessionError, GraphSession> => {
  const root_path: readonly GraphId[] = [document.root_graph_id];
  const path_result = validate_session_path(document, root_path);
  if (E.isLeft(path_result)) {
    return path_result;
  }

  return E.right({ document, path: root_path });
};

/**
 * 从当前 graph 的 host node 进入 nested_graph。
 * @param session - 当前 session
 * @param host_node_id - 当前 graph 中的 host node
 * @returns 新 session 或错误
 */
export const enter_subgraph = (
  session: GraphSession,
  host_node_id: NodeId,
): E.Either<GraphSessionError, GraphSession> => {
  const current_graph_result = validate_session_path(session.document, session.path);
  if (E.isLeft(current_graph_result)) {
    return current_graph_result;
  }
  const current_graph = current_graph_result.right;

  const host_node = session.document.nodes[host_node_id];
  if (host_node == null) {
    return E.left({ type: 'host_not_found', host_node_id, current_graph_id: current_graph.id });
  }
  if (host_node.graph_id !== current_graph.id) {
    return E.left({
      type: 'host_not_in_current_graph',
      host_node_id,
      node_graph_id: host_node.graph_id,
      current_graph_id: current_graph.id,
    });
  }

  const nested_graph_id = host_node.nested_graph_id;
  if (nested_graph_id == null) {
    return E.left({ type: 'nested_graph_required', host_node_id });
  }

  const nested_graph = session.document.graphs[nested_graph_id];
  if (nested_graph == null) {
    return E.left({ type: 'nested_graph_not_found', host_node_id, nested_graph_id });
  }
  if (nested_graph.parent_graph_id !== current_graph.id) {
    return E.left({
      type: 'nested_graph_parent_mismatch',
      host_node_id,
      nested_graph_id,
      nested_parent_graph_id: nested_graph.parent_graph_id,
      current_graph_id: current_graph.id,
    });
  }

  return E.right({
    document: session.document,
    path: [...session.path, nested_graph_id],
  });
};

/**
 * 退出当前 subgraph。root 不能 exit。
 * @param session - 当前 session
 * @returns 新 session 或错误
 */
export const exit_subgraph = (
  session: GraphSession,
): E.Either<GraphSessionError, GraphSession> => {
  const current_graph_result = validate_session_path(session.document, session.path);
  if (E.isLeft(current_graph_result)) {
    return current_graph_result;
  }

  if (session.path.length === 1) {
    return E.left({ type: 'cannot_exit_root' });
  }

  return E.right({
    document: session.document,
    path: session.path.slice(0, -1),
  });
};

/**
 * 用纯 document 操作后的新文档替换 session 文档，并保留当前 path。
 * 仅校验 path 对应 graph 仍存在且层级一致，不重复校验整个 document。
 * @param session - 原 session
 * @param document - 新文档
 * @returns 新 session 或错误
 */
export const session_set_document = (
  session: GraphSession,
  document: GraphDocument,
): E.Either<GraphSessionError, GraphSession> => {
  const path_result = validate_session_path(document, session.path);
  if (E.isLeft(path_result)) {
    return path_result;
  }

  return E.right({ document, path: session.path.slice() });
};

/** 返回当前 graph；若 path 失效则为 None。 */
export const session_current_graph = (session: GraphSession): O.Option<GraphScope> => {
  const current_graph_id = session.path[session.path.length - 1];
  return O.fromNullable(session.document.graphs[current_graph_id]);
};

/** 返回当前 graph 的节点表。 */
export const session_current_nodes = (
  session: GraphSession,
): Readonly<Record<NodeId, GraphNodeRecord>> => {
  const current_graph_id = session.path[session.path.length - 1];
  return Object.values(session.document.nodes)
    .filter(node => node.graph_id === current_graph_id)
    .reduce<Record<NodeId, GraphNodeRecord>>(
      (acc, node) => ({ ...acc, [node.id]: node }),
      {},
    );
};

/** 返回当前 graph 的 binding 表。 */
export const session_current_bindings = (
  session: GraphSession,
): Readonly<Record<BindingId, GraphBindingRecord>> => {
  const current_graph_id = session.path[session.path.length - 1];
  return Object.values(session.document.bindings)
    .filter(binding => binding.graph_id === current_graph_id)
    .reduce<Record<BindingId, GraphBindingRecord>>(
      (acc, binding) => ({ ...acc, [binding.id]: binding }),
      {},
    );
};

/** 返回当前 graph 的 boundary binding 表。 */
export const session_current_boundary_bindings = (
  session: GraphSession,
): Readonly<Record<BoundaryId, GraphBoundaryBinding>> => {
  const current_graph_id = session.path[session.path.length - 1];
  return Object.values(session.document.boundary_bindings)
    .filter(boundary => boundary.graph_id === current_graph_id)
    .reduce<Record<BoundaryId, GraphBoundaryBinding>>(
      (acc, boundary) => ({ ...acc, [boundary.id]: boundary }),
      {},
    );
};
