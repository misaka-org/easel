import type { GraphNode } from '../core/types';
import type {
  BindingId,
  BoundaryId,
  GraphBoundaryBinding,
  GraphBindingRecord,
  GraphDocument,
  GraphId,
  GraphNodeRecord,
  GraphScope,
  NodeId,
} from '../core/graph/types';
import type {
  AddGraphBoundaryOptions,
  GraphBoundaryDirection,
  GraphBoundaryError,
  GraphBoundarySlotUpdate,
} from '../core/graph/boundary';
import type { GraphDocumentError } from '../core/graph/document';
import type { GraphSession, GraphSessionError } from '../core/graph/session';
import type {
  GraphDeserializationError,
  GraphDocumentSerializeOptions,
} from '../core/graph/serialization';
import type { GraphValidationIssue } from '../core/graph/validation';
import {
  add_graph_boundary as core_add_graph_boundary,
  remove_graph_boundary as core_remove_graph_boundary,
  update_graph_boundary_slot as core_update_graph_boundary_slot,
} from '../core/graph/boundary';
import {
  add_binding as core_add_binding,
  add_node as core_add_node,
  remove_binding as core_remove_binding,
  remove_node as core_remove_node,
  update_node as core_update_node,
} from '../core/graph/document';
import {
  create_graph_session,
  enter_subgraph as enter_session_subgraph,
  exit_subgraph as exit_session_subgraph,
  session_current_bindings,
  session_current_boundary_bindings,
  session_current_graph,
  session_current_nodes,
  session_set_document,
} from '../core/graph/session';
import { deserialize_graph_document, serialize_graph_document } from '../core/graph/serialization';
import { shallowRef, type ShallowRef } from '@vue/reactivity';
import * as E from 'fp-ts/Either';
import * as O from 'fp-ts/Option';

/** Read-only projection of the graph currently addressed by a GraphSession. */
export type DocumentGraphView = {
  readonly graph: GraphScope;
  readonly path: readonly GraphId[];
  readonly nodes: Readonly<Record<NodeId, GraphNodeRecord>>;
  readonly bindings: Readonly<Record<BindingId, GraphBindingRecord>>;
  readonly boundary_bindings: Readonly<Record<BoundaryId, GraphBoundaryBinding>>;
};

/** Node input for the current graph; graph_id may be supplied for type reuse. */
export type DocumentNodeInput = GraphNode & { readonly graph_id?: GraphId };

/** Binding input for the current graph; graph_id may be supplied for type reuse. */
export type DocumentBindingInput = Omit<GraphBindingRecord, 'graph_id'> & {
  readonly graph_id?: GraphId;
};

/** Boundary options for the current graph; graph_id may be supplied for type reuse. */
export type DocumentBoundaryInput = Omit<AddGraphBoundaryOptions, 'graph_id'> & {
  readonly graph_id?: GraphId;
};

/** Errors raised when controller input targets a scope other than the active one. */
export type DocumentControllerScopeError =
  | {
      readonly type: 'node_not_in_current_graph';
      readonly node_id: NodeId;
      readonly node_graph_id: GraphId;
      readonly current_graph_id: GraphId;
    }
  | {
      readonly type: 'binding_not_in_current_graph';
      readonly binding_id: BindingId;
      readonly binding_graph_id: GraphId;
      readonly current_graph_id: GraphId;
    }
  | {
      readonly type: 'node_graph_mismatch';
      readonly node_id: NodeId;
      readonly requested_graph_id: GraphId;
      readonly current_graph_id: GraphId;
    }
  | {
      readonly type: 'binding_graph_mismatch';
      readonly binding_id: BindingId;
      readonly requested_graph_id: GraphId;
      readonly current_graph_id: GraphId;
    };

/** Identifiable failure union produced by DocumentController operations. */
export type DocumentControllerError =
  | GraphSessionError
  | GraphDocumentError
  | GraphBoundaryError
  | DocumentControllerScopeError;

/** Identifiable failure union for JSON-based controller creation. */
export type DocumentControllerDeserializeError =
  | GraphSessionError
  | GraphDeserializationError
  | readonly GraphValidationIssue[];

const build_view = (session: GraphSession): DocumentGraphView => {
  const current_graph = session_current_graph(session);
  if (O.isNone(current_graph)) {
    const graph_id =
      session.path.length > 0
        ? session.path[session.path.length - 1]
        : session.document.root_graph_id;
    throw new Error(`DocumentController cannot resolve graph '${graph_id}'.`);
  }

  return {
    graph: current_graph.value,
    path: session.path.slice(),
    nodes: session_current_nodes(session),
    bindings: session_current_bindings(session),
    boundary_bindings: session_current_boundary_bindings(session),
  };
};

