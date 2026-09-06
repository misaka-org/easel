# 图模型 (GraphDocument / GraphScope)

## 目标

`src/core/graph` 是 Easel 面向 ComfyUI 类工作流的图数据基础。它把“文档中的整张图”建模为不可变 plain object，为后续运行时、渲染器和执行器提供统一的数据契约。

模型只处理图结构数据：

- 图作用域层级（root / subgraph）
- 全局唯一节点表
- 同一 graph 内的 binding 数据流
- first-class subgraph host / boundary 映射
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
  boundary_bindings: Readonly<Record<BoundaryId, GraphBoundaryBinding>>;
};
```

- `GraphId`、`NodeId`、`BindingId`、`BoundaryId` 是 string alias，便于后续收紧为 branded type。
- `GraphScope` 表示一个可进入的画布 scope：root 或 subgraph。
- `GraphNodeRecord` 是现有 `GraphNode` 与 `graph_id` 的交集；节点 ID 在整份 document 内唯一。
- `GraphBindingRecord` 复用现有 binding 字段命名：`source_id`、`source_handle`、`target_id`、`target_handle`，方便后续迁移连线逻辑。
- `boundary_bindings` 按 graph scope 记录每个输入/输出 slot 映射到的子图内部节点端口。

## Scope、Host 与 Boundary

`GraphScope` 不是运行时里的 DOM 页面，也不是旧的 `subgraph_input` / `subgraph_output` stub node。

- `kind: 'root'` 是 document 的根作用域，由 `create_empty_graph_document()` 创建，且不能删除。
- `kind: 'subgraph'` 通过 `parent_graph_id` 挂在现有 graph 下。
- `input_slots` / `output_slots` 是 graph 边界的 first-class 数据定义，不生成虚拟节点；节点与端口仍是 document 中的独立数据。
- 一个 subgraph scope 可被 `nested_graph_id` 指向它的 host 节点实例化。host node 仍存在于父 graph，并携带与对应 scope slot 同 id 的输入/输出端口。
- `GraphBoundaryBinding` 的 input 项把 `slot_id` 映射到子图内部接收外部输入的 target 输入端口；output 项把 `slot_id` 映射到子图内部向外部输出的 source 输出端口。

```ts
type GraphBoundaryBinding = {
  id: BoundaryId;
  graph_id: GraphId;
  direction: 'input' | 'output';
  slot_id: string;
  node_id: NodeId;
  port_id: string;
};
```

`remove_graph` 会拒绝删除仍被任何 host node 引用的 subgraph scope。

## 纯操作

基础操作定义在 `src/core/graph/document.ts`，pack / unpack 定义在 `src/core/graph/subgraph.ts`。它们输入 document 后返回新 document，不修改原参数。

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
pack_nodes(document, options): Either<GraphDocumentError, GraphDocument>
unpack_subgraph(document, host_node_id): Either<GraphDocumentError, GraphDocument>
```

查找函数使用 `fp-ts/Option`。会失败的变更使用 `fp-ts/Either` 和可识别错误 union，不抛异常、不以 `null` / `undefined` 表达错误。

### pack_nodes

`pack_nodes` 把同一 source graph 内的一组节点移入新建 subgraph scope，并在 source graph 留下带 `nested_graph_id` 的 host node。被选中节点保留原 node id，内部 binding 原样改为新 graph；只连接一侧的外部 binding 会替换为 host 端口连接，同时在 `boundary_bindings` 中写入对应边界映射。pack 不生成 stub 节点。

如果被选中的节点本身是 host node，其 `nested_graph_id` 指向的 graph 会同步重挂到新 outer scope：对应 graph 的 `parent_graph_id` 改为 `options.graph_id`。调用方必须显式传 `graph_id` 与 `host_node_id`。host 的输入/输出端口 id 与 scope 对应 slot id 相同。pack 是纯变换，不修改入参。

