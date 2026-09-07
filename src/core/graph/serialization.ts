import type { Port, Widget, WidgetOption } from '../types';
import type {
  GraphBoundaryBinding,
  GraphBindingRecord,
  GraphDocument,
  GraphNodeRecord,
  GraphScope,
  GraphSlot,
} from './types';
import type { GraphValidationIssue, GraphValidationIssuePath } from './validation';
import { validate_graph_document } from './validation';
import * as E from 'fp-ts/Either';

export type GraphDocumentSerializeOptions = {
  readonly pretty?: boolean;
};

export type GraphDeserializationError = {
  readonly type:
    | 'invalid_json'
    | 'unsupported_format_version'
    | 'missing_field'
    | 'invalid_structure';
  readonly path?: GraphValidationIssuePath;
  readonly field?: string;
  readonly format_version?: unknown;
  readonly message: string;
};

type UnknownRecord = Record<string, unknown>;

const invalid_structure = (
  path: string,
  message: string,
): E.Either<GraphDeserializationError, never> => {
  return E.left({ type: 'invalid_structure', path, message });
};

const missing_field = (path: string, field: string): E.Either<GraphDeserializationError, never> => {
  return E.left({ type: 'missing_field', path, field, message: `missing field '${field}'` });
};

const is_unknown_record = (value: unknown): value is UnknownRecord => {
  return typeof value === 'object' && value != null && !Array.isArray(value);
};

const has_own = (record: UnknownRecord, field: string): boolean => {
  return Object.prototype.hasOwnProperty.call(record, field);
};

const decode_required_string = (
  record: UnknownRecord,
  field: string,
  path: string,
): E.Either<GraphDeserializationError, string> => {
  if (!has_own(record, field)) {
    return missing_field(path, field);
  }
  const value = record[field];
  if (typeof value !== 'string') {
    return invalid_structure(path, `field '${field}' must be a string`);
  }
  return E.right(value);
};

const decode_optional_string = (
  record: UnknownRecord,
  field: string,
  path: string,
): E.Either<GraphDeserializationError, string | undefined> => {
  if (!has_own(record, field)) {
    return E.right(undefined);
  }
  const value = record[field];
  if (typeof value !== 'string') {
    return invalid_structure(path, `field '${field}' must be a string when present`);
  }
  return E.right(value);
};

const decode_required_number = (
  record: UnknownRecord,
  field: string,
  path: string,
): E.Either<GraphDeserializationError, number> => {
  if (!has_own(record, field)) {
    return missing_field(path, field);
  }
  const value = record[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return invalid_structure(path, `field '${field}' must be a finite number`);
  }
  return E.right(value);
};

const decode_optional_number = (
  record: UnknownRecord,
  field: string,
  path: string,
): E.Either<GraphDeserializationError, number | undefined> => {
  if (!has_own(record, field)) {
    return E.right(undefined);
  }
  const value = record[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return invalid_structure(path, `field '${field}' must be a finite number when present`);
  }
  return E.right(value);
};

const decode_optional_boolean = (
  record: UnknownRecord,
  field: string,
  path: string,
): E.Either<GraphDeserializationError, boolean | undefined> => {
  if (!has_own(record, field)) {
    return E.right(undefined);
  }
  const value = record[field];
  if (typeof value !== 'boolean') {
    return invalid_structure(path, `field '${field}' must be a boolean when present`);
  }
  return E.right(value);
};

const decode_string_array = (
  value: unknown,
  path: string,
): E.Either<GraphDeserializationError, readonly string[]> => {
  if (!Array.isArray(value)) {
    return invalid_structure(path, 'expected an array of strings');
  }
  for (let index = 0; index < value.length; index++) {
    if (typeof value[index] !== 'string') {
      return invalid_structure(`${path}[${index}]`, 'expected a string');
    }
  }
  return E.right(value as readonly string[]);
};

