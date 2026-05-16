# 架构总览

easel 是一个两层架构的节点画布引擎，核心思想是 **纯函数核心 + 响应式渲染**。

## 分层

```
┌────────────────────────────────────────────────┐
│              运行时层 (Runtime)                   │
│  Easel · Registry · Events · Theme · Rendering  │
│  DOM/SVG/Canvas · 事件绑定 · 插件系统             │
│  用 @vue/reactivity 桥接核心数据到视图             │
├────────────────────────────────────────────────┤
│              核心层 (Core)                       │
│  State · Types · Math · NodeOps · WireOps      │
│  Interactions · Serialization                   │
│  纯 TypeScript · 不可变 · 无依赖 · 纯函数         │
└────────────────────────────────────────────────┘
```

### 核心层

纯函数、不可变数据、无框架依赖。所有操作接收 `State` 返回新 `State`：

```ts
function moveNode(state: State, id: string, delta: Vec2): State
function deleteNodes(state: State, ids: Set<string>): State
function addWire(state: State, wire: Wire): State
```

- 类型用 ADT（Algebraic Data Types），穷举所有 `Interaction` case
- 没有 `null`，用 `fp-ts/Option`
- 状态变换是输入 → 输出，不修改原对象
- 测试就是函数调用，不需要 mock

### 运行时层

用 `@vue/reactivity` 做响应式桥接：

1. **State → View**: `shallowRef` 包住 state，`effect` 自动追踪依赖更新 DOM/SVG
2. **Event → State**: 用户事件调用核心层纯函数，结果写回 `ref`

### 可视化栈

- **节点** → DOM（`position: absolute` div，CSS transform 响应 camera）
- **连线** → SVG 叠加层（贝塞尔曲线，无交互元素）
- **选中/指示器** → Canvas 2D 叠加层（临时 UI，不用 DOM 频繁增删）

## 状态机

函数式状态节点，每个事件处理是纯函数：

```ts
type Interaction =
  | { mode: "idle" }
  | { mode: "dragging"; nodeIds: string[]; startPos: Vec2 }
  | { mode: "wiring"; sourceNodeId: string; sourcePortId: string }
  | { mode: "panning"; startPos: Vec2 }
  | { mode: "boxSelecting"; startPos: Vec2; currentPos: Vec2 }
  | { mode: "resizing"; nodeId: string; startPos: Vec2; startSize: Vec2 };
```

比 tldraw 的 StateNode 类体系轻量，比枚举灵活。

## 依赖

| 层 | 选择 |
|---|---|
| 语言 | TypeScript strict |
| 响应式 | @vue/reactivity |
| 测试 | Vitest |
| 构建 | Vite |
| 函数式工具 | fp-ts |