/**
 * Reactive GraphDocument/GraphSession controller for the current scope.
 * This class has no DOM dependency and does not migrate the legacy Easel Store.
 */
export class DocumentController {
  private readonly session_ref: ShallowRef<GraphSession>;

  private constructor(session: GraphSession) {
    this.session_ref = shallowRef(session);
  }

  /** Create a controller from a GraphDocument, always starting at its root. */
  static create(document: GraphDocument): E.Either<GraphSessionError, DocumentController> {
    const session_result = create_graph_session(document);
    if (E.isLeft(session_result)) {
      return session_result;
    }
    return E.right(new DocumentController(session_result.right));
  }

  /** Create a controller from serialized GraphDocument JSON, starting at root. */
  static from_json(json: string): E.Either<DocumentControllerDeserializeError, DocumentController> {
    const document_result = deserialize_graph_document(json);
    if (E.isLeft(document_result)) {
      return E.left(document_result.left);
    }
    return DocumentController.create(document_result.right);
  }

  /** Current reactive GraphSession value. */
  get session(): GraphSession {
    return this.session_ref.value;
  }

  /** Current complete GraphDocument. */
  get document(): GraphDocument {
    return this.session.document;
  }

  /** Current navigation path from root to the active graph. */
  get path(): readonly GraphId[] {
    return this.session.path;
  }

  /** Current graph scope, if the session path is still valid. */
  get current_graph(): O.Option<GraphScope> {
    return session_current_graph(this.session);
  }

  /** Alias for current_graph. */
  get graph(): O.Option<GraphScope> {
    return this.current_graph;
  }

  /** Current-scope readonly view. */
  get view(): DocumentGraphView {
    return build_view(this.session);
  }

  /** Navigate into the subgraph referenced by a host node in the current graph. */
  enter_subgraph(host_node_id: NodeId): E.Either<DocumentControllerError, DocumentGraphView> {
    const session_result = enter_session_subgraph(this.session, host_node_id);
    return this.commit_session_result(session_result);
  }

  /** Navigate to the parent graph. Root navigation returns cannot_exit_root. */
  exit_subgraph(): E.Either<DocumentControllerError, DocumentGraphView> {
    const session_result = exit_session_subgraph(this.session);
    return this.commit_session_result(session_result);
  }

  /** Replace the document while preserving the active path. */
  commit_document(
    next_document: GraphDocument,
  ): E.Either<DocumentControllerError, DocumentGraphView> {
    const session_result = session_set_document(this.session, next_document);
    return this.commit_session_result(session_result);
  }

  /** Add a node to the current graph. */
  add_node(node: DocumentNodeInput): E.Either<DocumentControllerError, DocumentGraphView> {
    const current_graph_id = this.current_graph_id();
    const requested_graph_id = node.graph_id;
    if (requested_graph_id !== undefined && requested_graph_id !== current_graph_id) {
      return E.left({
        type: 'node_graph_mismatch',
        node_id: node.id,
        requested_graph_id,
        current_graph_id,
      });
    }

    const result = core_add_node(this.document, current_graph_id, node);
    return this.commit_document_result(result);
  }

  /** Remove a node from the current graph. */
  remove_node(node_id: NodeId): E.Either<DocumentControllerError, DocumentGraphView> {
    const current_graph_id = this.current_graph_id();
    const node = this.document.nodes[node_id];
    if (node == null) {
      return E.left({ type: 'node_not_found', node_id });
    }
    if (node.graph_id !== current_graph_id) {
      return E.left({
        type: 'node_not_in_current_graph',
        node_id,
        node_graph_id: node.graph_id,
        current_graph_id,
      });
    }

    const result = core_remove_node(this.document, node_id);
    return this.commit_document_result(result);
  }

  /** Update a node in the current graph with a pure updater. */
  update_node(
    node_id: NodeId,
    updater: (node: GraphNodeRecord) => GraphNodeRecord,
  ): E.Either<DocumentControllerError, DocumentGraphView> {
    const current_graph_id = this.current_graph_id();
    const node = this.document.nodes[node_id];
    if (node == null) {
      return E.left({ type: 'node_not_found', node_id });
    }
    if (node.graph_id !== current_graph_id) {
      return E.left({
        type: 'node_not_in_current_graph',
        node_id,
        node_graph_id: node.graph_id,
        current_graph_id,
      });
    }

    const result = core_update_node(this.document, node_id, updater);
    return this.commit_document_result(result);
  }

