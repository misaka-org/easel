# 内置节点

## DefaultNode

通用节点渲染器，几乎所有节点类型的基础。

```ts
class DefaultNode extends EaselNode {
  mount(node_data): void    // 创建 DOM：header + body（ports + widgets）
  update(node_data, state): void  // 同步 DOM 状态
  unmount(): void           // 清理 DOM
}
```

特性：
- Header：type-indicator 点击折叠、删除按钮
- 输入端口在左（dot + label），输出端口在右（label + dot）
- Widget：text/number/boolean/color 四种输入，已连接自动 disabled
- 可选 resize handle（右下角）
- 支持 `get_context_menu_items()` 自定义右键菜单

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
    inputs: [{ id: "img", label: "Image", type: "input", value_type: "image" }],
    outputs: [{ id: "out", label: "Output", type: "output" }],
    widgets: [{ id: "model", type: "text", label: "Model", value: "default" }],
    resizable: true,
  };

  async execute(ctx: ExecuteContext): Promise<Record<string, unknown>> {
    return { out: process(ctx.inputs["img"]) };
  }
}
```