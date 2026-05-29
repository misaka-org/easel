# AGENTS.md — Easel

## 文档

- 项目架构/核心/运行时/节点/执行引擎 -> `docs/*.md`
- 插件文档 -> `docs/plugins/*.md`
- 编码规范（命名风格、TS 配置、代码整洁） -> `docs/coding/*`
- 写代码前必看：`docs/coding/ts.md`（snake_case 命名、2 空格缩进、分号结尾、单引号）

## 架构概要

```
Core (Pure FP)         — 不可变 State、纯函数操作、无框架依赖
Runtime (Reactive)     — @vue/reactivity 桥接，DOM/SVG 渲染，事件系统
Plugins                — (easel) => void，hook 到事件和 dispatch
```

- Core: `src/core/` — types, math, node_ops, wire_ops, interactions, serialization
- Runtime: `src/runtime/` — Easel, registry, store, events, render, theme, default_node
- Plugins: `src/plugins/` — context_menu, history, minimap, controls, auto_pan, node_picker, executor
- Executor: `src/executor/` — GraphExecutor（拓扑排序 + 缓存 + 实时模式）
- Built-in nodes: `src/nodes/` — group, subgraph

## 编码

- 默认使用 ASCII 字符集编写 TS 源码，注释用中文
- 文档、README、MD 文件 -> **UTF-8 无 BOM**
- PowerShell 写文件用 `[System.IO.File]::WriteAllText(path, content, [System.Text.UTF8Encoding]::new($false))`
- 不要用 `Set-Content -Encoding UTF8`（会加 BOM）
- 编码规范参考 `docs/coding/ts.md`
