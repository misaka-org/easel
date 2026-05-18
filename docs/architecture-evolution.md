# 架构演进计划

> 对标 tldraw，结合 easel 实际场景的渐进式架构优化。

## 目录

1. [Store 抽象](#1-store-抽象)
2. [事件钩子 (Side Effects)](#2-事件钩子-side-effects)
3. [Binding 关系系统](#3-binding-关系系统)
4. [Camera 系统增强](#4-camera-系统增强)
5. [工具切换 (Tool System)](#5-工具切换-tool-system)
6. [实现顺序](#6-实现顺序)


---

## Checklist 总览

> 每个主题下细分子任务。完成后 `[x]` 标记。

### 阶段 1：Camera 系统增强

- [ ] 新增 `src/runtime/camera.ts` — CameraController 类（animateTo + rAF）
- [x] 内置 easing 函数（easeInOutCubic, easeOutQuint, linear）
- [ ] `zoomToRect()` / `zoomToSelection()` / `fitToView()` / `centerOnPoint()` 通用方法
- [ ] `controls.ts` 改用 CameraController（zoom_in/out/reset/fit）
- [ ] `easel.camera` 对外暴露

### 阶段 2：Store 抽象

- [ ] `Table<T>` 类 — 基于 `shallowRef<Record<string, T>>`，支持 get/put/list/delete/has
- [ ] `Store` 类 — 聚合 Table，支持 transact() 批量事务
- [ ] 序列化自动遍历全部表（取代手写 serialize_state）
- [ ] 全部读取路径迁移：`easel.state.value.nodes[id]` → `easel.store.nodes.get(id)`
- [ ] 渲染层（render.ts / render_wires.ts）适配新 Store API
- [ ] 废弃 `src/core/state.ts` 或整合为 Store 的工厂函数

### 阶段 2b：事件钩子 (Side Effects)

- [ ] `Store.onBeforeChange(table, handler)` — 返回 false 阻止变更，可修改 payload
- [ ] `Store.onAfterChange(table, handler)` — 级联反应
- [x] handler 注册返回取消函数
- [ ] 迁移 `with_guidelines` 到 store hook
- [x] 节点删除自动清理关联 wire（通过 on_before_change 实现）
- [ ] 删除 `src/runtime/easel.ts` 中的 `with_guidelines` 包装

### 阶段 3：Binding 关系系统

- [ ] 新增 `Binding` 类型（id, type, source_id, source_handle, target_id, target_handle, meta?）
- [ ] `Store.bindings: Table<Binding>`
- [ ] `Wire` 保留作为 `Binding` 的工厂别名（`createDataFlowBinding(...)`）
- [ ] `render_wires.ts` 从 bindings 表读取 `type === 'data-flow'`
- [ ] GroupNode children 管理迁移到 `type === 'group-child'` 的 binding
- [ ] 废弃直接 `Wire` 类型

### 阶段 4：工具切换 (Tool System)

- [ ] `Tool` 类型定义 — onPointerDown/Move/Up/Wheel + onEnter/Exit
- [ ] `State.active_tool: string` 字段
- [ ] `ToolManager` — 注册/激活/事件路由
- [ ] 拆分 `interactions.ts` 为独立 Tool 文件（SelectTool / HandTool / WireTool）
- [ ] `Interaction` union type 保留为工具的 private state
- [ ] 插件注册自定义工具的 API
- [ ] 上下文菜单添加工具切换项

### 阶段 5：收尾

- [ ] 清理废弃 API（旧 Wire 类型、with_guidelines、serialize_state）
- [ ] 外部接口文档同步
- [ ] 性能回归测试（渲染 + 交互 + 执行引擎）

---


## 1. Store 抽象

### 现状

```
src/runtime/store.ts — create_store() 返回 shallowRef<State> + dispatch(updater)
```

State 是一个扁平的 plain object，所有数据类型平铺在一层：

```ts
State = {
  nodes: Record<string, GraphNode>,
  wires: Record<string, Wire>,
  camera: Camera,
  interaction: Interaction,
  selected_node_ids: string[],
  modifiers: Modifiers,
}
```

新增数据类型（binding、page、asset 等）必须修改 State 类型、create_initial_state、serialization，每次加东西牵一发动全身。

### 目标

- 一个轻量的 Store 层，内部按"表"组织数据
- 每个表有独立的 CRUD：`store.get(table, id)` / `store.put(table, id, data)` / `store.delete(table, id)`
- 支持批量事务：多个 put/delete 合并一次通知
- 序列化自动覆盖所有表，无需手动维护
- 表新增不破坏现有代码

### 方案

引入 `Table<T>` 抽象——底层就是一个 `Record<string, T>` + 响应式包装：

```ts
// 核心类型
class Table<T extends { id: string }> {
  // 内部 shallowRef<Record<string, T>>
  get(id: string): T | undefined;
  list(): T[];          // 按插入顺序
  put(id: string, data: T): void;
  delete(id: string): void;
  has(id: string): boolean;
}

// Store 聚合多个表，核心纯函数操作仍保持不可变约束
class Store {
  nodes: Table<GraphNode>;
  wires: Table<Wire>;
  bindings?: Table<Binding>;   // 按需启用
  pages?: Table<Page>;

  // 事务 — 批量变更后单次通知
  transact(fn: () => void): void;

  // 序列化 — 自动遍历全部表
  serialize(): SerializedStore;
  static deserialize(data: SerializedStore): Store;
}
```

关键在于：
1. Table 内部用 `shallowRef`，响应式不变
2. 不可变约束通过 store 层的 API 约束保证（put 时内部 clone）
3. 与现有 `Easel.dispatch` 兼容——Store 变更后触发 state_changed 事件

### 影响范围

- `src/runtime/store.ts` — 重写为 Table + Store 类
- `src/core/state.ts` — 可保留作为创建 initial state 的工厂
- `src/core/types.ts` — State 类型可能变为 Store 的 snapshot view
- 所有通过 `easel.state.value.nodes[id]` 读数据的地方——改为 `easel.store.nodes.get(id)`
- `src/runtime/easel.ts` — Store 替换 create_store 调用
- 渲染层 render.ts/render_wires.ts — 读取路径变化但逻辑不变


---

## Checklist 总览

> 每个主题下细分子任务。完成后 `[x]` 标记。

### 阶段 1：Camera 系统增强

- [ ] 新增 `src/runtime/camera.ts` — CameraController 类（animateTo + rAF）
- [x] 内置 easing 函数（easeInOutCubic, easeOutQuint, linear）
- [ ] `zoomToRect()` / `zoomToSelection()` / `fitToView()` / `centerOnPoint()` 通用方法
- [ ] `controls.ts` 改用 CameraController（zoom_in/out/reset/fit）
- [ ] `easel.camera` 对外暴露

### 阶段 2：Store 抽象

- [ ] `Table<T>` 类 — 基于 `shallowRef<Record<string, T>>`，支持 get/put/list/delete/has
- [ ] `Store` 类 — 聚合 Table，支持 transact() 批量事务
- [ ] 序列化自动遍历全部表（取代手写 serialize_state）
- [ ] 全部读取路径迁移：`easel.state.value.nodes[id]` → `easel.store.nodes.get(id)`
- [ ] 渲染层（render.ts / render_wires.ts）适配新 Store API
- [ ] 废弃 `src/core/state.ts` 或整合为 Store 的工厂函数

### 阶段 2b：事件钩子 (Side Effects)

- [ ] `Store.onBeforeChange(table, handler)` — 返回 false 阻止变更，可修改 payload
- [ ] `Store.onAfterChange(table, handler)` — 级联反应
- [x] handler 注册返回取消函数
- [ ] 迁移 `with_guidelines` 到 store hook
- [x] 节点删除自动清理关联 wire（通过 on_before_change 实现）
- [ ] 删除 `src/runtime/easel.ts` 中的 `with_guidelines` 包装

### 阶段 3：Binding 关系系统

- [ ] 新增 `Binding` 类型（id, type, source_id, source_handle, target_id, target_handle, meta?）
- [ ] `Store.bindings: Table<Binding>`
- [ ] `Wire` 保留作为 `Binding` 的工厂别名（`createDataFlowBinding(...)`）
- [ ] `render_wires.ts` 从 bindings 表读取 `type === 'data-flow'`
- [ ] GroupNode children 管理迁移到 `type === 'group-child'` 的 binding
- [ ] 废弃直接 `Wire` 类型

### 阶段 4：工具切换 (Tool System)

- [ ] `Tool` 类型定义 — onPointerDown/Move/Up/Wheel + onEnter/Exit
- [ ] `State.active_tool: string` 字段
- [ ] `ToolManager` — 注册/激活/事件路由
- [ ] 拆分 `interactions.ts` 为独立 Tool 文件（SelectTool / HandTool / WireTool）
- [ ] `Interaction` union type 保留为工具的 private state
- [ ] 插件注册自定义工具的 API
- [ ] 上下文菜单添加工具切换项

### 阶段 5：收尾

- [ ] 清理废弃 API（旧 Wire 类型、with_guidelines、serialize_state）
- [ ] 外部接口文档同步
- [ ] 性能回归测试（渲染 + 交互 + 执行引擎）

---


## 2. 事件钩子 (Side Effects)

### 现状

```
app_events.emit('state_changed', { prev, next })
```

- 只有一个粗粒度 `state_changed` 事件
- 无法订阅特定类型数据的变化（只看 node 不看 wire）
- 无法在变更前拦截/修改
- 插件的副作用（如 guideline、auto_group）通过 `with_guidelines` 包装 dispatch 实现，不可扩展

### 目标

- 按数据表注册 before/after 钩子
- 细粒度事件：`store.onAfterChange('node', handler)` — handler 拿到 id + prev + next
- before handler 可以修改 payload 或阻止变更
- after handler 可以触发级联变更（在事务中）
- 插拔式——插件注册副作用，不需要 wrap dispatch

### 方案

在 Store 层内置 Hook 系统：

```ts
// 变更事件 payload
type ChangeEvent<T> = {
  type: 'put' | 'delete';
  id: string;
  prev: T | undefined;     // put 时 prev 是旧值，delete 时 prev 是被删的值
  next: T | undefined;     // put 时 next 是新值，delete 时 next 是 undefined
};

// Store 新增
class Store {
  onBeforeChange<T>(
    table: string,
    handler: (event: ChangeEvent<T>) => ChangeEvent<T> | false | void,
  ): () => void;            // 返回取消注册函数

  onAfterChange<T>(
    table: string,
    handler: (event: ChangeEvent<T>) => void,
  ): () => void;
}
```

before handler 返回 `false` 阻止本次变更，返回修改后的 event 做数据拦截。

示例：

```ts
// 节点删除时自动清理 wire
store.onBeforeChange('node', (event) => {
  if (event.type === 'delete' && event.prev) {
    for (const w of store.wires.list()) {
      if (w.source_node_id === event.id || w.target_node_id === event.id) {
        store.wires.delete(w.id);
      }
    }
  }
});
```

### 影响范围

- `src/runtime/store.ts` — 新增 before/after hook 注册机制
- `src/runtime/easel.ts` — 移除 `with_guidelines` 包装，改为注册 side effect
- `src/plugins/guidelines.ts` — 改为使用 store hook
- 其他插件——可声明式注册副作用，不再依赖 dispatch wrapper


---

## Checklist 总览

> 每个主题下细分子任务。完成后 `[x]` 标记。

### 阶段 1：Camera 系统增强

- [ ] 新增 `src/runtime/camera.ts` — CameraController 类（animateTo + rAF）
- [x] 内置 easing 函数（easeInOutCubic, easeOutQuint, linear）
- [ ] `zoomToRect()` / `zoomToSelection()` / `fitToView()` / `centerOnPoint()` 通用方法
- [ ] `controls.ts` 改用 CameraController（zoom_in/out/reset/fit）
- [ ] `easel.camera` 对外暴露

### 阶段 2：Store 抽象

- [ ] `Table<T>` 类 — 基于 `shallowRef<Record<string, T>>`，支持 get/put/list/delete/has
- [ ] `Store` 类 — 聚合 Table，支持 transact() 批量事务
- [ ] 序列化自动遍历全部表（取代手写 serialize_state）
- [ ] 全部读取路径迁移：`easel.state.value.nodes[id]` → `easel.store.nodes.get(id)`
- [ ] 渲染层（render.ts / render_wires.ts）适配新 Store API
- [ ] 废弃 `src/core/state.ts` 或整合为 Store 的工厂函数

### 阶段 2b：事件钩子 (Side Effects)

- [ ] `Store.onBeforeChange(table, handler)` — 返回 false 阻止变更，可修改 payload
- [ ] `Store.onAfterChange(table, handler)` — 级联反应
- [x] handler 注册返回取消函数
- [ ] 迁移 `with_guidelines` 到 store hook
- [x] 节点删除自动清理关联 wire（通过 on_before_change 实现）
- [ ] 删除 `src/runtime/easel.ts` 中的 `with_guidelines` 包装

### 阶段 3：Binding 关系系统

- [ ] 新增 `Binding` 类型（id, type, source_id, source_handle, target_id, target_handle, meta?）
- [ ] `Store.bindings: Table<Binding>`
- [ ] `Wire` 保留作为 `Binding` 的工厂别名（`createDataFlowBinding(...)`）
- [ ] `render_wires.ts` 从 bindings 表读取 `type === 'data-flow'`
- [ ] GroupNode children 管理迁移到 `type === 'group-child'` 的 binding
- [ ] 废弃直接 `Wire` 类型

### 阶段 4：工具切换 (Tool System)

- [ ] `Tool` 类型定义 — onPointerDown/Move/Up/Wheel + onEnter/Exit
- [ ] `State.active_tool: string` 字段
- [ ] `ToolManager` — 注册/激活/事件路由
- [ ] 拆分 `interactions.ts` 为独立 Tool 文件（SelectTool / HandTool / WireTool）
- [ ] `Interaction` union type 保留为工具的 private state
- [ ] 插件注册自定义工具的 API
- [ ] 上下文菜单添加工具切换项

### 阶段 5：收尾

- [ ] 清理废弃 API（旧 Wire 类型、with_guidelines、serialize_state）
- [ ] 外部接口文档同步
- [ ] 性能回归测试（渲染 + 交互 + 执行引擎）

---


## 3. Binding 关系系统

### 现状

`Wire` 是唯一关系类型，硬编码在 State 结构中。

连线关系目前 encode 了数据流（output port → input port），但其他关系（群组父子、子图边界、注释关联等）用 `custom_data.children` 等 hack 实现。

### 目标

- 一个通用的 Binding 类型，表达任意两个节点之间的有向关系
- `Wire` 成为 Binding 的一个子类型（`binding.type === 'data-flow'`）
- 其他关系（group membership、subgraph port mapping等）走同一机制
- 绑定关系存储在独立的 Table 中，不嵌入节点数据

### 方案

```ts
// 通用绑定
type Binding = {
  id: string;
  type: 'data-flow' | 'group-child' | 'subgraph-boundary' | string;
  source_id: string;       // 源节点 ID
  source_handle: string;   // 源端口/句柄标识
  target_id: string;
  target_handle: string;
  // data-flow 绑定时，source_handle/target_handle 是 port_id
  // group-child 绑定时，source_handle = 'parent', target_handle = 'child'
  meta?: Record<string, unknown>;
};
```

迁移路径：

1. 新增 `Store.bindings: Table<Binding>`
2. `Wire` 保留作为向后兼容的类型别名/工厂
3. 渲染层 `render_wires.ts` 改为从 `bindings` 表读取 `type === 'data-flow'` 的绑定
4. GroupNode 从 `custom_data.children` 改为走 `type === 'group-child'` binding
5. 逐步废弃 Wire 类型

### 影响范围

- `src/core/types.ts` — 新增 `Binding` 类型
- `src/runtime/store.ts` — 新增 bindings 表
- `src/runtime/render_wires.ts` — 读取源改为 bindings 表
- `src/core/wire_ops.ts` — 迁移为 binding_ops
- `src/core/interactions.ts` — connect_wire 改为创建 binding
- `src/nodes/group.ts` — children 管理改为 binding 操作


---

## Checklist 总览

> 每个主题下细分子任务。完成后 `[x]` 标记。

### 阶段 1：Camera 系统增强

- [ ] 新增 `src/runtime/camera.ts` — CameraController 类（animateTo + rAF）
- [x] 内置 easing 函数（easeInOutCubic, easeOutQuint, linear）
- [ ] `zoomToRect()` / `zoomToSelection()` / `fitToView()` / `centerOnPoint()` 通用方法
- [ ] `controls.ts` 改用 CameraController（zoom_in/out/reset/fit）
- [ ] `easel.camera` 对外暴露

### 阶段 2：Store 抽象

- [ ] `Table<T>` 类 — 基于 `shallowRef<Record<string, T>>`，支持 get/put/list/delete/has
- [ ] `Store` 类 — 聚合 Table，支持 transact() 批量事务
- [ ] 序列化自动遍历全部表（取代手写 serialize_state）
- [ ] 全部读取路径迁移：`easel.state.value.nodes[id]` → `easel.store.nodes.get(id)`
- [ ] 渲染层（render.ts / render_wires.ts）适配新 Store API
- [ ] 废弃 `src/core/state.ts` 或整合为 Store 的工厂函数

### 阶段 2b：事件钩子 (Side Effects)

- [ ] `Store.onBeforeChange(table, handler)` — 返回 false 阻止变更，可修改 payload
- [ ] `Store.onAfterChange(table, handler)` — 级联反应
- [x] handler 注册返回取消函数
- [ ] 迁移 `with_guidelines` 到 store hook
- [x] 节点删除自动清理关联 wire（通过 on_before_change 实现）
- [ ] 删除 `src/runtime/easel.ts` 中的 `with_guidelines` 包装

### 阶段 3：Binding 关系系统

- [ ] 新增 `Binding` 类型（id, type, source_id, source_handle, target_id, target_handle, meta?）
- [ ] `Store.bindings: Table<Binding>`
- [ ] `Wire` 保留作为 `Binding` 的工厂别名（`createDataFlowBinding(...)`）
- [ ] `render_wires.ts` 从 bindings 表读取 `type === 'data-flow'`
- [ ] GroupNode children 管理迁移到 `type === 'group-child'` 的 binding
- [ ] 废弃直接 `Wire` 类型

### 阶段 4：工具切换 (Tool System)

- [ ] `Tool` 类型定义 — onPointerDown/Move/Up/Wheel + onEnter/Exit
- [ ] `State.active_tool: string` 字段
- [ ] `ToolManager` — 注册/激活/事件路由
- [ ] 拆分 `interactions.ts` 为独立 Tool 文件（SelectTool / HandTool / WireTool）
- [ ] `Interaction` union type 保留为工具的 private state
- [ ] 插件注册自定义工具的 API
- [ ] 上下文菜单添加工具切换项

### 阶段 5：收尾

- [ ] 清理废弃 API（旧 Wire 类型、with_guidelines、serialize_state）
- [ ] 外部接口文档同步
- [ ] 性能回归测试（渲染 + 交互 + 执行引擎）

---


## 4. Camera 系统增强

### 现状

```ts
Camera = { position: Vec2, zoom: number };
```

- setCamera 是瞬时的——调用 dispatch 直接替换 position/zoom
- 无动画过渡
- 视口无边界约束
- `fit-to-view`、`zoom-to-rect` 在 controls plugin 里手写

### 目标

- Camera 支持动画：`animateTo(target, { duration, easing })`
- 通用的 `zoomToRect(rect, padding)` 方法
- 平滑的 `zoomToSelection()`、`fitToView()`
- 约束系统：zoom 范围、边界限制

### 方案

在 Store 外增加一个 CameraController：

```ts
// easing 函数类型
type EasingFn = (t: number) => number;

const EASING = {
  easeInOutCubic: (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2,
  easeOutQuint: (t: number) => 1 - (1 - t) ** 5,
  linear: (t: number) => t,
};

class CameraController {
  private store: Store;
  private anim_frame: number | null = null;

  // 即时设置
  set(pos: Vec2, zoom: number): void;

  // 动画过渡
  animateTo(target: { position?: Vec2; zoom?: number }, opts?: {
    duration?: number;        // ms, 默认 300
    easing?: EasingFn;
    onComplete?: () => void;
  }): void;

  // 实用方法
  zoomToRect(rect: { x: number; y: number; w: number; h: number }, padding?: number): void;
  zoomToSelection(): void;
  fitToView(): void;
  centerOnPoint(point: Vec2): void;

  // 停止当前动画
  cancel(): void;

  get is_animating(): boolean;
}
```

Camera 数据仍存在 Store 里（`store.camera`），CameraController 只是操作 Store 的封装。动画通过 requestAnimationFrame 逐帧更新 position/zoom。

### 影响范围

- 新增 `src/runtime/camera.ts` — CameraController
- `src/plugins/controls.ts` — do_zoom_in/out/reset/fit 改用 CameraController
- `src/core/interactions.ts` — wheel_zoom 和 panning 保持直接写 Store（不需要动画），但视觉反馈不受影响
- `src/runtime/easel.ts` — 暴露 `easel.camera: CameraController`


---

## Checklist 总览

> 每个主题下细分子任务。完成后 `[x]` 标记。

### 阶段 1：Camera 系统增强

- [ ] 新增 `src/runtime/camera.ts` — CameraController 类（animateTo + rAF）
- [x] 内置 easing 函数（easeInOutCubic, easeOutQuint, linear）
- [ ] `zoomToRect()` / `zoomToSelection()` / `fitToView()` / `centerOnPoint()` 通用方法
- [ ] `controls.ts` 改用 CameraController（zoom_in/out/reset/fit）
- [ ] `easel.camera` 对外暴露

### 阶段 2：Store 抽象

- [ ] `Table<T>` 类 — 基于 `shallowRef<Record<string, T>>`，支持 get/put/list/delete/has
- [ ] `Store` 类 — 聚合 Table，支持 transact() 批量事务
- [ ] 序列化自动遍历全部表（取代手写 serialize_state）
- [ ] 全部读取路径迁移：`easel.state.value.nodes[id]` → `easel.store.nodes.get(id)`
- [ ] 渲染层（render.ts / render_wires.ts）适配新 Store API
- [ ] 废弃 `src/core/state.ts` 或整合为 Store 的工厂函数

### 阶段 2b：事件钩子 (Side Effects)

- [ ] `Store.onBeforeChange(table, handler)` — 返回 false 阻止变更，可修改 payload
- [ ] `Store.onAfterChange(table, handler)` — 级联反应
- [x] handler 注册返回取消函数
- [ ] 迁移 `with_guidelines` 到 store hook
- [x] 节点删除自动清理关联 wire（通过 on_before_change 实现）
- [ ] 删除 `src/runtime/easel.ts` 中的 `with_guidelines` 包装

### 阶段 3：Binding 关系系统

- [ ] 新增 `Binding` 类型（id, type, source_id, source_handle, target_id, target_handle, meta?）
- [ ] `Store.bindings: Table<Binding>`
- [ ] `Wire` 保留作为 `Binding` 的工厂别名（`createDataFlowBinding(...)`）
- [ ] `render_wires.ts` 从 bindings 表读取 `type === 'data-flow'`
- [ ] GroupNode children 管理迁移到 `type === 'group-child'` 的 binding
- [ ] 废弃直接 `Wire` 类型

### 阶段 4：工具切换 (Tool System)

- [ ] `Tool` 类型定义 — onPointerDown/Move/Up/Wheel + onEnter/Exit
- [ ] `State.active_tool: string` 字段
- [ ] `ToolManager` — 注册/激活/事件路由
- [ ] 拆分 `interactions.ts` 为独立 Tool 文件（SelectTool / HandTool / WireTool）
- [ ] `Interaction` union type 保留为工具的 private state
- [ ] 插件注册自定义工具的 API
- [ ] 上下文菜单添加工具切换项

### 阶段 5：收尾

- [ ] 清理废弃 API（旧 Wire 类型、with_guidelines、serialize_state）
- [ ] 外部接口文档同步
- [ ] 性能回归测试（渲染 + 交互 + 执行引擎）

---


## 5. 工具切换 (Tool System)

### 现状

所有交互逻辑集中在：

```
src/core/interactions.ts
  pointer_down → 按优先级链分发（wiring > resize > drag > select/pan）
  handlers_move → mode -> handler 映射表
  pointer_up → mode -> handler 映射表
```

问题是：
- 加新交互模式（hand tool、eraser、add-node）必须改 interactions.ts
- 模式间有隐式耦合——`Interaction` union type 包含全部 case
- 工具切换靠 dispatch 替换 state.interaction，不够显式
- 没有 enter/exit 生命周——切换工具时无法做清理

### 目标

- **Tool 接口**：每个工具是一个独立模块，定义自己的事件处理
- **显式切换**：`easel.tools.activate('select')` — 当前工具收到 `onExit()`，新工具 `onEnter()`
- **无 class 继承**：延续 easel 的函数式风格，Tool = 一组 handler 函数
- **插件可注册自定义工具**

### 方案

```ts
// 工具定义——纯函数接口，无 class
type Tool = {
  id: string;
  label: string;
  icon?: string;
  cursor?: string;                // 切换工具时自动更新 cursor
  onPointerDown?: (ctx: ToolContext, event: PointerEventParams) => ToolResult;
  onPointerMove?: (ctx: ToolContext, event: PointerEventParams) => ToolResult;
  onPointerUp?: (ctx: ToolContext, event?: PointerEventParams) => ToolResult;
  onWheel?: (ctx: ToolContext, event: WheelEventParams) => ToolResult;
  onEnter?: (ctx: ToolContext) => void;    // 工具被激活时的初始化
  onExit?: (ctx: ToolContext) => void;     // 工具被停用时清理
};

type ToolResult = {
  state: State;                   // 新 state（纯函数约束）
  transition?: string;            // 可选：切换到另一个工具
};

type ToolContext = {
  readonly state: State;
  readonly store: Store;
  readonly camera: CameraController;
  dispatch: (state: State) => void;
};
```

State 增加 `active_tool` 字段：

```ts
type State = {
  active_tool: string;            // 当前工具 ID，默认 'select'
  // ... 其余字段不变
};
```

当前 `Interaction` union type 仍然保留——它是工具的"子状态"，不是工具切换的替代品。

内置工具：
- `select` — 当前 idle/dragging/box_selecting/resizing 的合并
- `hand` — panning 模式 + grab cursor
- `wire` — wiring 模式
- 未来：`add-text`、`eraser`、`note` 等

迁移路径：
1. 拆 `interactions.ts` 中的 handler 到各 Tool 模块
2. 保留 `Interaction` 类型作为工具的 private state
3. `pointer_down/move/up` 事件转发到当前 active tool
4. 插件可注册自定义工具到 ToolRegistry

### 影响范围

- 新增 `src/core/tool.ts` — Tool 类型定义
- 新增 `src/core/tools/` — 各工具独立文件
- 新增 `src/runtime/tool_manager.ts` — 工具注册/切换/事件分发
- `src/core/interactions.ts` — 拆分为 SelectTool + HandTool + WireTool
- `src/core/types.ts` — State 加 `active_tool` 字段
- `src/runtime/easel.ts` — 暴露 `easel.tools: ToolManager`
- `src/runtime/events.ts` — 事件改为路由到 ToolManager
- `src/plugins/context_menu/` — 工具切换菜单项


---

## Checklist 总览

> 每个主题下细分子任务。完成后 `[x]` 标记。

### 阶段 1：Camera 系统增强

- [ ] 新增 `src/runtime/camera.ts` — CameraController 类（animateTo + rAF）
- [x] 内置 easing 函数（easeInOutCubic, easeOutQuint, linear）
- [ ] `zoomToRect()` / `zoomToSelection()` / `fitToView()` / `centerOnPoint()` 通用方法
- [ ] `controls.ts` 改用 CameraController（zoom_in/out/reset/fit）
- [ ] `easel.camera` 对外暴露

### 阶段 2：Store 抽象

- [ ] `Table<T>` 类 — 基于 `shallowRef<Record<string, T>>`，支持 get/put/list/delete/has
- [ ] `Store` 类 — 聚合 Table，支持 transact() 批量事务
- [ ] 序列化自动遍历全部表（取代手写 serialize_state）
- [ ] 全部读取路径迁移：`easel.state.value.nodes[id]` → `easel.store.nodes.get(id)`
- [ ] 渲染层（render.ts / render_wires.ts）适配新 Store API
- [ ] 废弃 `src/core/state.ts` 或整合为 Store 的工厂函数

### 阶段 2b：事件钩子 (Side Effects)

- [ ] `Store.onBeforeChange(table, handler)` — 返回 false 阻止变更，可修改 payload
- [ ] `Store.onAfterChange(table, handler)` — 级联反应
- [x] handler 注册返回取消函数
- [ ] 迁移 `with_guidelines` 到 store hook
- [x] 节点删除自动清理关联 wire（通过 on_before_change 实现）
- [ ] 删除 `src/runtime/easel.ts` 中的 `with_guidelines` 包装

### 阶段 3：Binding 关系系统

- [ ] 新增 `Binding` 类型（id, type, source_id, source_handle, target_id, target_handle, meta?）
- [ ] `Store.bindings: Table<Binding>`
- [ ] `Wire` 保留作为 `Binding` 的工厂别名（`createDataFlowBinding(...)`）
- [ ] `render_wires.ts` 从 bindings 表读取 `type === 'data-flow'`
- [ ] GroupNode children 管理迁移到 `type === 'group-child'` 的 binding
- [ ] 废弃直接 `Wire` 类型

### 阶段 4：工具切换 (Tool System)

- [ ] `Tool` 类型定义 — onPointerDown/Move/Up/Wheel + onEnter/Exit
- [ ] `State.active_tool: string` 字段
- [ ] `ToolManager` — 注册/激活/事件路由
- [ ] 拆分 `interactions.ts` 为独立 Tool 文件（SelectTool / HandTool / WireTool）
- [ ] `Interaction` union type 保留为工具的 private state
- [ ] 插件注册自定义工具的 API
- [ ] 上下文菜单添加工具切换项

### 阶段 5：收尾

- [ ] 清理废弃 API（旧 Wire 类型、with_guidelines、serialize_state）
- [ ] 外部接口文档同步
- [ ] 性能回归测试（渲染 + 交互 + 执行引擎）

---


## 6. 实现顺序

```
阶段 1：基础设施（不破坏现有 API）
├── CameraController
│   └── 新增 src/runtime/camera.ts
│   └── controls.ts 改用 CameraController
│   └── 无架构破坏，纯增量

阶段 2：Store 改造（涉及核心重构）
├── Table<T> + Store 类
│   └── 重写 src/runtime/store.ts
│   └── 兼容旧 dispatch API
│   └── 全部读取路径迁移
├── Side Effects（在 Store 之上加）
│   └── 新增 onBeforeChange / onAfterChange
│   └── 迁移 guidelines 到 hook
│   └── 删除 with_guidelines

阶段 3：新数据模型
├── Binding 系统
│   └── 新增 Binding 类型
│   └── Wire → type='data-flow' binding
│   └── Group 改用 group-child binding
│   └── 废弃 Wire 类型

阶段 4：交互重构
├── Tool System
│   └── 定义 Tool 接口
│   └── 拆分 interactions.ts
│   └── ToolManager 事件路由
│   └── 插件工具注册 API

阶段 5：收尾
├── 清理 deprecated API
├── 更新外部接口文档
├── 性能回归测试
```

## 说明

- 这个计划不是一次大重写——每个阶段保持向后兼容，可增量上线。
- 核心原则不变：core/ 层 pure function，runtime/ 层响应式桥接。
- 对标 tldraw 但不照搬——每个方案优先 easel 的节点编辑器场景。