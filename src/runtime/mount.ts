import { create_store } from './store';
import { setup_events } from './events';
import { render_nodes } from './render';
import { render_wires } from './render_wires';
import { with_guidelines } from '@/plugins/guidelines';
import { get_base_css, apply_theme, default_theme, type Theme } from './theme';
import EventEmitter from 'eventemitter3';
import type { State } from '@/core/types';
import type { ShallowRef } from '@vue/reactivity';
import { register_builtin_nodes } from '@/index';

export type Dispatch = (updater: (state: State) => State) => void;

export type EaselContext = {
  container: HTMLElement;
  state: ShallowRef<State>;
  dispatch: Dispatch;
  app_events: EventEmitter;
  set_theme: (theme: Partial<Theme>) => void;
};

export type EaselPlugin = (ctx: EaselContext) => void;

export type MountOptions = {
  theme?: Partial<Theme>;
  custom_css?: string;
  initial_state?: State;
  plugins?: EaselPlugin[];
};

export const mount_easel = (container: HTMLElement, options: MountOptions = {}) => {
  // Register built-in node types once
  register_builtin_nodes();

  const shadow = container.attachShadow({ mode: 'open' });
  
  const style_el = document.createElement('style');
  style_el.textContent = get_base_css() + (options.custom_css ? `\n${options.custom_css}` : '');
  shadow.appendChild(style_el);
  
  const theme = { ...default_theme, ...options.theme };
  apply_theme(container, theme);

  const canvas_el = document.createElement('div');
  canvas_el.className = 'easel-container';
  shadow.appendChild(canvas_el);

  const { state, dispatch } = create_store(options.initial_state);
  const app_events = new EventEmitter();
  const node_context = { app_events };
  
  let current_dispatch = with_guidelines(canvas_el, state, dispatch);

  const ctx: EaselContext = {
    container: canvas_el,
    state,
    get dispatch() { return current_dispatch; },
    set dispatch(new_dispatch: Dispatch) { current_dispatch = new_dispatch; },
    app_events,
    set_theme: (new_theme: Partial<Theme>) => apply_theme(container, { ...theme, ...new_theme })
  };

  options.plugins?.forEach(plugin => plugin(ctx));

  render_nodes(canvas_el, state, ctx.dispatch, node_context);
  render_wires(canvas_el, state);
  setup_events(canvas_el, ctx.dispatch, app_events);

  return ctx;
};