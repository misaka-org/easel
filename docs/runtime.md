# 运行时层 (Runtime)

响应式桥接层，连接纯函数核心与 DOM/SVG 渲染。

## 目录结构

```
src/runtime/
├── easel.ts          # Easel 主类
├── registry.ts       # 节点类型注册表
├── store.ts          # reactive store (shallowRef + dispatch)
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