import { effect } from '@vue/reactivity';
import * as E from 'fp-ts/Either';
import { Easel, ExecuteContext, type NodeSpec } from '@/index';
import { add_node } from '@/core/node_ops';
import { create_initial_state } from '@/core/state';
import { serialize_state, deserialize_state } from '@/core/serialization';
import { vec2_create } from '@/core/math';
import type { GraphNode } from '@/core/types';
import type { GraphDocument } from '@/core/graph/types';
import { light_theme, default_theme } from '@/runtime/theme';
import { minimap_plugin } from '@/plugins/minimap';
import { controls_plugin } from '@/plugins/controls';
import { logger_plugin } from '@/plugins/logger';
import { context_menu_plugin } from '@/plugins/context_menu';
import { history_plugin } from '@/plugins/history';
import { auto_pan_plugin } from '@/plugins/auto_pan';
import { executor_plugin } from '@/plugins/executor_plugin';
import { node_picker_plugin } from '@/plugins/node_picker';
import { DefaultNode } from '@/index';
import type { ContextMenuContext, ContextMenuItem } from '@/plugins/context_menu/types';

import { MathNode } from './nodes/math';
import { load_math_scene, evaluate_math_graph } from './scenes/scene_math';
import { load_perf_scene } from './scenes/scene_perf';
import { load_executor_scene } from './scenes/scene_executor';
import { ImagePreviewNode } from './nodes/image_preview';
import { IpApiNode } from './nodes/ip_api';
import { TextInputNode } from './nodes/text_input';
import { TextViewNode } from './nodes/text_view';
import { ColorSourceNode } from './nodes/color_source';
import { CSSBuilderNode } from './nodes/css_builder';
import { CSSPreviewNode } from './nodes/css_preview';
import { CounterNode } from './nodes/counter_node';

import { load_realtime_scene } from './scenes/scene_realtime';
import { load_ip_api_scene } from './scenes/scene_ip_api';
import { load_context_menu_scene } from './scenes/scene_context_menu';
import {
  load_document_subgraph_scene,
  type DocumentSubgraphSceneHandle,
} from './scenes/scene_document_subgraph';
import {
  default_project_file_name,
  make_project_file_name,
  parse_project_document_json,
  project_name_from_file_name,
  type ProjectFileParseError,
} from './project_file';
import {
  apply_dom_translations,
  detect_browser_locale,
  on_locale_change,
  read_locale_preference,
  resolve_locale,
  set_locale,
  translate,
  write_locale_preference,
  type LocalePreference,
} from './i18n';
import {
  get_node_flag_context_menu_items,
  toggle_node_flag_for_context,
  type NodeFlag,
} from './node_flag_context_menu';

class ExecutableDefaultNode extends DefaultNode {
  static node_spec: NodeSpec = {};
  async execute({ node: _node, inputs, report_progress }: ExecuteContext) {
    report_progress(50);
    await new Promise(r => setTimeout(r, 500));
    report_progress(100);
    return { out: (inputs['val'] as number) || 0 };
  }
}

class TextGenNode extends DefaultNode {
  static node_spec: NodeSpec = {
    inputs: [{ id: 'prompt', label: 'Prompt', type: 'input', value_type: 'text', required: true }],
    outputs: [{ id: 'out_list', label: 'List [ ]', type: 'output', value_type: 'text' }],
    widgets: [
      {
        id: 'min_len',
        type: 'number',
        label: 'Minimum list length',
        value: 6,
        value_type: 'number',
      },
      {
        id: 'max_len',
        type: 'number',
        label: 'Maximum list length',
        value: 8,
        value_type: 'number',
      },
    ],
  };
  async execute({ node: _node, inputs, report_progress, signal }: ExecuteContext) {
    report_progress(30);
    await new Promise(r => setTimeout(r, 400));
    if (signal?.aborted) throw new Error('Aborted');
    report_progress(70);
    await new Promise(r => setTimeout(r, 400));
    if (signal?.aborted) throw new Error('Aborted');
    report_progress(100);
    return { out_list: `Gen: ${inputs['prompt'] || 'empty'}` };
  }
}

