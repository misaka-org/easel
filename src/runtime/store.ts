import { shallowRef } from '@vue/reactivity';
import type { State } from '@/core/types';
import { create_initial_state } from '@/core/state';

export const create_store = (initial_state: State = create_initial_state()) => {
  const state_ref = shallowRef<State>(initial_state);

  const dispatch = (updater: (state: State) => State): void => {
    state_ref.value = updater(state_ref.value);
  };

  return {
    state: state_ref,
    dispatch
  };
};