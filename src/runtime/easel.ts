import { Store } from './store';
import { group_plugin } from '@/plugins/group';
import { setup_events } from './events';
import { render_nodes } from './render';
import { wire_plugin } from '@/plugins/wire';
import { guidelines_plugin } from '@/plugins/guidelines';
import { toolbar_plugin } from '@/plugins/toolbar';
import { subgraph_plugin } from '@/plugins/subgraph';
import { get_base_css, apply_theme, default_theme, type Theme } from './theme';
import { CameraController } from './camera';
import { ToolManager } from './tool_manager';
import EventEmitter from 'eventemitter3';
import type { State, GraphNode } from '@/core/types';
import type { ShallowRef, ReactiveEffectRunner } from '@vue/reactivity';
import type { EaselNode } from './registry';
import type { Dispatch } from './store';
import type { EaselEvents } from './event_types';
export type { EaselEvents };
import { KeybindingManager, register_core_keybindings } from './keybindings';
import { Register, register_builtin_widgets } from './register';
import { vec2_create } from '@/core/math';
import { SubgraphNode, SubgraphInputNode, SubgraphOutputNode } from '@/nodes/subgraph';
import { GroupNode } from '@/nodes/group';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- 空接口用于 declaration merging，插件通过扩充该接口添加自定义数据
export interface EaselPluginData {}

/** Per-node event payloads. Each node instance gets its own EventEmitter. */
export type NodeEventPayloads = {
  data: { prev: GraphNode; next: GraphNode };
  removed: void;
};

export type PluginDependency = {
  /** Plugin id that this plugin depends on */
  id: string;
  /** If true, plugin cannot function without this dependency. Default false (soft dependency). */
  hard?: boolean;
};

export type EaselPlugin = {
  /** Unique plugin identifier. Convention: @easel/<name> */
  readonly id: string;
  /** Plugins that must/should be loaded before this one */
  readonly dependencies?: readonly PluginDependency[];
  /** Plugin setup function */
  setup(easel: Easel): void;
};

export type MountOptions = {
  theme?: Partial<Theme>;
  custom_css?: string;
  initial_state?: State;
  plugins?: EaselPlugin[];
};

export class Easel {
  container: HTMLElement;
  state: ShallowRef<State>;
  dispatch: Dispatch;
  store: Store;
  app_events: EventEmitter<EaselEvents>;
  /** Per-node event bus — subscribers get granular per-node change notifications. */
  node_events = new Map<string, EventEmitter<NodeEventPayloads>>();
  register: Register;
  node_instances = new Map<
    string,
    { el: HTMLElement; inst: EaselNode; runner: ReactiveEffectRunner }
  >();
  camera: CameraController;
  tools: ToolManager;
  plugin_data: EaselPluginData = {} as EaselPluginData;
  _loaded_plugins = new Set<string>();
  keybindings = new KeybindingManager();
  theme: Theme;

  constructor(container: HTMLElement, options: MountOptions = {}) {
    // Initialize registry with built-in widget types
    this.register = new Register();
    register_builtin_widgets();

    // Register built-in node types
    this.register.add_node('subgraph', SubgraphNode);
    this.register.add_node('group', GroupNode);
    this.register.add_node('subgraph_input', SubgraphInputNode, {
      resizable: false,
      size: vec2_create(20, 20),
    });
    this.register.add_node('subgraph_output', SubgraphOutputNode, {
      resizable: false,
      size: vec2_create(20, 20),
    });

    const shadow = container.attachShadow({ mode: 'open' });

    const style_el = document.createElement('style');
    style_el.textContent = get_base_css() + (options.custom_css ? `\n${options.custom_css}` : '');
    shadow.appendChild(style_el);

    this.theme = { ...default_theme, ...options.theme };
    apply_theme(container, this.theme);

    const canvas_el = document.createElement('div');
    canvas_el.className = 'easel-container';
    shadow.appendChild(canvas_el);

    const easel_store = new Store({ initial_state: options.initial_state });
    this.state = easel_store.state;
    this.store = easel_store;

    this.app_events = new EventEmitter<EaselEvents>();

    this.dispatch = updater => {
      const prev = this.state.value;
      easel_store.dispatch(updater);
      const next = this.state.value;
      if (prev !== next) {
        this.app_events.emit('state_changed', { prev, next });
      }
    };
    this.tools = new ToolManager(easel_store.dispatch);
    this.tools.bind_container(canvas_el);
    this.tools.activate('select');

    this.camera = new CameraController(
      () => this.state.value,
      this.dispatch,
    );
    this.container = canvas_el;

    // core plugins (always on)
    const all_plugins = [
      guidelines_plugin,
      toolbar_plugin,
      subgraph_plugin,
      wire_plugin,
      group_plugin,
      ...(options.plugins ?? []),
    ];

    for (const plugin of all_plugins) {
      if (plugin.dependencies) {
        for (const dep of plugin.dependencies) {
          if (!this._loaded_plugins.has(dep.id)) {
            if (dep.hard) {
              throw new Error(
                `Plugin "${plugin.id}" requires "${dep.id}" (hard dependency) but it is not loaded. ` +
                `Ensure "${dep.id}" is listed before "${plugin.id}".`
              );
            }
          }
        }
      }
      plugin.setup(this);
      this._loaded_plugins.add(plugin.id);
    }

    register_core_keybindings(this.keybindings, this.dispatch, this.app_events);

    render_nodes(this);
    setup_events(this.container, this.dispatch, this.app_events, this.tools, this.keybindings);
  }

  set_theme = (new_theme: Partial<Theme>) => {
    this.theme = { ...this.theme, ...new_theme };
    const root = this.container.getRootNode();
    apply_theme(
      root instanceof ShadowRoot ? (root.host as HTMLElement) : this.container,
      this.theme,
    );
  };

  get_node_instance(id: string): EaselNode | undefined {
    return this.node_instances.get(id)?.inst;
  }
}
