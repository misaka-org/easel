import type { State } from '@/core/types';
import type { Theme } from './theme';
import type EventEmitter from 'eventemitter3';
import type { ShallowRef } from '@vue/reactivity';

export type Dispatch = (updater: (state: State) => State) => void;

export type EaselContext = {
  container: HTMLElement;
  state: ShallowRef<State>;
  dispatch: Dispatch;
  app_events: EventEmitter;
  set_theme: (theme: Partial<Theme>) => void;
};

export type EaselPlugin = (ctx: EaselContext) => void;