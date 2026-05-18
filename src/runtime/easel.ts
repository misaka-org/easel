import { Store } from './store';
import { setup_events } from './events';
import { render_nodes } from './render';
import { render_wires } from './render_wires';
import { with_guidelines } from '@/plugins/guidelines';
import { get_base_css, apply_theme, default_theme, type Theme } from './theme';
import { CameraController } from './camera';
import EventEmitter from 'eventemitter3';
import type { State, GraphNode } from '@/core/types';
import type { ShallowRef, ReactiveEffectRunner } from '@vue/reactivity';
import type { EaselNode, Dispatch } from './registry';
import { KeybindingManager, register_core_keybindings } from './keybindings';
import { Register, register_builtin_widgets } from './register';
import { vec2_create } from '@/core/math';
import { SubgraphNode, SubgraphInputNode, SubgraphOutputNode } from '@/nodes/subgraph';
import { GroupNode } from '@/nodes/group';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- 空接口用于 declaration merging，插件通过扩充该接口添加自定义数据
export interface EaselPluginData {}

export interface EaselEvents {
  state_changed: (payload: { prev: State; next: State }) => void;
  pointerdown: (e: PointerEvent) => void;
  pointermove: (e: PointerEvent) => void;
  pointerup: (e: PointerEvent) => void;
  keydown: (e: KeyboardEvent) => void;
  keyup: (e: KeyboardEvent) => void;
  contextmenu: (e: MouseEvent) => void;
  node_dblclick: (payload: { node_id: string; target: HTMLElement }) => void;
  nodes_dropped: (node_ids: string[]) => void;
  enter_subgraph: (payload: { node_id: string }) => void;
}

/** Per-node event payloads. Each node instance gets its own EventEmitter. */
export type NodeEventPayloads = {
  data: { prev: GraphNode; next: GraphNode };
  removed: void;
};

export type EaselPlugin = (easel: Easel) => void;

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
  plugin_data: EaselPluginData = {} as EaselPluginData;
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

    // Auto-cleanup wires when a node is deleted
    this.store.nodes.on_before_change((event) => {
      if (event.type === 'delete' && event.prev) {
        for (const wire of this.store.wires.list()) {
          if (wire.source_node_id === event.id || wire.target_node_id === event.id) {
            this.store.wires.delete(wire.id);
          }
        }
      }
    });

    this.app_events = new EventEmitter<EaselEvents>();

    const current_dispatch = with_guidelines(canvas_el, this.state, easel_store.dispatch);
    this.dispatch = updater => {
      const prev = this.state.value;
      current_dispatch(updater);
      const next = this.state.value;
      if (prev !== next) {
        this.app_events.emit('state_changed', { prev, next });
      }
    };
    this.camera = new CameraController(
      () => this.state.value,
      this.dispatch,
    );
    this.container = canvas_el;

    options.plugins?.forEach(plugin => plugin(this));

    register_core_keybindings(this.keybindings, this.dispatch);

    render_nodes(this);
    render_wires(this.container, this.state);
    setup_events(this.container, this.dispatch, this.app_events, this.keybindings);
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