  /** Add a binding between two nodes in the current graph. */
  add_binding(binding: DocumentBindingInput): E.Either<DocumentControllerError, DocumentGraphView> {
    const current_graph_id = this.current_graph_id();
    const requested_graph_id = binding.graph_id;
    if (requested_graph_id !== undefined && requested_graph_id !== current_graph_id) {
      return E.left({
        type: 'binding_graph_mismatch',
        binding_id: binding.id,
        requested_graph_id,
        current_graph_id,
      });
    }

    const result = core_add_binding(this.document, {
      ...binding,
      graph_id: current_graph_id,
    });
    return this.commit_document_result(result);
  }

  /** Remove a binding from the current graph. */
  remove_binding(binding_id: BindingId): E.Either<DocumentControllerError, DocumentGraphView> {
    const current_graph_id = this.current_graph_id();
    const binding = this.document.bindings[binding_id];
    if (binding == null) {
      return E.left({ type: 'binding_not_found', binding_id });
    }
    if (binding.graph_id !== current_graph_id) {
      return E.left({
        type: 'binding_not_in_current_graph',
        binding_id,
        binding_graph_id: binding.graph_id,
        current_graph_id,
      });
    }

    const result = core_remove_binding(this.document, binding_id);
    return this.commit_document_result(result);
  }

  /** Add a boundary slot and mapping to the current graph. */
  add_graph_boundary(
    options: DocumentBoundaryInput,
  ): E.Either<DocumentControllerError, DocumentGraphView> {
    const current_graph_id = this.current_graph_id();
    const requested_graph_id = options.graph_id;
    if (requested_graph_id !== undefined && requested_graph_id !== current_graph_id) {
      return E.left<GraphDocumentError>({ type: 'invalid_arguments' });
    }

    const result = core_add_graph_boundary(this.document, {
      ...options,
      graph_id: current_graph_id,
    });
    return this.commit_document_result(result);
  }

  /** Remove a boundary slot from the current graph. */
  remove_graph_boundary(
    direction: GraphBoundaryDirection,
    slot_id: string,
  ): E.Either<DocumentControllerError, DocumentGraphView> {
    const current_graph_id = this.current_graph_id();
    const result = core_remove_graph_boundary(this.document, current_graph_id, direction, slot_id);
    return this.commit_document_result(result);
  }

  /** Update boundary slot metadata in the current graph. */
  update_graph_boundary_slot(
    direction: GraphBoundaryDirection,
    slot_id: string,
    updates: GraphBoundarySlotUpdate,
  ): E.Either<DocumentControllerError, DocumentGraphView> {
    const current_graph_id = this.current_graph_id();
    const result = core_update_graph_boundary_slot(
      this.document,
      current_graph_id,
      direction,
      slot_id,
      updates,
    );
    return this.commit_document_result(result);
  }

  /** Serialize the full GraphDocument held by the controller. */
  serialize(options?: GraphDocumentSerializeOptions): string {
    return serialize_graph_document(this.document, options);
  }

  private current_graph_id(): GraphId {
    const current_graph = session_current_graph(this.session);
    if (O.isNone(current_graph)) {
      throw new Error('DocumentController session path is invalid.');
    }
    return current_graph.value.id;
  }

  private commit_session_result(
    session_result: E.Either<GraphSessionError, GraphSession>,
  ): E.Either<GraphSessionError, DocumentGraphView> {
    if (E.isLeft(session_result)) {
      return session_result;
    }
    const next_session = session_result.right;
    const next_view = build_view(next_session);
    this.session_ref.value = next_session;
    return E.right(next_view);
  }

  private commit_document_result<L>(
    document_result: E.Either<L, GraphDocument>,
  ): E.Either<GraphSessionError | L, DocumentGraphView> {
    if (E.isLeft(document_result)) {
      return document_result;
    }
    return this.commit_session_result(session_set_document(this.session, document_result.right));
  }
}

/** Create a controller from a GraphDocument, starting at its root. */
export const create_document_controller = (
  document: GraphDocument,
): E.Either<GraphSessionError, DocumentController> => {
  return DocumentController.create(document);
};

/** Deserialize GraphDocument JSON and create a controller from its root. */
export const deserialize_document_controller = (
  json: string,
): E.Either<DocumentControllerDeserializeError, DocumentController> => {
  return DocumentController.from_json(json);
};

/** Alias for deserialize_document_controller. */
export const create_document_controller_from_json = deserialize_document_controller;