### unpack_subgraph

`unpack_subgraph` 把 host node 指向的 scope 展开回 host 所在 graph：子图节点移回父 graph 并保留 id，内部 binding 改回父 graph，外部 host 连接按 `boundary_bindings` 还原为原来的 crossing connection，随后删除 host node 与对应 scope/boundary 数据。若当前 scope 仍有直接 child scopes，这些 child scopes 会重挂到 host 所在 graph，而不是阻止展开，因此深层嵌套可逐层 roundtrip。

当 scope 仍被其它 host 引用、host 或 nested graph 不存在时，unpack 返回明确错误，不会静默删除共享 scope。

## 一致性校验与版本化序列化

校验与序列化定义在 `src/core/graph/validation.ts` 与 `src/core/graph/serialization.ts`，只处理当前 `format_version = 1` 的 GraphDocument。

```ts
validate_graph_document(document): Either<readonly GraphValidationIssue[], true>
serialize_graph_document(document, options?): string
deserialize_graph_document(json): Either<GraphDeserializationError | readonly GraphValidationIssue[], GraphDocument>
```

- `validate_graph_document` 返回可读问题列表，不抛堆栈异常。每个 `GraphValidationIssue` 带 `path` 与 `message`，例如 `nodes.abc.graph_id`，并覆盖 root/subgraph 层级、graph id、节点归属、binding 方向、boundary slot/端口方向与 host 端口对齐等一致性约束。
- `serialize_graph_document` 输出普通 JSON string，默认紧凑输出；`{ pretty: true }` 使用 2 空格缩进。序列化结果不包含 class、function 或自定义运行时对象，可被 `JSON.parse` 恢复为 plain object。
- `deserialize_graph_document` 先处理非法 JSON、缺失根字段、非法 `format_version` 和结构性类型错误，再调用一致性校验；结构合法但语义非法的 document 返回 validation issues。
- `format_version` 当前固定为 1。后续迁移应在反序列化入口按版本分派 decoder；未知未来版本返回 `unsupported_format_version`，不要直接扩宽 v1 的类型守卫静默接受新数据。
- 运行时尚未调用该序列化器。GraphDocument 校验与序列化只属于核心图模型范围，runtime、plugin 与 executor 仍按现有流程工作。

## 当前约束

- 节点 ID 全局唯一，binding ID 同样在整份 document 内唯一。
- binding 两端节点必须存在、必须在同一 graph，且 source handle 是 source node 的 output，target handle 是 target node 的 input。
- 删除或移动节点会同步清理当前 graph 内引用该节点的 binding，避免留下跨 graph 的非法连接。
- 移动节点保留原 `node.id`，只更新 `graph_id`。
- host node 只是 parent graph 中的实例节点；scope 的删除必须显式经过 unpack 或确认已无 host 引用。

## 与现有 runtime 的关系

以下内容仍使用现有 `State`、Store、plugin 和 DOM/SVG 渲染，本次模型不会迁移它们：

- `src/runtime/store.ts` 的 `Table` / `Store` 响应式桥接
- `src/plugins/subgraph.ts` 的 stub node 方案与 expand / create 流程
- `src/plugins/wire` 的 binding 渲染与交互
- `src/executor` 的图执行逻辑

后续迁移顺序建议：

1. 让 runtime 读取 `GraphDocument`，替代手写 `custom_data.graph`。
2. 将 wire binding 和 group child binding 收敛到 document binding。
3. 将 subgraph plugin 改为消费 host node + `boundary_bindings`，替代 subgraph stub node。
4. 将 executor 改为消费 `GraphDocument`，再逐步替换旧 State。
5. 最后清理旧 core State / node_ops / wire 兼容层。

在完成迁移前，`src/index.ts` 对与旧 API 同名的 graph 函数使用 `graph_add_node`、`graph_get_node`、`graph_remove_node` 别名导出，避免运行时 API 冲突。
