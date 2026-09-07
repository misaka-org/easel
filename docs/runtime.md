# 运行时层 (Runtime)

响应式桥接层，连接纯函数核心与 DOM/SVG 渲染。

## 目录结构

```
src/runtime/
├── easel.ts          # Easel 主类
├── registry.ts       # 节点类型注册表
├── store.ts          # reactive store (shallowRef + dispatch)
├── document_controller.ts # GraphDocument/GraphSession 薄适配层
├── document_bridge.ts # current-scope 到 legacy projection
├── document_boundary_editor.ts # I/O rail 拖拽翻译
├── document_boundary_rail.ts # rail 尺寸/端点纯常量
├── events.ts         # 事件绑定与转发
├── render.ts         # 节点 DOM 渲染与生命周期
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
- `project_document_bridge_view(view)` 是纯投影函数，不修改输入。当前 scope 为 `subgraph`（或已有 input/output slots）时，它按 ComfyUI 编辑子图的视觉概念始终合成左右 view-only I/O 轨：左侧用 `subgraph_input`，右侧用 `subgraph_output`，节点 `custom_data` 带 `boundary_direction`、`scope_graph_id` 与 `view_only` 元数据。
- I/O 轨每侧末端都有稳定 add port（`__easel_boundary_add__`）；Input 轨暴露 output add port，Output 轨暴露 input add port。真实 slot 按 scope 的 `input_slots` / `output_slots` 投影，已 mapping 的 slot 基于 `boundary_bindings` 生成 view-only 连线。proxy 宽度、header/row 间距和 dot 端点由 `src/runtime/document_boundary_rail.ts` 的纯常量/函数统一，供 bridge、node DOM 与 wire 渲染共用。
- I/O 轨是 legacy view 层合成 UI，不是 boundary stub，也不是可写回的 GraphDocument 节点；`view_only_*` 与 `custom_data` 用于区分这些代理。
- 只有 `custom_data.view_only === true` 时 `subgraph_input` / `subgraph_output` 才渲染为 `easel-boundary-rail`（配合 `easel-boundary-input` / `easel-boundary-output`）；没有 `view_only` 的旧式细线 stub 渲染保持向后兼容。rail 自身（header 与空白主体）可被 select tool hit test 并作为普通节点拖动；`.port` 仍保持 `pointer-events: auto`，由 wire plugin capture 处理连线，不会变成拖动起点。core box-select 继续排除 view-only rail。
- `sync_document_controller_to_legacy(easel, controller)` 清空旧 `store.nodes` 与 wire bindings 后写入当前投影，并用 `store.transact` 包装旧节点更新。同步前会先读取 legacy store 中当前 scope 的 rail position，并把同一 scope 的拖动后坐标作为 layout override 写回；因此 controller 变化、scope 重进或 boundary edit 触发的 resync 不会把用户已调整的 rail 拉回自动布局，也不会把 rail 写入 `GraphDocument.nodes`。rail 位置保留在 bridge 的 legacy store / 投影 layout override 中，不做 reload 持久化。
- `project_node` 会把 document node 的 `muted`、`pinned`、`locked` 一并复制到 legacy `GraphNode`；这些字段不放在 `custom_data`，因此 controller 或 bridge 每次 resync 都不会丢状态。view-only boundary rail 不携带这些字段，也不会显示 mute/pin/lock 状态或提供对应操作。
- `mount_document_bridge(easel, controller)` 用 `@vue/reactivity` 的 `effect` 监听 controller session 变化并自动同步，返回 stop 函数；挂载期间会维护当前 session 的 per-scope rail layout map，scope 切出再进入同一 graph 时会复用该 map。切换 scene 时应卸载。
- `document_boundary_editor.ts` 提供无 DOM 的纯翻译/提交逻辑：Input 轨 add 到内部 input 会创建新 input slot，内部 output 到 Output 轨 add 会创建新 output slot；已有轨 slot 与新内部端口相连则调用 `set_graph_boundary_mapping` 重映射。`diff_document_boundary_wire_changes` 对 pointer gesture 前后的 wire 集合做 diff：新增 binding 翻译为 add/remap，被删除的 view-only binding 在没有同方向同 slot 替代时翻译为 `remove_graph_boundary`；同一 slot 先删后连会被识别为 remap，不会先删 slot。`mount_document_boundary_editor(easel, controller)` 用 window capture pointerdown 保存 scope/wire 基线，pointerup 后 commit 新增或 removal，并把结果同步到 GraphDocument。removal commit 传 `{ cascade_host_bindings: true }`，因此默认边界即使 host port 在父图被使用也会同步删除父图 binding 后移除 rail mapping；只有真正其它 commit 失败时才调用 `sync_document_controller_to_legacy` 恢复 legacy 与 controller 的一致性。

```ts
const stop = mount_document_bridge(easel, controller);
const stop_editor = mount_document_boundary_editor(easel, controller);
// 切换 scene 前卸载
stop_editor();
stop();
```

playground 的 `Document Subgraph` scene 基于 `DocumentController` + `mount_document_bridge` + `mount_document_boundary_editor` 提供 GraphDocument scope 进入/退出与 I/O 轨拖拽检查。playground UI 文案支持 en/zh，默认按浏览器语言检测（`zh*` -> zh，其余 -> en）；顶部 Language 控件可切 Auto/English/中文，用户偏好保存在 `localStorage`（key：`easel_playground_locale`）。切语言只刷新静态 DOM 与动态 UI 文案，不重建 document scene，因此已导入的 GraphDocument 不会被清空。scene loader 现在接收 `{ document?, auto_enter? }`：不传 `document` 时使用内置 fixture 并保持自动进入 `host_subgraph` 的旧行为；传入任意 GraphDocument 时默认从该 document 的 root 开始，只有显式传 `auto_enter` 才会进入指定 host，不再假设 host id。主 playground 已支持 `.easel.json` 导入/导出：导出通过 `DocumentController.serialize({ pretty: true })` 生成纯 GraphDocument JSON，导入则 parse/validate 成功后直接以 root 替换当前 document scene，可再通过双击/选中 Enter/Exit 操作 scope。child 示例包含两个内部节点、内部 binding 与空闲输入/输出端口，把 Add 拖到空闲端口会写回 scope slot 与 `boundary_bindings`，把已 mapping wire 拖离则按 gesture diff 写回 remap/removal。画布内 breadcrumb 显示当前 path，child 提供 `Exit / Up` 按钮与 Escape 退出。UI 生命周期随 scene stop 清理。

## 渲染

### 节点 (DOM)

- 每个节点是 `position: absolute` 的 div
- CSS transform 响应 camera（translate + scale）
- `ResizeObserver` 监听 DOM 尺寸同步回 state
- 视口剔除：超出视口的节点 `display: none` + effect pause
- LOD：zoom < 0.4 时加 `lod-min` 类隐藏 body
- `render_nodes` 会把 `muted` / `pinned` / `locked` 同步成 `data-muted` / `data-pinned` / `data-locked`；默认 theme 中 muted 弱化节点，pinned 显示高亮边框与 `PIN` 标记，locked 显示锁环边框与 `LOCK` 标记。view-only rail 不携带这些字段，不会被误标。
- playground 右键菜单通过 `toggle_node_flag_for_context` 路由：document scene 中目标真实节点存在于 `DocumentController.view.nodes` 时用 `controller.update_node` 写入 GraphDocument；非 document scene 或不存在于 controller view 时用 legacy dispatch + `toggle_node_flag` 更新 State。真实内容节点按顺序提供 Mute、Pin、Lock（中文本地化为屏蔽、固定、锁定）。

### 连线 (SVG)

- 叠加 SVG 层，`pointer-events: none`
- 贝塞尔曲线，按 `value_type` 着色（text=蓝、image=绿、video=紫、audio=黄、number=青）
- 虚线动画（流动效果）
- 交互中的连线实时更新
- source 或 target 节点 locked 时，SVG wire 同步 `data-locked="true"`，主题加粗/发光；`src/plugins/wire/lock.ts` 判定 binding locked，wire capture、wire tool 与 canvas “Clear Wires” 都拒绝断开、替换或清空这类 binding，删除节点等显式结构操作不受限制

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

easel.set_theme({ canvas_bg: '#fff', text_color: '#000' });
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