class ImageGenNode extends DefaultNode {
  static node_spec: NodeSpec = {
    inputs: [
      { id: 'prompt', label: '[ ] Prompt', type: 'input', value_type: 'image' },
      { id: 'ref', label: 'Reference Image', type: 'input', value_type: 'image' },
    ],
    outputs: [{ id: 'out_img', label: 'Image [ ]', type: 'output', value_type: 'image' }],
    widgets: [{ id: 'model', type: 'text', label: 'Model', value: 'Flux Dev', value_type: 'text' }],
  };
  async execute({ node: _node, inputs, report_progress, signal }: ExecuteContext) {
    report_progress(10);
    await new Promise(r => setTimeout(r, 300));
    if (signal?.aborted) throw new Error('Aborted');
    report_progress(50);
    await new Promise(r => setTimeout(r, 600));
    if (signal?.aborted) throw new Error('Aborted');
    report_progress(100);
    return { out_img: `Image for: ${inputs['prompt']}` };
  }
}

const init = () => {
  const canvas_el = document.getElementById('canvas');
  if (!canvas_el) return;

  set_locale(detect_browser_locale());
  apply_dom_translations();

  const easel = new Easel(canvas_el, {
    plugins: [
      context_menu_plugin,
      minimap_plugin,
      controls_plugin,
      history_plugin,
      auto_pan_plugin,
      node_picker_plugin,
      executor_plugin,
      logger_plugin,
    ],
    custom_css: `
      .image-toolbar {
        position: absolute;
        bottom: -50px;
        left: 0;
        width: 100%;
        display: none;
        gap: 8px;
        background: var(--node-bg);
        padding: 8px;
        border-radius: 8px;
        box-sizing: border-box;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.5);
        border: 1px solid var(--node-border);
      }
      .node.selected .image-toolbar {
        display: flex;
      }
      .image-toolbar button {
        background: var(--primary-color);
        color: var(--canvas-bg);
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        flex: 1;
        transition: background 0.2s, color 0.2s;
      }
      .image-toolbar button:hover {
        background: var(--primary-hover, #0098ff);
      }
    `,
  });

  const { state, dispatch, set_theme } = easel;
  let document_subgraph_handle: DocumentSubgraphSceneHandle | undefined;
  let saved_document_json: string | null = null;
  let saved_document_file_name: string | null = null;

  const project_name_el = document.getElementById('project-name') as HTMLInputElement | null;
  const file_state_el = document.getElementById('file-state');
  const project_scope_path_el = document.getElementById('project-scope-path');
  const scope_summary_el = document.getElementById('scope-summary');
  const scope_nav_el = document.getElementById('scope-nav');
  const stat_nodes_el = document.getElementById('stat-nodes');
  const stat_wires_el = document.getElementById('stat-wires');
  const stat_zoom_el = document.getElementById('stat-zoom');
  const stat_selected_el = document.getElementById('stat-selected');
  const import_error_el = document.getElementById('import-error');
  const workspace_el = document.getElementById('workspace');
  const node_search_el = document.getElementById('node-search') as HTMLInputElement | null;
  const scene_selector_el = document.getElementById('scene-selector') as HTMLSelectElement | null;
  const locale_selector_el = document.getElementById('locale-selector') as HTMLSelectElement | null;

  // Register node types via easel.register (OOP API).
  easel.register.add_node('default', ExecutableDefaultNode);
  easel.register.add_node('text_generation', TextGenNode);
  easel.register.add_node('image_generation', ImageGenNode);
  easel.register.add_node('image_preview', ImagePreviewNode);
  easel.register.add_node('math', MathNode);
  easel.register.add_node('ip_api', IpApiNode);
  easel.register.add_node('text_input', TextInputNode);
  easel.register.add_node('text_view', TextViewNode);
  easel.register.add_node('color_source', ColorSourceNode);
  easel.register.add_node('css_builder', CSSBuilderNode);
  easel.register.add_node('css_preview', CSSPreviewNode);
  easel.register.add_node('counter', CounterNode);

  // Re-register namespaces on locale changes; registry stores the latest path per type.
  const register_node_namespaces = (): void => {
    const generate = translate('ns_generate');
    easel.register.add_node_ns('image_generation', [generate, translate('ns_image')]);
    easel.register.add_node_ns('text_generation', [generate, translate('ns_text')]);
    easel.register.add_node_ns('audio_generation', [generate, translate('ns_audio')]);
    easel.register.add_node_ns('video_concatenation', [generate, translate('ns_video')]);
    easel.register.add_node_ns('ip_api', [translate('ns_network')]);
    easel.register.add_node_ns('math', [translate('ns_math')]);
    easel.register.add_node_ns('counter', [translate('ns_math')]);
    easel.register.add_node_ns('image_preview', [translate('ns_preview')]);
    easel.register.add_node_ns('text_view', [translate('ns_preview')]);
    easel.register.add_node_ns('css_preview', [translate('ns_preview')]);
    easel.register.add_node_ns('css_builder', [translate('ns_preview')]);
    easel.register.add_node_ns('text_input', [translate('ns_input')]);
    easel.register.add_node_ns('color_source', [translate('ns_input')]);
  };
  register_node_namespaces();
  on_locale_change(register_node_namespaces);

  const get_active_document_json = (): string | null => {
    const controller = document_subgraph_handle?.controller;
    return controller == null ? null : controller.serialize({ pretty: true });
  };

  const current_project_file_name = (): string => {
    const base_name = project_name_el?.value.trim() || default_project_file_name;
    return make_project_file_name(base_name);
  };

  const set_import_error = (message: string | null): void => {
    if (import_error_el == null) {
      return;
    }
    if (message == null) {
      import_error_el.hidden = true;
      import_error_el.textContent = '';
      return;
    }
    import_error_el.textContent = translate('file_error_prefix', { message });
    import_error_el.hidden = false;
  };

  const format_project_file_error = (error: ProjectFileParseError): string => {
    if ('type' in error) {
      if (error.type === 'invalid_json') {
        return translate('file_error_invalid_json');
      }
      if (error.type === 'unsupported_format_version') {
        return translate('file_error_unsupported_version', {
          version: String(error.format_version ?? '?'),
        });
      }
      if (error.type === 'missing_field') {
        return translate('file_error_missing_field', {
          field: error.field ?? error.path ?? 'document',
        });
      }
      return translate('file_error_invalid_structure', {
        path: error.path ?? 'document',
        message: error.message,
      });
    }
    const details = error
      .slice(0, 2)
      .map(issue => `${issue.path || 'document'}: ${issue.message}`)
      .join('; ');
    const suffix = details.length > 0 ? ` (${details})` : '';
    return `${translate('file_error_document_invalid')}${suffix}`;
  };

  const update_project_file_state = (): void => {
    const active_json = get_active_document_json();
    const file_name = current_project_file_name();
    const is_saved =
      active_json != null &&
      saved_document_json === active_json &&
      saved_document_file_name === file_name;
    if (file_state_el) {
      file_state_el.classList.remove('state-saved', 'state-dirty');
      if (active_json == null) {
        file_state_el.textContent = translate('file_state_legacy_scene');
      } else if (is_saved) {
        file_state_el.classList.add('state-saved');
        file_state_el.textContent = translate('file_state_saved');
      } else {
        file_state_el.classList.add('state-dirty');
        file_state_el.textContent = translate('file_state_unsaved');
      }
    }
  };

  const download_text_file = (file_name: string, content: string): void => {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file_name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const export_project_file = (): void => {
    const controller = document_subgraph_handle?.controller;
    if (controller == null) {
      set_import_error(translate('file_error_no_active_document'));
      return;
    }
    const json = controller.serialize({ pretty: true });
    const file_name = current_project_file_name();
    download_text_file(file_name, json);
    saved_document_json = json;
    saved_document_file_name = file_name;
    set_import_error(null);
    update_project_file_state();
  };

  const scene_label = (value: string): string => {
    switch (value) {
      case 'document_subgraph':
        return translate('scene_document_subgraph');
      case 'default':
        return translate('scene_basic_canvas');
      case 'math':
        return translate('scene_math_test');
      case 'perf':
        return translate('scene_performance_test');
      case 'executor':
        return translate('scene_executor_demo');
      case 'realtime':
        return translate('scene_realtime_css');
      case 'ip_api':
        return translate('scene_ip_api');
      case 'context_menu':
        return translate('scene_context_menu');
      default:
        return value;
    }
  };

  // Scope-aware subgraph exit/enter visibility
  const update_scope_ui = (): void => {
    const btn_enter = document.getElementById('btn-enter-subgraph');
    const btn_exit = document.getElementById('btn-exit-subgraph');
    const document_controller = document_subgraph_handle?.controller;
    const legacy_depth = easel.plugin_data.subgraph?.stack_depth() ?? 0;
    const selected_host_id = state.value.selected_node_ids.find(id => {
      return document_controller?.view.nodes[id]?.nested_graph_id != null;
    });
    const is_document_scope = document_controller != null;
    const is_inside = is_document_scope ? document_controller.path.length > 1 : legacy_depth > 0;
    const enter_visible = is_document_scope && !is_inside && selected_host_id != null;
    const exit_visible = is_inside;

    if (btn_enter) {
      btn_enter.hidden = !enter_visible;
    }
    if (btn_exit) {
      btn_exit.hidden = !exit_visible;
    }
    if (scope_nav_el) {
      scope_nav_el.classList.toggle('active', enter_visible || exit_visible);
    }

    const path_text = is_document_scope
      ? document_controller.path.join(' / ')
      : legacy_depth > 0
        ? translate('scope_path_legacy_depth', { depth: legacy_depth })
        : translate('scope_path_legacy_scene', {
            scene: scene_label(scene_selector_el?.value ?? 'default'),
          });
    if (scope_summary_el) {
      scope_summary_el.textContent = path_text;
    }
    if (project_scope_path_el) {
      project_scope_path_el.textContent = is_document_scope
        ? translate('scope_path_project_file', {
            file_name: current_project_file_name(),
            path: path_text,
          })
        : path_text;
    }
  };
  effect(() => {
    void state.value;
    void document_subgraph_handle?.controller.view;
    update_scope_ui();
    update_project_file_state();
  });

  document.getElementById('btn-enter-subgraph')?.addEventListener('click', () => {
    const document_controller = document_subgraph_handle?.controller;
    if (document_controller == null) {
      return;
    }
    const selected_host_id = state.value.selected_node_ids.find(
      id => document_controller.view.nodes[id]?.nested_graph_id != null,
    );
    if (selected_host_id != null) {
      document_controller.enter_subgraph(selected_host_id);
    }
  });
  document.getElementById('btn-exit-subgraph')?.addEventListener('click', () => {
    const document_controller = document_subgraph_handle?.controller;
    if (document_controller != null) {
      document_controller.exit_subgraph();
      return;
    }
    easel.plugin_data.subgraph?.exit();
  });

  // Scene Management
  type LoadSceneOptions = {
    readonly document?: GraphDocument;
    readonly file_name?: string;
  };

  const load_scene = (name: string, options: LoadSceneOptions = {}) => {
    document_subgraph_handle?.stop();
    document_subgraph_handle = undefined;
    saved_document_json = null;
    saved_document_file_name = null;
    set_import_error(null);
    easel.plugin_data.subgraph?.clear();
    easel.dispatch(() => ({
      ...create_initial_state(),
      nodes: {},
      bindings: {},
    }));

    if (name === 'default') {
      dispatch(s =>
        add_node(s, {
          id: 'node_1',
          type: 'default',
          position: vec2_create(100, 100),
          size: vec2_create(200, 160),
          title: 'Generate Noise',
          inputs: [],
          outputs: [
            {
              id: 'out_1',
              label: 'Image',
              type: 'output',
              value_type: 'image',
            },
          ],
          widgets: [{ id: 'seed', type: 'number', label: 'Seed', value: 42, value_type: 'number' }],
          custom_data: {},
        }),
      );
      dispatch(s =>
        add_node(s, {
          id: 'node_2',
          type: 'image_preview',
          position: vec2_create(400, 100),
          size: vec2_create(480, 640),
          title: 'Preview',
          inputs: [{ id: 'in_1', label: 'Image', type: 'input' }],
          outputs: [],
          style_mode: 'borderless',
          custom_data: { url: 'https://picsum.photos/480/640' },
        }),
      );
      dispatch(s =>
        add_node(s, {
          id: 'sub_1',
          type: 'subgraph',
          position: vec2_create(100, 300),
          size: vec2_create(200, 120),
          title: 'My Subgraph',
          inputs: [{ id: 'in_1', label: 'In', type: 'input' }],
          outputs: [{ id: 'out_1', label: 'Out', type: 'output' }],
          custom_data: {
            graph: {
              nodes: {
                in_1: {
                  id: 'in_1',
                  type: 'subgraph_input',
                  position: vec2_create(100, 100),
                  size: vec2_create(20, 20),
                  title: 'Input',
                  inputs: [],
                  outputs: [{ id: 'out_1', label: 'In', type: 'output' }],
                  resizable: false,
                  custom_data: {},
                },
                out_1: {
                  id: 'out_1',
                  type: 'subgraph_output',
                  position: vec2_create(400, 100),
                  size: vec2_create(20, 20),
                  title: 'Output',
                  inputs: [{ id: 'in_1', label: 'Out', type: 'input' }],
                  outputs: [],
                  resizable: false,
                  custom_data: {},
                },
              },
              bindings: {},
            },
          },
        }),
      );
    } else if (name === 'math') {
      load_math_scene(dispatch);
    } else if (name === 'executor') {
      load_executor_scene(dispatch, easel);
    } else if (name === 'realtime') {
      load_realtime_scene(dispatch, easel);
    } else if (name === 'ip_api') {
      load_ip_api_scene(dispatch, easel);
    } else if (name === 'context_menu') {
      load_context_menu_scene(dispatch);
    } else if (name === 'document_subgraph') {
      if (options.document != null) {
        document_subgraph_handle = load_document_subgraph_scene(easel, {
          document: options.document,
          auto_enter: null,
        });
        const imported_base_name =
          options.file_name == null
            ? translate('file_state_imported_document')
            : project_name_from_file_name(options.file_name) ||
              translate('file_state_imported_document');
        if (project_name_el) {
          project_name_el.value = imported_base_name;
        }
        const controller = document_subgraph_handle.controller;
        saved_document_json = controller.serialize({ pretty: true });
        saved_document_file_name = current_project_file_name();
      } else {
        document_subgraph_handle = load_document_subgraph_scene(easel);
        if (project_name_el) {
          project_name_el.value = translate('file_state_fixture');
        }
        saved_document_json = null;
        saved_document_file_name = null;
      }
    } else if (name === 'perf') {
      load_perf_scene(dispatch);
    }

    if (scene_selector_el) {
      scene_selector_el.value = name;
    }
    update_scope_ui();
    update_project_file_state();
  };

  scene_selector_el?.addEventListener('change', e => {
    load_scene((e.target as HTMLSelectElement).value);
  });

  project_name_el?.addEventListener('input', () => {
    saved_document_json = null;
    saved_document_file_name = null;
    update_project_file_state();
    update_scope_ui();
  });

  const file_input_el = document.getElementById('file-import') as HTMLInputElement | null;
  file_input_el?.addEventListener('change', async () => {
    const file = file_input_el.files?.[0];
    file_input_el.value = '';
    if (file == null) {
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      set_import_error(translate('file_error_read'));
      return;
    }
    const parse_result = parse_project_document_json(text);
    if (E.isLeft(parse_result)) {
      set_import_error(format_project_file_error(parse_result.left));
      return;
    }
    load_scene('document_subgraph', {
      document: parse_result.right,
      file_name: file.name,
    });
  });

  document.getElementById('btn-export-document')?.addEventListener('click', export_project_file);

  const file_input_trigger_el = file_input_el;
  document.addEventListener('keydown', e => {
    const target = e.target as HTMLElement | null;
    if (target != null && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      export_project_file();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      file_input_trigger_el?.click();
    }
  });

  const toggle_library = (): void => {
    workspace_el?.classList.toggle('collapsed-library');
    document
      .getElementById('btn-collapse-library')
      ?.setAttribute(
        'aria-pressed',
        String(workspace_el?.classList.contains('collapsed-library') ?? false),
      );
  };
  document.getElementById('btn-collapse-library')?.addEventListener('click', toggle_library);
  document.getElementById('btn-library-close')?.addEventListener('click', toggle_library);

  node_search_el?.addEventListener('input', () => {
    const query = node_search_el.value.trim().toLowerCase();
    document.querySelectorAll('.node-group').forEach(group => {
      let group_has_match = false;
      group.querySelectorAll<HTMLElement>('.node-drag-item').forEach(item => {
        const match =
          query.length === 0 ||
          (item.textContent ?? '').toLowerCase().includes(query) ||
          (item.dataset['type'] ?? '').toLowerCase().includes(query);
        item.hidden = !match;
        if (match) {
          group_has_match = true;
        }
      });
      (group as HTMLElement).hidden = !group_has_match;
    });
  });

  const set_theme_mode = (mode: string): void => {
    if (mode === 'light') {
      set_theme(light_theme);
    } else {
      set_theme(default_theme);
    }
    document.body.dataset['theme'] = mode;
  };
  document.getElementById('theme-selector')?.addEventListener('change', e => {
    set_theme_mode((e.target as HTMLSelectElement).value);
  });
  set_theme_mode('dark');

  if (locale_selector_el) {
    locale_selector_el.value = read_locale_preference();
    locale_selector_el.addEventListener('change', event => {
      const preference = (event.target as HTMLSelectElement).value as LocalePreference;
      write_locale_preference(preference);
      const browser_language = typeof navigator === 'undefined' ? undefined : navigator.language;
      set_locale(resolve_locale(preference, browser_language));
      apply_dom_translations();
      refresh_dynamic_text();
    });
  }

  // Math Evaluator Effect
  effect(() => {
    if ((document.getElementById('scene-selector') as HTMLSelectElement)?.value === 'math') {
      dispatch(s => evaluate_math_graph(s));
    }
  });

  // Legacy stats panel.
  const stats_el = document.getElementById('hud-stats');
  const render_stats = (): void => {
    const s = state.value;
    const document_controller = document_subgraph_handle?.controller;
    const node_count = Object.keys(s.nodes).length;
    const wire_count = easel.plugin_data.wire?.get_bindings().length ?? 0;
    const zoom_text = `${s.camera.zoom.toFixed(2)}x`;
    const selected_text =
      s.selected_node_ids.length > 0
        ? s.selected_node_ids.join(', ')
        : translate('status_value_none');
    if (stat_nodes_el) {
      stat_nodes_el.textContent = String(node_count);
    }
    if (stat_wires_el) {
      stat_wires_el.textContent = String(wire_count);
    }
    if (stat_zoom_el) {
      stat_zoom_el.textContent = zoom_text;
    }
    if (stat_selected_el) {
      stat_selected_el.textContent = selected_text;
    }
    if (stats_el) {
      const scope_text =
        document_controller != null
          ? translate('stat_scope', { path: document_controller.path.join(' > ') })
          : translate('stat_stack_depth', {
              depth: easel.plugin_data.subgraph?.stack_depth() ?? 0,
            });
      const text_content = [
        translate('stat_camera', {
          x: s.camera.position.x.toFixed(1),
          y: s.camera.position.y.toFixed(1),
        }),
        translate('stat_interaction', { mode: s.interaction.mode }),
        scope_text,
      ].join('\n');
      if (stats_el.textContent !== text_content) {
        stats_el.textContent = text_content;
      }
    }
  };
  const refresh_dynamic_text = (): void => {
    render_stats();
    update_scope_ui();
    update_project_file_state();
  };
  effect(() => {
    void state.value;
    void document_subgraph_handle?.controller.view;
    refresh_dynamic_text();
  });

  const node_title_from_type = (type: string): string => {
    switch (type) {
      case 'text_generation':
        return translate('node_text_generation');
      case 'image_generation':
        return translate('node_image_generation');
      case 'audio_generation':
        return translate('node_audio_generation');
      case 'video_concatenation':
        return translate('node_video_concatenation');
      case 'text_input':
        return translate('node_text_input');
      case 'ip_api':
        return translate('node_ip_api');
      case 'counter':
        return translate('node_counter');
      case 'text_view':
        return translate('node_text_view');
      default:
        return type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  // Drag and Drop Node Creation
  canvas_el.addEventListener('dragover', e => {
    e.preventDefault();
  });

  canvas_el.addEventListener('drop', e => {
    e.preventDefault();
    const type = e.dataTransfer?.getData('text/plain');
    if (!type) return;

    const rect = canvas_el.getBoundingClientRect();
    const screen_x = e.clientX - rect.left;
    const screen_y = e.clientY - rect.top;

    const s = state.value;
    const world_x = (screen_x - s.camera.position.x) / s.camera.zoom;
    const world_y = (screen_y - s.camera.position.y) / s.camera.zoom;

    const id = `${type}_${Date.now()}`;

    let node_data: GraphNode = {
      id,
      type: 'default',
      position: vec2_create(world_x, world_y),
      size: vec2_create(200, 120),
      title: node_title_from_type(type),
      inputs: [],
      outputs: [],
      custom_data: {},
    };

    if (type === 'text_generation') {
      node_data = {
        ...node_data,
        custom_data: { color: '#3b82f6' },
        inputs: [
          { id: 'prompt', label: 'Prompt', type: 'input', value_type: 'text', required: true },
        ],
        outputs: [{ id: 'out_list', label: 'List [ ]', type: 'output', value_type: 'text' }],
        widgets: [
          {
            id: 'min_len',
            type: 'number',
            label: 'Minimum list length',
            value: 6,
            value_type: 'number',
          },
          {
            id: 'max_len',
            type: 'number',
            label: 'Maximum list length',
            value: 8,
            value_type: 'number',
          },
        ],
      };
    } else if (type === 'image_generation') {
      node_data = {
        ...node_data,
        custom_data: { color: '#10b981' },
        inputs: [
          { id: 'prompt', label: '[ ] Prompt', type: 'input', value_type: 'image' },
          { id: 'ref', label: 'Reference Image', type: 'input', value_type: 'image' },
        ],
        outputs: [{ id: 'out_img', label: 'Image [ ]', type: 'output', value_type: 'image' }],
        widgets: [
          { id: 'model', type: 'text', label: 'Model', value: 'Flux Dev', value_type: 'text' },
        ],
      };
    } else if (type === 'audio_generation') {
      node_data = {
        ...node_data,
        custom_data: { color: '#f59e0b' },
        inputs: [{ id: 'script', label: '[ ] Script', type: 'input', value_type: 'audio' }],
        outputs: [{ id: 'out_audio', label: 'Audio [ ]', type: 'output', value_type: 'audio' }],
        widgets: [
          {
            id: 'voice_id',
            type: 'text',
            label: 'Voice ID',
            value: 'Storyteller',
            value_type: 'text',
          },
        ],
      };
    } else if (type === 'video_concatenation') {
      node_data = {
        ...node_data,
        custom_data: { color: '#8b5cf6' },
        inputs: [{ id: 'videos', label: '[ ] Videos', type: 'input', value_type: 'video' }],
        outputs: [{ id: 'out_video', label: 'Video [ ]', type: 'output', value_type: 'video' }],
      };
    } else if (type === 'ip_api') {
      node_data = {
        ...node_data,
        custom_data: { color: '#06b6d4' },
        inputs: [{ id: 'query', label: 'Query', type: 'input', value_type: 'text' }],
        outputs: [
          { id: 'result', label: 'Result', type: 'output', value_type: 'object' },
          { id: 'country', label: 'Country', type: 'output', value_type: 'text' },
          { id: 'city', label: 'City', type: 'output', value_type: 'text' },
          { id: 'isp', label: 'ISP', type: 'output', value_type: 'text' },
          { id: 'lat', label: 'Lat', type: 'output', value_type: 'number' },
          { id: 'lon', label: 'Lon', type: 'output', value_type: 'number' },
          { id: 'query_ip', label: 'Queried', type: 'output', value_type: 'text' },
        ],
      };
    } else if (type === 'text_input') {
      node_data = {
        ...node_data,
        custom_data: { color: '#22c55e' },
        inputs: [],
        outputs: [{ id: 'query', label: 'Query', type: 'output', value_type: 'text' }],
        widgets: [{ id: 'value', type: 'text', label: 'Value', value: '', value_type: 'text' }],
      };
    } else if (type === 'text_view') {
      node_data = {
        ...node_data,
        custom_data: { color: '#a855f7' },
        inputs: [{ id: 'content', label: 'Content', type: 'input', value_type: 'text' }],
        outputs: [],
        resizable: false,
      };
    } else if (type === 'counter') {
      node_data = {
        ...node_data,
        type: 'counter',
        custom_data: { color: '#f97316' },
        inputs: [],
        outputs: [{ id: 'val', label: 'Value', type: 'output', value_type: 'number' }],
        widgets: [{ id: 'value', type: 'number', label: 'Value', value: 0, value_type: 'number' }],
        resizable: false,
      };
    }

    dispatch(st => add_node(st, node_data));
  });

  document.querySelectorAll('.node-drag-item').forEach(el => {
    el.addEventListener('dragstart', e => {
      const type = (e.target as HTMLElement).dataset['type'];
      (e as DragEvent).dataTransfer?.setData('text/plain', type || '');
    });
  });

  // -------------------------------------------------------------------
  // Context menu demo plugin-level provider.
  // This registers extra items on every node to show how plugins
  // can augment the context menu without modifying node code.
  // -------------------------------------------------------------------
  if (easel.plugin_data.context_menu) {
    const service = easel.plugin_data.context_menu;

    service.register({
      id: 'playground_node_flags',
      priority: -3,
      get_items: (ctx: ContextMenuContext): readonly ContextMenuItem[] => {
        if (ctx.node_id == null) {
          return [];
        }
        const node_id = ctx.node_id;
        const document_controller = document_subgraph_handle?.controller;
        const node = document_controller?.view.nodes[node_id] ?? easel.state.value.nodes[node_id];
        if (node == null) {
          return [];
        }
        const on_toggle = (flag: NodeFlag): void => {
          toggle_node_flag_for_context(
            document_subgraph_handle?.controller,
            easel.dispatch,
            node_id,
            flag,
          );
        };
        return get_node_flag_context_menu_items(node_id, node, on_toggle);
      },
    });

    service.register({
      id: 'playground_demo',
      priority: -5,
      get_items: (ctx: ContextMenuContext): readonly ContextMenuItem[] => {
        const items: ContextMenuItem[] = [];

        // Node info label shown when right-clicking any node.
        if (ctx.node_id) {
          items.push({
            id: 'demo_node_info',
            kind: 'label',
            label: translate('context_node_info', {
              node_id: ctx.node_id,
              node_type: ctx.node_type ?? 'unknown',
            }),
            icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
          });
        }

        // Item visible on any node
        if (ctx.node_id) {
          items.push({
            id: 'demo_log_info',
            label: translate('context_log_info'),
            group: 'playground',
            icon: '<svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
            action: () => {
              const node = easel.state.value.nodes[ctx.node_id!];
              console.log(
                '[ContextMenu Demo] Node:',
                ctx.node_id,
                'Type:',
                ctx.node_type,
                'Data:',
                node,
              );
            },
          });
        }

        // Item only on text_input nodes
        if (ctx.node_type === 'text_input') {
          items.push({
            id: 'demo_fill_hello',
            label: translate('context_fill_hello'),
            group: 'playground',
            icon: '<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>',
            action: () => {
              const node_id = ctx.node_id!;
              easel.dispatch(s => {
                const node = s.nodes[node_id];
                if (!node) return s;
                const widgets = (node.widgets || []).map(w =>
                  w.id === 'value' ? { ...w, value: 'Hello from ContextMenu!' } : w,
                );
                return { ...s, nodes: { ...s.nodes, [node_id]: { ...node, widgets } } };
              });
            },
          });
        }

        return items;
      },
    });

    console.log(
      '[ContextMenu Demo] Plugin-level provider registered. Right-click any node to see demo items.',
    );
  }

  // Demo: logger usage
  if (easel.plugin_data.logger) {
    const log = easel.plugin_data.logger;
    log.info('Easel playground started');
    log.debug('Initial scene loading...');

    // Track state changes and log count transitions.
    easel.app_events.on('state_changed', ({ prev, next }) => {
      const node_count = Object.keys(next.nodes).length;
      const prev_count = Object.keys(prev.nodes).length;
      if (node_count !== prev_count) {
        log.info(translate('logger_nodes_changed', { previous: prev_count, current: node_count }));
      }
    });
  }

  // Load the GraphDocument fixture as the primary file-workflow starting point.
  load_scene('document_subgraph');

  const set_legacy_file_feedback = (message: string, is_warning: boolean): void => {
    if (file_state_el) {
      file_state_el.classList.remove('state-saved', 'state-dirty');
      if (!is_warning) {
        file_state_el.classList.add('state-saved');
      } else {
        file_state_el.classList.add('state-dirty');
      }
      file_state_el.textContent = message;
    }
  };

  document.getElementById('btn-save')?.addEventListener('click', () => {
    const json = serialize_state(state.value);
    localStorage.setItem('easel_save', json);
    set_legacy_file_feedback(translate('file_state_legacy_saved'), false);
  });

  document.getElementById('btn-load')?.addEventListener('click', () => {
    const json = localStorage.getItem('easel_save');
    if (json) {
      dispatch(() => deserialize_state(json));
      set_legacy_file_feedback(translate('file_state_legacy_loaded'), false);
    } else {
      set_legacy_file_feedback(translate('file_state_no_legacy_save'), true);
    }
  });
};

init();
