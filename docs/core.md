# 核心层 (Core)

纯函数核心，零框架依赖，只做数据变换。

## 目录结构

```
src/core/
├── types.ts           # 核心类型定义
├── state.ts           # 初始状态工厂
├── math.ts            # Vec2 数学运算
├── node_ops.ts        # 节点 CRUD 操作
├── wire_ops.ts        # 连线 CRUD 操作
├── interactions.ts    # 交互状态机
├── serialization.ts   # 序列化/反序列化
└── __tests__/         # 纯函数单元测试
```

## 核心类型

```ts
type GraphNode = {
  id: string;
  type: string;
  position: Vec2;
  size: Vec2;
  title: string;
  inputs: readonly Port[];
  outputs: readonly Port[];
  widgets?: readonly Widget[];
  style_mode?: "default" | "borderless";
  resizable?: boolean;
  collapsed?: boolean;
  custom_data: Record<string, unknown>;
};

type State = {
  nodes: Record<string, GraphNode>;
  wires: Record<string, Wire>;
  camera: Camera;
  interaction: Interaction;
  selected_node_ids: readonly string[];
  modifiers: Modifiers;
};
```

所有类型只读（`readonly`），强制不可变。

## 关键函数

### 节点操作 `node_ops.ts`

```ts
addNode(state, node)          -> State
removeNode(state, id)         -> State  // 自动清理关联连线
moveNode(state, id, delta)    -> State  // 递归移动 group children
moveNodes(state, ids, delta)  -> State
updateNodeData(state, id, updater) -> State
updateWidgetValue(state, id, widget_id, value) -> State
```

### 连线操作 `wire_ops.ts`

```ts
addWire(state, wire)    -> State
removeWire(state, id)   -> State
clearWires(state)       -> State
```

### 状态机 `interactions.ts`

三个核心事件处理函数：

```ts
pointerDown(state, event)   -> State
pointerMove(state, event)   -> State
pointerUp(state, event)     -> State
wheelZoom(state, event)     -> State
```

自动检测顺序：port 连线 > resize > 选中/拖拽 > 框选/平移。

### 数学工具 `math.ts`

```ts
type Vec2 = { readonly x: number; readonly y: number };

vec2Create(x, y)               -> Vec2
vec2Add(a, b) / vec2Sub(a, b)  -> Vec2
vec2Scale(v, s)                -> Vec2
aabbIntersect(pos1, size1, pos2, size2) -> boolean
aabbContains(pos1, size1, pos2, size2)  -> boolean
```

### 序列化 `serialization.ts`

```ts
serializeState(state)   -> string    // JSON，过滤 interaction
deserializeState(json)  -> State     // 解析并填充默认值
```