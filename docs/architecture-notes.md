# 自建画布引擎：架构思路

---

这个想法不是 commit，只是一个概念脑暴。

## 问题

tldraw 是好东西，但它的 license 不友好（专有许可，生产要买 key），
所以考虑自己实现一个画布引擎，用于 AI 绘画/ComfyUI 风格的节点编辑器。

## 架构分层

```
┌──────────────────────────────────────────────────┐
│                 核心 (Pure FP)                    │
│                                                   │
│  ADT 类型定义       纯函数操作        不可变数据流  │
│  Option/Result      模式匹配         零副作用      │
│                                                   │
│  → 接收操作意图，返回新 state                       │
│  → 没有 this，没有 Proxy，没有框架概念              │
│  → 单元测试零 mock                                 │
└──────────────┬───────────────────────────────────┘
               │ 响应式桥接
               ▼
┌──────────────────────────────────────────────────┐
│                运行时 (Reactive)                   │
│                                                   │
│  @vue/reactivity                                  │
│  ref → effect → DOM/Canvas                        │
│  事件 → 调用核心纯函数 → 更新 ref                  │
│                                                   │
│  → 只消费核心的纯数据，不修改                       │
│  → effect 自动追踪依赖，只重绘变化的部分             │
└──────────────────────────────────────────────────┘
```

### 核心（Pure FP）

核心不依赖任何框架，就是 TypeScript + 纯函数：

```ts
// 状态是 plain object，函数是纯变换
function moveNode(state: State, id: string, delta: Vec2): State;
function deleteNodes(state: State, ids: Set<string>): State;
function hitTest(state: State, point: Vec2): Option<HitResult>;
```

- 类型用 ADT（Algebraic Data Types），穷举所有 case
- 没有 `null`，用 `Option<T>`
- 错误用 `Either<E, T>`
- 状态变换是输入 → 输出，不修改原对象
- 测试就是函数调函数，不需要 mock

### 运行时（Reactive）

用 `@vue/reactivity` 做粘合层，只干两件事：

1. **状态 → 视图**：`ref` 包住 core state，`effect` 自动响应变化，更新 DOM/Canvas
2. **事件 → 操作**：用户事件触发核心纯函数，结果赋回 `ref`

```ts
const state = ref(initialState);

effect(() => {
  renderAllNodes(container, state.value.nodes);
});

canvas.addEventListener("pointermove", (e) => {
  state.value = moveNode(state.value, selectedId, e.delta);
});
```

运行时只是薄薄一层桥接，核心不感知它的存在。

## 渲染策略

**节点：DOM**

- 每个节点是一个 `position: absolute` 的 div
- 内部塞 input/select/button 等复杂 UI
- 通过 CSS transform 响应 camera（平移/缩放）
- ComfyUI 样式的节点卡片天然适合 DOM

**连线：SVG 或 Canvas 叠加层**

- 只有贝塞尔曲线，无交互元素
- 叠加在 DOM 之上的独立层

**选中/指示器：Canvas 2D**

- 临时 UI，不适合 DOM 频繁增删

## 状态机

函数式状态节点：

```ts
type Interaction =
  | { mode: "idle" }
  | { mode: "dragging"; nodeId: string; offset: Vec2 }
  | { mode: "wiring"; fromPort: PortRef }
  | { mode: "panning"; start: Vec2 }
  | { mode: "boxSelecting"; start: Vec2; current: Vec2 };

// 每个事件处理是纯函数: (state, event) → state
function onPointerMove(state: State, e: PointerEvent): State;
function onPointerUp(state: State, e: PointerEvent): State;
```

比 tldraw 的 StateNode 类体系轻，比枚举灵活。
用函数而非类，每个状态是一个 factory，返回事件处理器。

## @vue/reactivity 的选择

- 做 signal，但不是自写——直接用 Vue 的独立包
- 因为画布场景不需要自造轮子，现成的足够好
- @preact/signals-core 也可，但 @vue/reactivity 在非 React 项目里更自然

## 与 tldraw 的关系

|         | tldraw                           | 我们的方向           |
| ------- | -------------------------------- | -------------------- |
| License | 专有，商用要买                   | 自建，无限制         |
| 渲染    | DOM (shape) + Canvas (indicator) | 同上                 |
| 响应式  | 自写 signal                      | @vue/reactivity      |
| 状态机  | StateNode class 体系             | 函数式状态节点       |
| 数据    | class Editor + Store             | FP 纯函数核心        |
| 场景    | 通用白板                         | AI 绘画 + 节点编辑器 |

## 技术选型

| 层     | 选型              |
| ------ | ----------------- |
| 语言   | TypeScript strict |
| 响应式 | @vue/reactivity   |
| 测试   | Vitest            |
| 构建   | Vite              |
| 协同   | 跳过（以后 yjs）  |

## 一句话总结

纯函数核心算数据，响应式桥接做渲染。
核心是 FP，边界是 Reactive。
