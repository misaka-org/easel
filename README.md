# easel

可组合的 Web 节点画布引擎 — 纯函数核心 + 响应式渲染层，用于构建 AI 工作流 / ComfyUI 风格的节点编辑器。

## 快速开始

```bash
pnpm install
pnpm dev
```

## 核心思想

```
┌────────────────────────────────┐
│        核心层 (Pure FP)         │
│  ADT 类型 · 纯函数操作 · 不可变  │
│  Option/Result · 无 this/Proxy  │
│  → 接收意图，返回新 state        │
│  → 纯函数测试，无需 mock         │
├────────────────────────────────┤
│     响应式桥接层 (@vue/reactivity)│
│  ref → effect → DOM/SVG/Canvas │
│  事件 → 核心纯函数 → 更新 ref    │
└────────────────────────────────┘
```

两层严格分工：**核心**只做数据变换，**运行时**响应事件、驱动渲染。

## 图模型状态

核心 `GraphDocument` 已加入 first-class subgraph 语义：host node 通过 `nested_graph_id` 引用 scope，scope 边界通过 `boundary_bindings` 映射到内部节点端口，并提供不可变的 `pack_nodes` / `unpack_subgraph`。模型层同时提供 `validate_graph_document` 一致性校验，以及基于 `format_version = 1` 的 `serialize_graph_document` / `deserialize_graph_document` 版本化 JSON 序列化；后续格式迁移按版本 decoder 处理。旧 runtime、plugin 与 executor 仍使用原有 stub/`custom_data.graph` 流程，尚未迁移到这套 GraphDocument 模型，也未调用该校验与序列化器。

## 文档

- [架构总览](./docs/architecture.md) — 分层、渲染策略、设计决策
- [核心层 (Core)](./docs/core.md) — 类型系统、状态管理、交互状态机
- [运行时层 (Runtime)](./docs/runtime.md) — Easel 类、节点注册、事件、主题
- [内置节点](./docs/nodes.md) — DefaultNode、GroupNode、SubgraphNode
- [图执行引擎](./docs/executor.md) — GraphExecutor：拓扑排序、缓存、实时模式
- [图模型 (GraphDocument)](./docs/graph-model.md) — GraphScope/GraphDocument 核心模型、host/boundary 与 pack/unpack 语义、迁移边界
- [React 对接](./docs/react.md) — 用 React 开发自定义节点
- [插件列表](./docs/plugins-list.md) — 插件概览与各插件文档入口

## 插件一览

| 插件                                           | 说明                           |
| ---------------------------------------------- | ------------------------------ |
| [Context Menu](./docs/plugins/context-menu.md) | 右键菜单，可扩展 Provider 模式 |
| [Controls](./docs/plugins/controls.md)         | 缩放/适配/全屏/自动布局        |
| [History](./docs/plugins/history.md)           | 撤销/重做，历史列表面板        |
| [Minimap](./docs/plugins/minimap.md)           | 画布小地图                     |
| [Auto Pan](./docs/plugins/auto-pan.md)         | 边缘自动平移                   |
| [Guidelines](./docs/plugins/guidelines.md)     | 吸附对齐参考线                 |
| [Node Picker](./docs/plugins/node-picker.md)   | 搜索添加节点                   |
| [Executor](./docs/plugins/executor.md)         | 图执行控制栏 + 节点覆盖层      |

## License

ISC
