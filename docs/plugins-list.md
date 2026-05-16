# 插件系统

easel 插件是接收 `Easel` 实例的函数，hook 到事件和渲染循环中扩展功能。

## 插件签名

```ts
type EaselPlugin = (easel: Easel) => void;
```

插件可以：
- 访问 `easel.state`、`easel.dispatch`、`easel.container`
- 监听 `easel.app_events`（EventEmitter3）
- 操作 `easel.node_instances`
- 在 container 中添加 DOM 元素
- 替换/包装 `easel.dispatch`
- 通过 `(easel as any).context_menu` 注册菜单项

## 使用

```ts
const easel = new Easel(container, {
  plugins: [
    context_menu_plugin,
    minimap_plugin,
    controls_plugin,
    history_plugin,
    auto_pan_plugin,
    node_picker_plugin,
    executor_plugin,
  ],
});
```

## 内置插件

| 插件 | 功能 | 文档 |
|---|---|---|
| context_menu | 右键菜单 | [docs](./plugins/context-menu.md) |
| controls | 缩放、适配、全屏 | [docs](./plugins/controls.md) |
| history | 撤销/重做 | [docs](./plugins/history.md) |
| minimap | 小地图 | [docs](./plugins/minimap.md) |
| auto_pan | 边缘自动平移 | [docs](./plugins/auto-pan.md) |
| with_guidelines | 吸附对齐参考线 | [docs](./plugins/guidelines.md) |
| node_picker | 搜索添加节点 | [docs](./plugins/node-picker.md) |
| executor | 图执行控制栏 | [docs](./plugins/executor.md) |

## 插件协作

- **事件监听**：`easel.app_events.on("state_changed", handler)`
- **context_menu 注册**：通过 `service.register()` 注册菜单项
- **dispatch 包装**：替换 `easel.dispatch` 添加中间件（如 history_plugin）
- 插件添加的 DOM 需通过 `pointerdown stopPropagation` 避免干扰画布