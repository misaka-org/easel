import { describe, expect, it } from 'vitest';
import type { Port } from '@/core/types';
import type { GraphDocument, GraphNodeRecord } from '@/core/graph/types';
import {
  add_binding,
  add_node,
  create_empty_graph_document,
  type GraphDocumentError,
} from '@/core/graph/document';
import { pack_nodes, type PackNodesOptions } from '@/core/graph/subgraph';
import {
  deserialize_graph_document,
  serialize_graph_document,
  type GraphDeserializationError,
} from '@/core/graph/serialization';
import type { GraphValidationIssue } from '@/core/graph/validation';
import * as E from 'fp-ts/Either';

const port = (id: string, kind: 'input' | 'output'): Port => {
  return { id, label: id, type: kind };
};

const make_node = (
  id: string,
  graph_id: string,
  inputs: readonly Port[] = [],
  outputs: readonly Port[] = [],
): GraphNodeRecord => {
  return {
    id,
    graph_id,
    type: 'default',
    position: { x: 0, y: 0 },
    size: { x: 100, y: 100 },
    title: id,
    inputs,
    outputs,
    custom_data: {
      source: 'serialization-test',
      tags: ['roundtrip', 42],
    },
  };
};

const unwrap_document = (result: E.Either<GraphDocumentError, GraphDocument>): GraphDocument => {
  if (E.isLeft(result)) {
    throw new Error(`unexpected error: ${result.left.type}`);
  }
  return result.right;
};

const make_document = (): GraphDocument => {
  const source = make_node('source', 'root', [], [port('source_out', 'output')]);
  const target = make_node('target', 'root', [port('target_in', 'input')], []);
  let document = unwrap_document(add_node(create_empty_graph_document(), source));
  document = unwrap_document(add_node(document, target));
  document = unwrap_document(
    add_binding(document, {
      id: 'binding',
      graph_id: 'root',
      source_id: 'source',
      source_handle: 'source_out',
      target_id: 'target',
      target_handle: 'target_in',
    }),
  );
  const options: PackNodesOptions = {
    source_graph_id: 'root',
    node_ids: ['target'],
    graph_id: 'child',
    host_node_id: 'host',
  };
  return unwrap_document(pack_nodes(document, options));
};

const get_deserialization_error = (
  result: E.Either<GraphDeserializationError | readonly GraphValidationIssue[], GraphDocument>,
): GraphDeserializationError => {
  if (E.isRight(result)) {
    throw new Error('expected deserialization error');
  }
  const left = result.left;
  if (Array.isArray(left) || typeof left !== 'object' || left == null || !('type' in left)) {
    throw new Error('expected GraphDeserializationError');
  }
  return left as GraphDeserializationError;
};

const get_validation_issues = (
  result: E.Either<GraphDeserializationError | readonly GraphValidationIssue[], GraphDocument>,
): readonly GraphValidationIssue[] => {
  if (E.isRight(result)) {
    throw new Error('expected validation failure');
  }
  if (!Array.isArray(result.left)) {
    throw new Error('expected validation issues');
  }
  return result.left;
};

describe('graph serialization', () => {
  it('roundtrips a valid host/boundary document', () => {
    const document = make_document();
    const json = serialize_graph_document(document);
    const parsed = JSON.parse(json) as GraphDocument;

    const result = deserialize_graph_document(json);
    if (E.isRight(result)) {
      expect(result.right).toEqual(parsed);
      expect(result.right).toEqual(document);
      return;
    }
    throw new Error(`unexpected deserialization failure: ${result.left}`);
  });

  it('emits parseable plain JSON with pretty and compact output', () => {
    const document = make_document();
    const compact = serialize_graph_document(document);
    const pretty = serialize_graph_document(document, { pretty: true });

    expect(compact).toBe(JSON.stringify(document));
    expect(pretty).toBe(JSON.stringify(document, null, 2));
    expect(() => JSON.parse(compact)).not.toThrow();
    expect(Object.getPrototypeOf(JSON.parse(compact))).toBe(Object.prototype);
    expect(compact).not.toContain('undefined');
  });

  it('returns invalid_json for malformed JSON', () => {
    const result = deserialize_graph_document('{invalid');
    const error = get_deserialization_error(result);
    expect(error.type).toBe('invalid_json');
  });

  it('returns missing_field when a root field is absent', () => {
    const document = make_document();
    const parsed = JSON.parse(serialize_graph_document(document)) as Record<string, unknown>;
    delete parsed.nodes;

    const result = deserialize_graph_document(JSON.stringify(parsed));
    const error = get_deserialization_error(result);
    expect(error.type).toBe('missing_field');
    expect(error.field).toBe('nodes');
    expect(error.path).toBe('nodes');
  });

  it('rejects unsupported format versions with a clear path', () => {
    const document = make_document();
    const parsed = JSON.parse(serialize_graph_document(document)) as Record<string, unknown>;
    parsed.format_version = 2;

    const result = deserialize_graph_document(JSON.stringify(parsed));
    const error = get_deserialization_error(result);
    expect(error.type).toBe('unsupported_format_version');
    expect(error.format_version).toBe(2);
    expect(error.path).toBe('format_version');
  });

  it('rejects structurally invalid typed data', () => {
    const document = make_document();
    const parsed = JSON.parse(serialize_graph_document(document)) as Record<string, unknown>;
    parsed.nodes = [];

    const result = deserialize_graph_document(JSON.stringify(parsed));
    const error = get_deserialization_error(result);
    expect(error.type).toBe('invalid_structure');
    expect(error.path).toBe('nodes');
  });

  it('returns consistency issues after a valid parse', () => {
    const document = make_document();
    const parsed = JSON.parse(serialize_graph_document(document)) as GraphDocument;
    const host = parsed.nodes['host'];
    if (host == null) {
      throw new Error('expected host node');
    }
    const invalid_document: GraphDocument = {
      ...parsed,
      nodes: { ...parsed.nodes, host: { ...host, inputs: [] } },
    };

    const issues = get_validation_issues(deserialize_graph_document(JSON.stringify(invalid_document)));
    expect(issues.map(issue => issue.path)).toContain('nodes.host.inputs');
  });
});
