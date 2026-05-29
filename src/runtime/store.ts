/**
 * Store — 响应式数据层。
 *
 * 核心抽象：
 *   Table<T> — 按表管理可记录数据（nodes, bindings 等）
 *   Store — 聚合 Table + 响应式 state + 事件钩子
 *
 * 向后兼容：
 *   store.state 仍是 ShallowRef<State>
 *   store.dispatch 仍是 (state → state) => void
 *   新增 store.nodes / store.bindings 提供类型安全 CRUD
 */

import { shallowRef, type ShallowRef } from '@vue/reactivity';
import { create_initial_state } from '@/core/state';
import type { State, GraphNode, Camera } from '@/core/types';

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

// ── Serialized Store ────────────────────────────────────────────

export type SerializedStore = {
  nodes: Record<string, GraphNode>;
  camera?: Camera;
  extensions?: Record<string, Record<string, any>>;
};

// ── Store ───────────────────────────────────────────────────────

export type StoreOptions = {
  initial_state?: State;
};

export class Store {
  readonly state: ShallowRef<State>;
  readonly dispatch: Dispatch;

  readonly nodes: Table<GraphNode>;

  private _in_transaction = false;
  private _pending_updaters: Array<(s: State) => State> = [];
  private _extension_tables: Map<string, Table<any>>;
  private _extension_data: ShallowRef<Record<string, Record<string, any>>>;

  constructor(opts: StoreOptions = {}) {
    const initial = opts.initial_state ?? create_initial_state();
    const state_ref = shallowRef<State>(initial);

    const dispatch: Dispatch = (updater) => {
      if (this._in_transaction) {
        this._pending_updaters.push(updater);
      } else {
        state_ref.value = updater(state_ref.value);
      }
    };

    this.state = state_ref;
    this.dispatch = dispatch;

    this.nodes = new Table<GraphNode>(
      () => state_ref.value.nodes,
      (fn) => { dispatch(s => ({ ...s, nodes: fn(s.nodes) })); },
    );

    this._extension_tables = new Map();
    this._extension_data = shallowRef<Record<string, Record<string, any>>>({});
  }

  /** 批量事务：fn 内的所有 put/delete 合并为一次 state 更新。 */
  transact(fn: () => void): void {
    this._in_transaction = true;
    this._pending_updaters = [];
    try {
      fn();
    } finally {
      this._in_transaction = false;
      if (this._pending_updaters.length > 0) {
        this.state.value = this._pending_updaters.reduce(
          (s, fn) => fn(s),
          this.state.value,
        );
        this._pending_updaters = [];
      }
    }
  }

  /** 创建/获取扩展表。扩展表数据存在 Store 私有的 _extension_data 中，不和 core State 耦合。 */
  create_extension_table<T extends { readonly id: string }>(name: string): Table<T> {
    const existing = this._extension_tables.get(name);
    if (existing) return existing as Table<T>;

    const table = new Table<T>(
      () => (this._extension_data.value[name] ?? {}) as Record<string, T>,
      (fn) => {
        this._extension_data.value = {
          ...this._extension_data.value,
          [name]: fn(this._extension_data.value[name] ?? {} as Record<string, T>),
        };
      },
    );

    this._extension_tables.set(name, table);
    return table;
  }

  /** 序列化全部表（含扩展表数据）。 */
  serialize(): SerializedStore {
    const s = this.state.value;
    const out: SerializedStore = {
      nodes: { ...s.nodes },
    };
    out.camera = { ...s.camera };
    const ext = this._extension_data.value;
    const ext_keys = Object.keys(ext);
    if (ext_keys.length > 0) {
      out.extensions = {};
      for (const key of ext_keys) {
        if (Object.keys(ext[key]).length > 0) {
          out.extensions[key] = { ...ext[key] };
        }
      }
    }
    return out;
  }

  /** 从序列化数据创建 Store。 */
  static deserialize(data: SerializedStore): Store {
    const base = create_initial_state();
    const store = new Store({
      initial_state: {
        ...base,
        nodes: data.nodes,
        camera: data.camera ?? base.camera,
      },
    });
    if (data.extensions) {
      for (const [name, records] of Object.entries(data.extensions)) {
        if (Object.keys(records).length > 0) {
          store._extension_data.value = {
            ...store._extension_data.value,
            [name]: { ...records },
          };
        }
      }
    }
    return store;
  }
}