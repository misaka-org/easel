# 图模型 (GraphDocument / GraphScope)

## 目标

`src/core/graph` 是 Easel 面向 ComfyUI 类工作流的图数据基础。它把“文档中的整张图”建模为不可变 plain object，为后续运行时、渲染器和执行器提供统一的数据契约。

模型只处理图结构数据：

- 图作用域层级（root / subgraph）
- 全局唯一节点表
- 同一 graph 内的 binding 数据流
- 原子且可测试的纯操作

## 核心类型

类型定义在 `src/core/graph/types.ts`。

```ts
type GraphDocument = {
  format_version: number;
  root_graph_id: GraphId;
  graphs: Readonly<Record<GraphId, GraphScope>>;
  nodes: Readonly<Record<NodeId, GraphNodeRecord>>;
  bindings: Readonly<Record<BindingId, GraphBindingRecord>>;
};
```

- `GraphId`、`NodeId`、`BindingId` 是 string alias，便于后续收紧为 branded type。
- `GraphScope` 表示一个可进入的画布 scope：root 或 subgraph。
- `GraphNodeRecord` 是现有 `GraphNode` 与 `graph_id` 的交集；节点 ID 在整份 document 内唯一。
- `GraphBindingRecord` 复用现有 binding 字段命名：`source_id`、`source_handle`、`target_id`、`target_handle`，方便后续迁移连线逻辑。

## Scope 与 Subgraph 定位

`GraphScope` 不是运行时里的 DOM 页面，也不是旧的 `subgraph_input` / `subgraph_output` stub node。

- `kind: 'root'` 是 document 的根作用域，由 `create_empty_graph_document()` 创建，且不能删除。
- `kind: 'subgraph'` 通过 `parent_graph_id` 挂在现有 graph 下。
- `input_slots` / `output_slots` 是 graph 边界的 first-class 数据定义，不生成虚拟节点；节点与端口仍是 document 中的独立数据。
- 当前模型不强制建立 “scope 实例 node” 映射。真正把 subgraph scope 变成可拖拽节点、在父级画布内实例化，属于后续运行时迁移范围。

## 纯操作

操作定义在 `src/core/graph/document.ts`，输入 document 后返回新 document，不修改原参数。

```ts
create_empty_graph_document(): GraphDocument
get_graph(document, graph_id): Option<GraphScope>
get_node(document, node_id): Option<GraphNodeRecord>
get_binding(document, binding_id): Option<GraphBindingRecord>
add_graph(document, graph): Either<GraphDocumentError, GraphDocument>
remove_graph(document, graph_id): Either<GraphDocumentError, GraphDocument>
add_node(document, node): Either<GraphDocumentError, GraphDocument>
add_node(document, graph_id, node): Either<GraphDocumentError, GraphDocument>
remove_node(document, node_id): Either<GraphDocumentError, GraphDocument>
move_node_to_graph(document, node_id, target_graph_id): Either<GraphDocumentError, GraphDocument>
add_binding(document, binding): Either<GraphDocumentError, GraphDocument>
remove_binding(document, binding_id): Either<GraphDocumentError, GraphDocument>
```

查找函数使用 `fp-ts/Option`。会失败的变更使用 `fp-ts/Either` 和可识别错误 union，不抛异常、不以 `null` / `undefined` 表达错误。

当前约束：

- 只允许删除空 subgraph：无节点、无 binding、无子 graph 引用。
- 节点 ID 全局唯一，binding ID 同样在整份 document 内唯一。
- binding 两端节点必须存在、必须在同一 graph，且 source handle 是 source node 的 output，target handle 是 target node 的 input。
- 删除或移动节点会同步清理当前 graph 内引用该节点的 binding，避免留下跨 graph 的非法连接。
- 移动节点保留原 `node.id`，只更新 `graph_id`。

## 与现有 runtime 的关系

以下内容仍使用现有 `State`、Store、plugin 和 DOM/SVG 渲染，本次模型不会迁移它们：

- `src/runtime/store.ts` 的 `Table` / `Store` 响应式桥接
- `src/plugins/subgraph.ts` 的 stub node 方案与 expand / create 流程
- `src/plugins/wire` 的 binding 渲染与交互
- `src/executor` 的图执行逻辑

后续迁移顺序建议：

1. 让 runtime 读取 `GraphDocument`，替代手写 `custom_data.graph`。
2. 将 wire binding 和 group child binding 收敛到 document binding。
3. 将 subgraph plugin 改为 GraphScope + boundary slot，替代 subgraph stub node。
4. 将 executor 改为消费 `GraphDocument`，再逐步替换旧 State。
5. 最后清理旧 core State / node_ops / wire 兼容层。

在完成迁移前，`src/index.ts` 对与旧 API 同名的 graph 函数使用 `graph_add_node`、`graph_get_node`、`graph_remove_node` 别名导出，避免运行时 API 冲突。
