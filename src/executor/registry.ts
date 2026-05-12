import type { ExecuteContext } from './types';

export type ExecuteFn = (ctx: ExecuteContext) => Promise<Record<string, unknown>>;

const execute_registry = new Map<string, ExecuteFn>();

export const register_execute_fn = (type: string, fn: ExecuteFn): void => {
  execute_registry.set(type, fn);
};

export const get_execute_fn = (type: string): ExecuteFn | undefined => {
  return execute_registry.get(type);
};