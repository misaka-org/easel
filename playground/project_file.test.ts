import { describe, expect, it } from 'vitest';
import * as E from 'fp-ts/Either';
import { create_document_subgraph_document } from './scenes/scene_document_subgraph';
import {
  easel_json_extension,
  has_easel_json_extension,
  make_project_file_name,
  parse_project_document_json,
  project_file_error_message,
  project_name_from_file_name,
  serialize_project_document,
} from './project_file';

describe('project file helpers', () => {
  it('serializes a GraphDocument as pretty JSON and roundtrips it', () => {
    const document = create_document_subgraph_document();
    const json = serialize_project_document(document);

    expect(json).toContain('\n  "format_version"');
    const parsed = parse_project_document_json(json);
    expect(E.isRight(parsed)).toBe(true);
    if (E.isRight(parsed)) {
      expect(parsed.right).toEqual(document);
    }
  });

  it('keeps .easel.json file-name rules simple and stable', () => {
    expect(easel_json_extension).toBe('.easel.json');
    expect(has_easel_json_extension('untitled.easel.json')).toBe(true);
    expect(has_easel_json_extension('untitled.EASEL.JSON')).toBe(true);
    expect(has_easel_json_extension('untitled.json')).toBe(false);

    expect(make_project_file_name('Demo Graph')).toBe('Demo Graph.easel.json');
    expect(make_project_file_name('Demo Graph.easel.json')).toBe('Demo Graph.easel.json');
    expect(make_project_file_name('')).toBe('untitled.easel.json');
    expect(make_project_file_name('bad:name.easel.json')).toBe('bad_name.easel.json');

    expect(project_name_from_file_name('Demo Graph.easel.json')).toBe('Demo Graph');
    expect(project_name_from_file_name('C:/files/demo.easel.json')).toBe('demo');
    expect(project_name_from_file_name('legacy.json')).toBe('legacy');
  });

  it('returns a readable error for invalid JSON', () => {
    const parsed = parse_project_document_json('{ nope');
    expect(E.isLeft(parsed)).toBe(true);
    if (E.isLeft(parsed)) {
      expect(project_file_error_message(parsed.left)).toContain('invalid JSON string');
    }
  });

  it('rejects documents that fail structural validation', () => {
    const parsed = parse_project_document_json('{"format_version":1}');
    expect(E.isLeft(parsed)).toBe(true);
    if (E.isLeft(parsed)) {
      expect(project_file_error_message(parsed.left)).toContain("missing field 'root_graph_id'");
    }
  });
});
