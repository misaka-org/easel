import type { GraphDocument } from '@/core/graph/types';
import type { GraphDeserializationError } from '@/core/graph/serialization';
import { deserialize_graph_document, serialize_graph_document } from '@/core/graph/serialization';
import type { GraphValidationIssue } from '@/core/graph/validation';
import * as E from 'fp-ts/Either';

export const easel_json_extension = '.easel.json';
export const default_project_file_name = `untitled${easel_json_extension}`;

export type ProjectFileParseError = GraphDeserializationError | readonly GraphValidationIssue[];

export const has_easel_json_extension = (file_name: string): boolean => {
  return file_name.toLowerCase().endsWith(easel_json_extension);
};

const sanitize_project_name = (project_name: string): string => {
  const without_forbidden_chars = project_name.trim().replace(/[<>:"/\\|?*]+/g, '_');
  return without_forbidden_chars
    .split('')
    .filter(character => character.charCodeAt(0) >= 32)
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '');
};

export const make_project_file_name = (project_name: string): string => {
  const cleaned_name = sanitize_project_name(project_name) || 'untitled';
  if (has_easel_json_extension(cleaned_name)) {
    return cleaned_name;
  }
  return `${cleaned_name}${easel_json_extension}`;
};

export const project_name_from_file_name = (file_name: string): string => {
  const base_name = file_name.split(/[\\/]/).pop() ?? file_name;
  if (has_easel_json_extension(base_name)) {
    return base_name.slice(0, -easel_json_extension.length);
  }
  return base_name.replace(/\.[^./]*$/g, '');
};

export const parse_project_document_json = (
  json: string,
): E.Either<ProjectFileParseError, GraphDocument> => {
  return deserialize_graph_document(json);
};

export const serialize_project_document = (document: GraphDocument): string => {
  return serialize_graph_document(document, { pretty: true });
};

export const project_file_error_message = (error: ProjectFileParseError): string => {
  if ('type' in error) {
    return `${error.message}${error.path ? ` (${error.path})` : ''}`;
  }
  const first_issues = error.slice(0, 3);
  const details = first_issues
    .map(issue => `${issue.path || 'document'}: ${issue.message}`)
    .join('; ');
  return `GraphDocument invalid: ${details}${error.length > 3 ? ` (+${error.length - 3} more)` : ''}`;
};
