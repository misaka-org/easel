/**
 * Store — 响应式数据层。
 *
 * 核心抽象：
 *   Table<T> — 按表管理可记录数据（nodes, wires, 未来 binding 等）
 *   Store — 聚合 Table + 响应式 state + 事件钩子
 *
 * 向后兼容：
 *   store.state 仍是 ShallowRef<State>
 *   store.dispatch 仍是 (state → state) => void
 *   新增 store.nodes / store.wires 提供类型安全 CRUD
 */

import { shallowRef, type ShallowRef } from '@vue/reactivity';
import { create_initial_state } from '@/core/state';
import type { State, GraphNode, Wire } from '@/core/types';

// ── Change Event Types ──────────────────────────────────────────

export type ChangeType = 'put' | 'delete';

export type ChangeEvent<T> = {
  readonly type: ChangeType;
  readonly id: string;
  readonly prev: T | undefined;
  readonly next: T | undefined;
};

export type BeforeChangeHandler<T> = (
  event: ChangeEvent<T>,
) => ChangeEvent<T> | false | void;

export type AfterChangeHandler<T> = (event: ChangeEvent<T>) => void;

// ── Table ───────────────────────────────────────────────────────

export class Table<T extends { readonly id: string }> {
  private before_hooks = new Set<BeforeChangeHandler<T>>();
  private after_hooks = new Set<AfterChangeHandler<T>>();

  constructor(
    private read: () => Record<string, T>,
    private write: (
      updater: (prev: Record<string, T>) => Record<string, T>,
    ) => void,
  ) {}

  get(id: string): T | undefined {
    return this.read()[id];
  }

  list(): T[] {
    return Object.values(this.read());
  }

  keys(): string[] {
    return Object.keys(this.read());
  }

  has(id: string): boolean {
    return id in this.read();
  }

  put(id: string, data: T): boolean {
    const prev = this.read()[id];
    let event: ChangeEvent<T> = { type: 'put', id, prev, next: data };

    for (const h of this.before_hooks) {
      const result = h(event);
      if (result === false) return false;
      if (result && result.next) event = result;
    }

    this.write(records => ({ ...records, [id]: event.next ?? data }));

    for (const h of this.after_hooks) {
      h(event);
    }
    return true;
  }

  delete(id: string): boolean {
    const prev = this.read()[id];
    if (prev === undefined) return true;
    const event: ChangeEvent<T> = { type: 'delete', id, prev, next: undefined };

    for (const h of this.before_hooks) {
      const result = h(event);
      if (result === false) return false;
    }

    this.write(records => {
      const next = { ...records };
      delete next[id];
      return next;
    });

    for (const h of this.after_hooks) {
      h(event);
    }
    return true;
  }

  on_before_change(handler: BeforeChangeHandler<T>): () => void {
    this.before_hooks.add(handler);
    return () => this.before_hooks.delete(handler);
  }

  on_after_change(handler: AfterChangeHandler<T>): () => void {
    this.after_hooks.add(handler);
    return () => this.after_hooks.delete(handler);
  }
}

// ── Dispatch type ───────────────────────────────────────────────

export type Dispatch = (updater: (state: State) => State) => void;

// ── Store ───────────────────────────────────────────────────────

export type StoreOptions = {
  initial_state?: State;
};

export class Store {
  readonly state: ShallowRef<State>;
  readonly dispatch: Dispatch;

  readonly nodes: Table<GraphNode>;
  readonly wires: Table<Wire>;

  constructor(opts: StoreOptions = {}) {
    const initial = opts.initial_state ?? create_initial_state();
    const state_ref = shallowRef<State>(initial);

    const dispatch: Dispatch = (updater) => {
      state_ref.value = updater(state_ref.value);
    };

    this.state = state_ref;
    this.dispatch = dispatch;

    this.nodes = new Table<GraphNode>(
      () => state_ref.value.nodes,
      (fn) => { dispatch(s => ({ ...s, nodes: fn(s.nodes) })); },
    );

    this.wires = new Table<Wire>(
      () => state_ref.value.wires,
      (fn) => { dispatch(s => ({ ...s, wires: fn(s.wires) })); },
    );
  }
}