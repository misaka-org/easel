import { create_store } from './store';
import { setup_events } from './events';
import { render_nodes } from './render';
import { render_wires } from './render_wires';
import { with_guidelines } from '@/plugins/guidelines';
import { get_base_css, apply_theme, default_theme, type Theme } from './theme';
import EventEmitter from 'eventemitter3';
import type { State } from '@/core/types';
import type { ShallowRef, ReactiveEffectRunner } from '@vue/reactivity';
import { register_builtin_nodes } from '@/index';
import type { EaselNode, Dispatch } from './registry';

/**
 * 插件扩展数据命名空间。
 * 插件通过 declaration merging 向此接口添加字段，
 * 消费者直接通过 easel.plugin_data.xxx 访问，全程类型安全。
 *
 * @example
 * // context_menu/index.ts
 * declare module '../runtime/easel' {
 *   interface EaselPluginData {
 *     context_menu?: ContextMenuService;
 *   }
 * }
 * // 消费者
 * easel.plugin_data.context_menu?.register(...)
 */
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
  app_events: EventEmitter<EaselEvents>;
  node_instances = new Map<string, { el: HTMLElement; inst: EaselNode; runner: ReactiveEffectRunner }>();
  /** 插件扩展数据 —— 通过 declaration merging 添加类型，零 cast 访问 */
  plugin_data: EaselPluginData = {} as EaselPluginData;
  theme: Theme;

  constructor(container: HTMLElement, options: MountOptions = {}) {
    register_builtin_nodes();

    const shadow = container.attachShadow({ mode: 'open' });
    
    const style_el = document.createElement('style');
    style_el.textContent = get_base_css() + (options.custom_css ? `\n${options.custom_css}` : '');
    shadow.appendChild(style_el);
    
    this.theme = { ...default_theme, ...options.theme };
    apply_theme(container, this.theme);

    const canvas_el = document.createElement('div');
    canvas_el.className = 'easel-container';
    shadow.appendChild(canvas_el);

    const store = create_store(options.initial_state);
    this.state = store.state;
    this.app_events = new EventEmitter<EaselEvents>();
    
    let current_dispatch = with_guidelines(canvas_el, this.state, store.dispatch);
    this.dispatch = (updater) => {
      const prev = this.state.value;
      current_dispatch(updater);
      const next = this.state.value;
      if (prev !== next) {
        this.app_events.emit('state_changed', { prev, next });
      }
    };
    this.container = canvas_el;

    options.plugins?.forEach(plugin => plugin(this));

    render_nodes(this);
    render_wires(this.container, this.state);
    setup_events(this.container, this.dispatch, this.app_events);
  }

  set_theme = (new_theme: Partial<Theme>) => {
    this.theme = { ...this.theme, ...new_theme };
    const root = this.container.getRootNode();
    apply_theme(root instanceof ShadowRoot ? root.host as HTMLElement : this.container, this.theme);
  };

  get_node_instance(id: string): EaselNode | undefined {
    return this.node_instances.get(id)?.inst;
  }
}
