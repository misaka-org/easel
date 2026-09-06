# 运行时层 (Runtime)

响应式桥接层，连接纯函数核心与 DOM/SVG 渲染。

## 目录结构

```
src/runtime/
├── easel.ts          # Easel 主类
├── registry.ts       # 节点类型注册表
├── store.ts          # reactive store (shallowRef + dispatch)
├── document_controller.ts # GraphDocument/GraphSession 薄适配层
├── events.ts         # 事件绑定与转发
├── render.ts         # 节点 DOM 渲染与生命周期
├── render_wires.ts   # 连线 SVG 渲染
├── theme.ts          # 主题系统 + 全部 CSS
├── frame_effect.ts   # 帧级调度器
├── default_node.ts   # 默认节点渲染器
└── types.ts          # 内部类型
```

## Easel 类

入口点，管理整个画布生命周期：

```ts
const easel = new Easel(container, {
  theme?: Partial<Theme>;
  custom_css?: string;
  initial_state?: State;
  plugins?: EaselPlugin[];
});
```

内部行为：
- 自动创建 Shadow DOM 隔离样式
- 注册内置节点类型（subgraph、group、subgraph_input、subgraph_output）
- 创建响应式 store（shallowRef<State>）
- 渲染节点 DOM 和连线 SVG
- 绑定事件处理

## 节点注册表

```ts
register_node_type("my_node", MyNodeClass, { resizable: false });
register_node_ns("my_node", ["工具", "图片"]);  // 右键菜单分类
register_node_spec("my_node", { inputs: [...], outputs: [...] });

// 创建节点数据（自动合并 spec 中的 ports/widgets/size）
const node = create_node_data("my_node", { position: vec2Create(100, 100) });
```

## DocumentController

`document_controller.ts` 是纯逻辑、无 DOM 的薄 runtime adapter。它用 `shallowRef<GraphSession>` 持有 `GraphSession` 作为唯一权威状态，消费 `GraphDocument` / `GraphSession`，暴露当前 scope 的只读 `DocumentGraphView`、subgraph 导航、节点/连线/边界 CRUD 和序列化入口。它暂不迁移旧 `Easel` / `Store`，也不会替换现有 DOM 渲染或 plugin 的 `State + custom_data.graph` 流程；`document_bridge.ts` 在不改动旧运行时结构的前提下提供当前 scope 到 legacy 的投影，后续仍可作为 playground subgraph scene 和旧 runtime 迁移的基础。

```ts
import * as E from 'fp-ts/Either';

const result = create_document_controller(document);
if (E.isRight(result)) {
  const controller = result.right;
  controller.enter_subgraph(host_node_id);
  controller.add_node(node);
  controller.serialize();
}
```

## DocumentController legacy projection bridge

`document_bridge.ts` 是 DOM-free 的薄桥接层：只把 `DocumentController` 的当前 scope 投影到旧 `Easel` / `Store` / wire plugin，不迁移旧编辑、交互或数据所有权，也不引入新依赖。

- `DocumentBridgeView` 是当前 scope 的 legacy 投影，含 `path`、`graph`、`nodes`、`bindings`、`view_only_node_ids` 与 `view_only_binding_ids`。真实节点去掉 `graph_id`、`nested_graph_id` 等 graph-only 字段，真实 binding 去掉 `graph_id`。
- `project_document_bridge_view(view)` 是纯投影函数，不修改输入。当前 graph scope 有 `input_slots` / `output_slots` 时，它会按 ComfyUI 编辑子图的视觉概念合成 `document_boundary_input` / `document_boundary_output` 两个 view-only 边界代理，以及基于 `boundary_bindings` 的输入/输出 mapping 连线。
- 边界代理是 legacy view 层合成 UI，不是 boundary stub，也不是可写回的 GraphDocument 节点；`view_only_*` 用于区分这些代理。只有 mapping 存在的 slot 才会合成连线，未 mapping 的 port 只显示但断开。
- `sync_document_controller_to_legacy(easel, controller)` 清空旧 `store.nodes` 与 wire bindings 后写入当前投影，并用 `store.transact` 包装旧节点更新。
- `mount_document_bridge(easel, controller)` 用 `@vue/reactivity` 的 `effect` 监听 controller session 变化并自动同步，返回 stop 函数；切换 scene 时应卸载。

```ts
const stop = mount_document_bridge(easel, controller);
// 切换 scene 前卸载
stop();
```

这是单向投影：旧 `Easel` 上的后续编辑仍不会反向写回 `GraphDocument`，旧 runtime 也未接管 GraphDocument 编辑；drag-to-boundary mapping 写回仍是后续工作。

playground 的 `Document Subgraph` scene 基于 `DocumentController` + `mount_document_bridge` 提供 GraphDocument scope 进入/退出检查。scene 的 child 示例包含两个内部节点与内部 binding，进入后能直接看到“输入代理 → 内部节点 → 输出代理”的数据流；画布内 breadcrumb 始终显示 `root` / `root > child` 路径，child 提供 `Exit / Up` 按钮与 Escape 退出，root 提示双击或选中 host 后按 Enter 进入。UI 生命周期随 scene stop 清理。

## 渲染

### 节点 (DOM)

- 每个节点是 `position: absolute` 的 div
- CSS transform 响应 camera（translate + scale）
- `ResizeObserver` 监听 DOM 尺寸同步回 state
- 视口剔除：超出视口的节点 `display: none` + effect pause
- LOD：zoom < 0.4 时加 `lod-min` 类隐藏 body

### 连线 (SVG)

- 叠加 SVG 层，`pointer-events: none`
- 贝塞尔曲线，按 `value_type` 着色（text=蓝、image=绿、video=紫、audio=黄、number=青）
- 虚线动画（流动效果）
- 交互中的连线实时更新

## 主题

```ts
type Theme = {
  canvas_bg: string;
  node_bg: string;
  node_border: string;
  text_color: string;
  wire_color: string;
  primary_color: string;
  // ...
};

easel.set_theme({ canvas_bg: "#fff", text_color: "#000" });
```

内置 `default_theme`（暗色）和 `light_theme`（亮色），CSS 变量驱动。

## 事件系统

- pointerdown/move/up -> 调用 core interactions
- wheel -> zoom（Ctrl）或 pan
- keydown/keyup -> Delete 删除、Ctrl+G 分组
- dblclick -> 发射 `node_dblclick`
- 全部事件通过 EventEmitter3 (`app_events`) 转发给插件

## 帧级调度器

`frame_effect` 是 `effect` 的包装，所有副作用在下帧 `requestAnimationFrame` 批量执行：

```ts
frame_effect(() => {
  // 不会立即执行，下帧统一运行
  renderNodes(state.value);
});
```