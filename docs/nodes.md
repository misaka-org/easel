# 内置节点

## DefaultNode

通用节点渲染器，几乎所有节点类型的基础。

```ts
class DefaultNode extends EaselNode {
  mount(node_data): void; // 创建 DOM：header + body（ports + widgets）
  update(node_data, state): void; // 同步 DOM 状态
  unmount(): void; // 清理 DOM
}
```

特性：

- Header：type-indicator 点击折叠、删除按钮
- 输入端口在左（dot + label），输出端口在右（label + dot）
- Widget：text/number/boolean/color 四种输入，已连接自动 disabled
- 可选 resize handle（右下角）
- 支持 `get_context_menu_items()` 自定义右键菜单

## 节点状态标记

`GraphNode` 支持三个可选持久化 boolean：`muted`、`pinned` 与 `locked`。playground document scene 会在 `GraphDocument.nodes` 中写入这些字段，并随 `.easel.json` 导出/导入；legacy scene 通过 `set_node_flag` / `toggle_node_flag` 操作普通 `State.nodes`。

- `muted`：与 bypass 同语义。执行引擎遇到 `muted === true` 会跳过该节点的 `execute()`、不写入普通执行缓存，并按输入端口 id 或同序端口把可直通输入复制到输出；没有可直通输入时输出为空。核心映射规则是 `muted_node_outputs()`，`GraphExecutor` 与 legacy `execute_subgraph()` 共用。节点 DOM 加 `data-muted="true"` 并弱化显示，只是把执行态同步到视觉。
- `pinned`：阻止 legacy `move_node` / `move_nodes` 移动该节点，因此 select tool 拖拽会自动尊重 pin。节点 DOM 会加 `data-pinned="true"`，默认样式给节点加高亮边框与 `PIN` 标题后缀；调整尺寸等其它操作不受影响。
- `locked`：不固定节点位置，只锁接线。当某条 binding 的 source 或 target 节点 `locked === true` 时，该 binding 视为 locked：UI 不允许断开、不允许替换 target input 上的旧 binding，也不允许从 canvas “Clear Wires” 清空它。删除 locked 节点、subgraph collapse/group 等显式结构操作不受 lock 拦截；lock 只防 UI 的断开/替换已连接线/清空连线。locked 节点 DOM 加 `data-locked="true"`，其 `.port` 与关联 SVG wire 也会带 locked 标记，默认样式显示锁环、发光边框与 `LOCK` 标题后缀。
- view-only boundary rail（`custom_data.view_only === true`）以及旧式 `subgraph_input` / `subgraph_output` stub 不属于真实内容节点，不提供 mute/pin/lock 菜单项，也不会被当作可 mute/pin/lock 的真实节点。

## GroupNode

节点分组容器，自动收集拖入的节点。

```ts
class GroupNode extends EaselNode {
  // AABB 碰撞检测自动收容/释放节点
  // 双击标题编辑
  // 递归处理嵌套 group
}
```

- Ctrl+G 选中节点创建组
- 半透明背景 + HSL 色相区分
- 支持命名空间和分组拖拽

## SubgraphNode

子图节点，包含内部图，支持嵌套浏览和透明执行。

- `custom_data.graph` 存储内部图（nodes + wires）
- Header 右侧进入按钮，发射 `enter_subgraph` 事件
- 配合 subgraph_input/output stub 暴露端口

## SubgraphInputNode / SubgraphOutputNode

子图边界桩节点。

- **SubgraphInputNode**：子图入端口，右边框 + port 列表
- **SubgraphOutputNode**：子图出端口，左边框 + port 列表
- 无背景、无 header、不可调整大小、不可删除

## 自定义节点

继承 DefaultNode 并定义 `static node_spec`：

```ts
class MyNode extends DefaultNode {
  static node_spec: NodeSpec = {
    inputs: [{ id: 'img', label: 'Image', type: 'input', value_type: 'image' }],
    outputs: [{ id: 'out', label: 'Output', type: 'output' }],
    widgets: [{ id: 'model', type: 'text', label: 'Model', value: 'default' }],
    resizable: true,
  };

  async execute(ctx: ExecuteContext): Promise<Record<string, unknown>> {
    return { out: process(ctx.inputs['img']) };
  }
}
```