const decode_vec2 = (
  value: unknown,
  path: string,
): E.Either<GraphDeserializationError, { readonly x: number; readonly y: number }> => {
  if (!is_unknown_record(value)) {
    return invalid_structure(path, 'expected an object with x and y');
  }
  const x_result = decode_required_number(value, 'x', `${path}.x`);
  if (E.isLeft(x_result)) {
    return x_result;
  }
  const y_result = decode_required_number(value, 'y', `${path}.y`);
  if (E.isLeft(y_result)) {
    return y_result;
  }
  return E.right({ x: x_result.right, y: y_result.right });
};

const decode_array = <T>(
  value: unknown,
  path: string,
  decode_item: (item: unknown, item_path: string) => E.Either<GraphDeserializationError, T>,
): E.Either<GraphDeserializationError, readonly T[]> => {
  if (!Array.isArray(value)) {
    return invalid_structure(path, 'expected an array');
  }
  const decoded: T[] = [];
  for (let index = 0; index < value.length; index++) {
    const item_result = decode_item(value[index], `${path}[${index}]`);
    if (E.isLeft(item_result)) {
      return item_result;
    }
    decoded.push(item_result.right);
  }
  return E.right(decoded);
};

const decode_record_map = <T>(
  value: unknown,
  path: string,
  decode_item: (item: unknown, item_path: string) => E.Either<GraphDeserializationError, T>,
): E.Either<GraphDeserializationError, Readonly<Record<string, T>>> => {
  if (!is_unknown_record(value)) {
    return invalid_structure(path, 'expected a string-keyed object');
  }
  const decoded: Record<string, T> = {};
  for (const [key, item] of Object.entries(value)) {
    const item_result = decode_item(item, `${path}.${key}`);
    if (E.isLeft(item_result)) {
      return item_result;
    }
    Object.defineProperty(decoded, key, {
      value: item_result.right,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return E.right(decoded);
};

const decode_port = (value: unknown, path: string): E.Either<GraphDeserializationError, Port> => {
  if (!is_unknown_record(value)) {
    return invalid_structure(path, 'expected a port object');
  }
  const id_result = decode_required_string(value, 'id', `${path}.id`);
  if (E.isLeft(id_result)) {
    return id_result;
  }
  const label_result = decode_required_string(value, 'label', `${path}.label`);
  if (E.isLeft(label_result)) {
    return label_result;
  }
  const type_result = decode_required_string(value, 'type', `${path}.type`);
  if (E.isLeft(type_result)) {
    return type_result;
  }
  if (type_result.right !== 'input' && type_result.right !== 'output') {
    return invalid_structure(`${path}.type`, "port type must be 'input' or 'output'");
  }
  const value_type_result = decode_optional_string(value, 'value_type', `${path}.value_type`);
  if (E.isLeft(value_type_result)) {
    return value_type_result;
  }
  const required_result = decode_optional_boolean(value, 'required', `${path}.required`);
  if (E.isLeft(required_result)) {
    return required_result;
  }
  const decoded: Record<string, unknown> = {
    id: id_result.right,
    label: label_result.right,
    type: type_result.right,
  };
  if (value_type_result.right !== undefined) {
    decoded.value_type = value_type_result.right;
  }
  if (required_result.right !== undefined) {
    decoded.required = required_result.right;
  }
  if (has_own(value, 'accepts')) {
    const accepts_result = decode_string_array(value.accepts, `${path}.accepts`);
    if (E.isLeft(accepts_result)) {
      return accepts_result;
    }
    decoded.accepts = accepts_result.right;
  }
  return E.right(decoded as Port);
};

const decode_slot = (
  value: unknown,
  path: string,
): E.Either<GraphDeserializationError, GraphSlot> => {
  if (!is_unknown_record(value)) {
    return invalid_structure(path, 'expected a slot object');
  }
  const id_result = decode_required_string(value, 'id', `${path}.id`);
  if (E.isLeft(id_result)) {
    return id_result;
  }
  const label_result = decode_required_string(value, 'label', `${path}.label`);
  if (E.isLeft(label_result)) {
    return label_result;
  }
  const value_type_result = decode_optional_string(value, 'value_type', `${path}.value_type`);
  if (E.isLeft(value_type_result)) {
    return value_type_result;
  }
  const required_result = decode_optional_boolean(value, 'required', `${path}.required`);
  if (E.isLeft(required_result)) {
    return required_result;
  }
  const decoded: Record<string, unknown> = {
    id: id_result.right,
    label: label_result.right,
  };
  if (value_type_result.right !== undefined) {
    decoded.value_type = value_type_result.right;
  }
  if (required_result.right !== undefined) {
    decoded.required = required_result.right;
  }
  if (has_own(value, 'accepts')) {
    const accepts_result = decode_string_array(value.accepts, `${path}.accepts`);
    if (E.isLeft(accepts_result)) {
      return accepts_result;
    }
    decoded.accepts = accepts_result.right;
  }
  return E.right(decoded as GraphSlot);
};

const decode_widget_options = (
  value: unknown,
  path: string,
): E.Either<GraphDeserializationError, readonly string[] | readonly WidgetOption[]> => {
  if (!Array.isArray(value)) {
    return invalid_structure(path, 'expected an array of widget options');
  }
  if (value.every(item => typeof item === 'string')) {
    return E.right(value as readonly string[]);
  }
  for (let index = 0; index < value.length; index++) {
    const item = value[index];
    if (!is_unknown_record(item)) {
      return invalid_structure(`${path}[${index}]`, 'expected a widget option object');
    }
    const label_result = decode_required_string(item, 'label', `${path}[${index}].label`);
    if (E.isLeft(label_result)) {
      return label_result;
    }
    const value_result = decode_required_string(item, 'value', `${path}[${index}].value`);
    if (E.isLeft(value_result)) {
      return value_result;
    }
  }
  return E.right(value as readonly WidgetOption[]);
};

const decode_widget = (
  value: unknown,
  path: string,
): E.Either<GraphDeserializationError, Widget> => {
  if (!is_unknown_record(value)) {
    return invalid_structure(path, 'expected a widget object');
  }
  const id_result = decode_required_string(value, 'id', `${path}.id`);
  if (E.isLeft(id_result)) {
    return id_result;
  }
  const type_result = decode_required_string(value, 'type', `${path}.type`);
  if (E.isLeft(type_result)) {
    return type_result;
  }
  const label_result = decode_required_string(value, 'label', `${path}.label`);
  if (E.isLeft(label_result)) {
    return label_result;
  }
  const allowed_types = new Set([
    'text',
    'textarea',
    'number',
    'boolean',
    'color',
    'select',
    'range',
    'switch',
  ]);
  if (!allowed_types.has(type_result.right)) {
    return invalid_structure(`${path}.type`, `unsupported widget type '${type_result.right}'`);
  }
  const value_type = value.value;
  if (
    typeof value_type !== 'string' &&
    typeof value_type !== 'number' &&
    typeof value_type !== 'boolean'
  ) {
    return invalid_structure(`${path}.value`, 'widget value must be string, number, or boolean');
  }
  const min_result = decode_optional_number(value, 'min', `${path}.min`);
  if (E.isLeft(min_result)) {
    return min_result;
  }
  const max_result = decode_optional_number(value, 'max', `${path}.max`);
  if (E.isLeft(max_result)) {
    return max_result;
  }
  const step_result = decode_optional_number(value, 'step', `${path}.step`);
  if (E.isLeft(step_result)) {
    return step_result;
  }
  const value_type_result = decode_optional_string(value, 'value_type', `${path}.value_type`);
  if (E.isLeft(value_type_result)) {
    return value_type_result;
  }
  const required_result = decode_optional_boolean(value, 'required', `${path}.required`);
  if (E.isLeft(required_result)) {
    return required_result;
  }
  const decoded: Record<string, unknown> = {
    id: id_result.right,
    type: type_result.right,
    label: label_result.right,
    value: value_type,
  };
  if (min_result.right !== undefined) {
    decoded.min = min_result.right;
  }
  if (max_result.right !== undefined) {
    decoded.max = max_result.right;
  }
  if (step_result.right !== undefined) {
    decoded.step = step_result.right;
  }
  if (value_type_result.right !== undefined) {
    decoded.value_type = value_type_result.right;
  }
  if (required_result.right !== undefined) {
    decoded.required = required_result.right;
  }
  if (has_own(value, 'options')) {
    const options_result = decode_widget_options(value.options, `${path}.options`);
    if (E.isLeft(options_result)) {
      return options_result;
    }
    decoded.options = options_result.right;
  }
  if (has_own(value, 'accepts')) {
    const accepts_result = decode_string_array(value.accepts, `${path}.accepts`);
    if (E.isLeft(accepts_result)) {
      return accepts_result;
    }
    decoded.accepts = accepts_result.right;
  }
  return E.right(decoded as Widget);
};

const decode_scope = (
  value: unknown,
  path: string,
): E.Either<GraphDeserializationError, GraphScope> => {
  if (!is_unknown_record(value)) {
    return invalid_structure(path, 'expected a graph scope object');
  }
  const id_result = decode_required_string(value, 'id', `${path}.id`);
  if (E.isLeft(id_result)) {
    return id_result;
  }
  const kind_result = decode_required_string(value, 'kind', `${path}.kind`);
  if (E.isLeft(kind_result)) {
    return kind_result;
  }
  if (kind_result.right !== 'root' && kind_result.right !== 'subgraph') {
    return invalid_structure(`${path}.kind`, "graph kind must be 'root' or 'subgraph'");
  }
  const parent_graph_id_result = decode_optional_string(
    value,
    'parent_graph_id',
    `${path}.parent_graph_id`,
  );
  if (E.isLeft(parent_graph_id_result)) {
    return parent_graph_id_result;
  }
  const title_result = decode_required_string(value, 'title', `${path}.title`);
  if (E.isLeft(title_result)) {
    return title_result;
  }
  const input_slots_result = decode_array(
    value.input_slots ?? null,
    `${path}.input_slots`,
    decode_slot,
  );
  if (E.isLeft(input_slots_result)) {
    return input_slots_result;
  }
  const output_slots_result = decode_array(
    value.output_slots ?? null,
    `${path}.output_slots`,
    decode_slot,
  );
  if (E.isLeft(output_slots_result)) {
    return output_slots_result;
  }
  const decoded: Record<string, unknown> = {
    id: id_result.right,
    kind: kind_result.right,
    title: title_result.right,
    input_slots: input_slots_result.right,
    output_slots: output_slots_result.right,
  };
  if (parent_graph_id_result.right !== undefined) {
    decoded.parent_graph_id = parent_graph_id_result.right;
  }
  return E.right(decoded as GraphScope);
};

const decode_node = (
  value: unknown,
  path: string,
): E.Either<GraphDeserializationError, GraphNodeRecord> => {
  if (!is_unknown_record(value)) {
    return invalid_structure(path, 'expected a graph node object');
  }
  const id_result = decode_required_string(value, 'id', `${path}.id`);
  if (E.isLeft(id_result)) {
    return id_result;
  }
  const graph_id_result = decode_required_string(value, 'graph_id', `${path}.graph_id`);
  if (E.isLeft(graph_id_result)) {
    return graph_id_result;
  }
  const type_result = decode_required_string(value, 'type', `${path}.type`);
  if (E.isLeft(type_result)) {
    return type_result;
  }
  const title_result = decode_required_string(value, 'title', `${path}.title`);
  if (E.isLeft(title_result)) {
    return title_result;
  }
  const position_result = decode_vec2(value.position ?? null, `${path}.position`);
  if (E.isLeft(position_result)) {
    return position_result;
  }
  const size_result = decode_vec2(value.size ?? null, `${path}.size`);
  if (E.isLeft(size_result)) {
    return size_result;
  }
  const inputs_result = decode_array(value.inputs ?? null, `${path}.inputs`, decode_port);
  if (E.isLeft(inputs_result)) {
    return inputs_result;
  }
  const outputs_result = decode_array(value.outputs ?? null, `${path}.outputs`, decode_port);
  if (E.isLeft(outputs_result)) {
    return outputs_result;
  }
  if (!is_unknown_record(value.custom_data)) {
    return invalid_structure(`${path}.custom_data`, 'custom_data must be an object');
  }
  const nested_graph_id_result = decode_optional_string(
    value,
    'nested_graph_id',
    `${path}.nested_graph_id`,
  );
  if (E.isLeft(nested_graph_id_result)) {
    return nested_graph_id_result;
  }
  const style_mode_result = decode_optional_string(value, 'style_mode', `${path}.style_mode`);
  if (E.isLeft(style_mode_result)) {
    return style_mode_result;
  }
  if (
    style_mode_result.right !== undefined &&
    style_mode_result.right !== 'default' &&
    style_mode_result.right !== 'borderless'
  ) {
    return invalid_structure(`${path}.style_mode`, "style_mode must be 'default' or 'borderless'");
  }
  const resizable_result = decode_optional_boolean(value, 'resizable', `${path}.resizable`);
  if (E.isLeft(resizable_result)) {
    return resizable_result;
  }
  const collapsed_result = decode_optional_boolean(value, 'collapsed', `${path}.collapsed`);
  if (E.isLeft(collapsed_result)) {
    return collapsed_result;
  }
  const muted_result = decode_optional_boolean(value, 'muted', `${path}.muted`);
  if (E.isLeft(muted_result)) {
    return muted_result;
  }
  const pinned_result = decode_optional_boolean(value, 'pinned', `${path}.pinned`);
  if (E.isLeft(pinned_result)) {
    return pinned_result;
  }
  const locked_result = decode_optional_boolean(value, 'locked', `${path}.locked`);
  if (E.isLeft(locked_result)) {
    return locked_result;
  }

  const decoded: Record<string, unknown> = {
    id: id_result.right,
    graph_id: graph_id_result.right,
    type: type_result.right,
    title: title_result.right,
    position: position_result.right,
    size: size_result.right,
    inputs: inputs_result.right,
    outputs: outputs_result.right,
    custom_data: value.custom_data,
  };
  if (nested_graph_id_result.right !== undefined) {
    decoded.nested_graph_id = nested_graph_id_result.right;
  }
  if (style_mode_result.right !== undefined) {
    decoded.style_mode = style_mode_result.right;
  }
  if (resizable_result.right !== undefined) {
    decoded.resizable = resizable_result.right;
  }
  if (collapsed_result.right !== undefined) {
    decoded.collapsed = collapsed_result.right;
  }
  if (muted_result.right !== undefined) {
    decoded.muted = muted_result.right;
  }
  if (pinned_result.right !== undefined) {
    decoded.pinned = pinned_result.right;
  }
  if (locked_result.right !== undefined) {
    decoded.locked = locked_result.right;
  }
  if (has_own(value, 'widgets')) {
    const widgets_result = decode_array(value.widgets, `${path}.widgets`, decode_widget);
    if (E.isLeft(widgets_result)) {
      return widgets_result;
    }
    decoded.widgets = widgets_result.right;
  }
  return E.right(decoded as GraphNodeRecord);
};

const decode_binding = (
  value: unknown,
  path: string,
): E.Either<GraphDeserializationError, GraphBindingRecord> => {
  if (!is_unknown_record(value)) {
    return invalid_structure(path, 'expected a binding object');
  }
  const fields: readonly [string, string][] = [
    ['id', 'id'],
    ['graph_id', 'graph_id'],
    ['source_id', 'source_id'],
    ['source_handle', 'source_handle'],
    ['target_id', 'target_id'],
    ['target_handle', 'target_handle'],
  ];
  const decoded: Record<string, unknown> = {};
  for (const [field, suffix] of fields) {
    const field_result = decode_required_string(value, field, `${path}.${suffix}`);
    if (E.isLeft(field_result)) {
      return field_result;
    }
    decoded[field] = field_result.right;
  }
  return E.right(decoded as GraphBindingRecord);
};

const decode_boundary = (
  value: unknown,
  path: string,
): E.Either<GraphDeserializationError, GraphBoundaryBinding> => {
  if (!is_unknown_record(value)) {
    return invalid_structure(path, 'expected a boundary binding object');
  }
  const id_result = decode_required_string(value, 'id', `${path}.id`);
  if (E.isLeft(id_result)) {
    return id_result;
  }
  const graph_id_result = decode_required_string(value, 'graph_id', `${path}.graph_id`);
  if (E.isLeft(graph_id_result)) {
    return graph_id_result;
  }
  const direction_result = decode_required_string(value, 'direction', `${path}.direction`);
  if (E.isLeft(direction_result)) {
    return direction_result;
  }
  if (direction_result.right !== 'input' && direction_result.right !== 'output') {
    return invalid_structure(`${path}.direction`, "boundary direction must be 'input' or 'output'");
  }
  const slot_id_result = decode_required_string(value, 'slot_id', `${path}.slot_id`);
  if (E.isLeft(slot_id_result)) {
    return slot_id_result;
  }
  const node_id_result = decode_required_string(value, 'node_id', `${path}.node_id`);
  if (E.isLeft(node_id_result)) {
    return node_id_result;
  }
  const port_id_result = decode_required_string(value, 'port_id', `${path}.port_id`);
  if (E.isLeft(port_id_result)) {
    return port_id_result;
  }
  return E.right({
    id: id_result.right,
    graph_id: graph_id_result.right,
    direction: direction_result.right,
    slot_id: slot_id_result.right,
    node_id: node_id_result.right,
    port_id: port_id_result.right,
  });
};

const decode_document = (value: unknown): E.Either<GraphDeserializationError, GraphDocument> => {
  if (!is_unknown_record(value)) {
    return invalid_structure('', 'expected a GraphDocument object');
  }

  const required_fields: readonly string[] = [
    'format_version',
    'root_graph_id',
    'graphs',
    'nodes',
    'bindings',
    'boundary_bindings',
  ];
  for (const field of required_fields) {
    if (!has_own(value, field)) {
      return missing_field(field, field);
    }
  }

  const format_version = value.format_version;
  if (typeof format_version !== 'number' || !Number.isFinite(format_version)) {
    return invalid_structure('format_version', 'format_version must be a number');
  }
  if (format_version !== 1) {
    return E.left({
      type: 'unsupported_format_version',
      path: 'format_version',
      format_version,
      message: `unsupported format_version ${String(format_version)}; expected 1`,
    });
  }

  const root_graph_id_result = decode_required_string(value, 'root_graph_id', 'root_graph_id');
  if (E.isLeft(root_graph_id_result)) {
    return root_graph_id_result;
  }
  const graphs_result = decode_record_map(value.graphs, 'graphs', decode_scope);
  if (E.isLeft(graphs_result)) {
    return graphs_result;
  }
  const nodes_result = decode_record_map(value.nodes, 'nodes', decode_node);
  if (E.isLeft(nodes_result)) {
    return nodes_result;
  }
  const bindings_result = decode_record_map(value.bindings, 'bindings', decode_binding);
  if (E.isLeft(bindings_result)) {
    return bindings_result;
  }
  const boundary_bindings_result = decode_record_map(
    value.boundary_bindings,
    'boundary_bindings',
    decode_boundary,
  );
  if (E.isLeft(boundary_bindings_result)) {
    return boundary_bindings_result;
  }

  return E.right({
    format_version: 1,
    root_graph_id: root_graph_id_result.right,
    graphs: graphs_result.right,
    nodes: nodes_result.right,
    bindings: bindings_result.right,
    boundary_bindings: boundary_bindings_result.right,
  });
};

export const serialize_graph_document = (
  document: GraphDocument,
  options?: GraphDocumentSerializeOptions,
): string => {
  return JSON.stringify(document, undefined, options?.pretty === true ? 2 : undefined);
};

export const deserialize_graph_document = (
  json: string,
): E.Either<GraphDeserializationError | readonly GraphValidationIssue[], GraphDocument> => {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return E.left({
      type: 'invalid_json',
      message: 'invalid JSON string',
    });
  }

  const decoded_result = decode_document(data);
  if (E.isLeft(decoded_result)) {
    return decoded_result;
  }

  const validation_result = validate_graph_document(decoded_result.right);
  if (E.isLeft(validation_result)) {
    return validation_result;
  }

  return E.right(decoded_result.right);
};
