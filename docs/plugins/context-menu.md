# Context Menu 插件

右键菜单，基于 Provider 模式的可扩展实现。

## 注册 Provider

```ts
const service = easel.plugin_data.context_menu!;

service.register({
  id: "my_provider",
  priority: 0,  // 越高越靠前
  get_items: (ctx: ContextMenuContext): readonly ContextMenuItem[] => [
    {
      id: "my_action",
      label: "My Action",
      icon: "<svg>...</svg>",
      action: () => { /* ... */ },
    },
  ],
});
```

## ContextMenuContext

```ts
type ContextMenuContext = {
  node_id?: string;         // 右键目标的节点 id
  node_type?: string;       // 节点类型
  screen_pos: Vec2;         // 屏幕坐标（相对 container）
  world_pos: Vec2;          // 世界坐标（含 camera 偏移）
  target?: HTMLElement;     // 原始元素
  container: HTMLElement;   // 画布容器
};
```

## ContextMenuItem

```ts
type ContextMenuItem = {
  id: string;
  label: string;
  icon?: string;            // HTML SVG 字符串
  kind?: "item" | "label";  // label 为不可交互提示
  action?: () => void;
  submenu?: ContextMenuItem[];
  disabled?: boolean;
  group?: string;           // 组间自动插入分隔线
};
```

## 内置 Provider

| Provider | Priority | 功能 |
|---|---|---|
| add_node_provider | 10 | 添加节点子菜单（按 namespace 分组） |
| node_ops_provider | 20 | 删除、复制节点 |
| controls_provider | 30 | 相机控制 |
| executor_provider | 40 | 执行控制 |
| history_provider | 50 | 撤销/重做 |
| canvas_ops_provider | -10 | 重置相机、清除连线 |
| node_instance_provider | -20 | 节点实例自定义菜单 |

## 按 Namespace 分组

```ts
register_node_ns("image_generation", ["生成", "图像"]);
register_node_ns("text_generation", ["生成", "文本"]);
// 右键菜单 -> 添加节点 -> 生成 -> 图像/文本
```
