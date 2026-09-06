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

## GraphSession / scope 导航

`src/core/graph/session.ts` 提供围绕 `GraphDocument` 的纯 scope 会话。`GraphSession` 持有完整 document 与当前导航 path；`path` 从 root graph 开始，最后一个 id 是当前 graph。会失败的入口返回 `fp-ts/Either`，错误类型为 `GraphSessionError`；操作不修改传入 session 或 document，也不抛堆栈异常。

```ts
type GraphSession = {
  readonly document: GraphDocument;
  readonly path: readonly GraphId[];
};

create_graph_session(document: GraphDocument): Either<GraphSessionError, GraphSession>
enter_subgraph(session: GraphSession, host_node_id: NodeId): Either<GraphSessionError, GraphSession>
exit_subgraph(session: GraphSession): Either<GraphSessionError, GraphSession>
session_set_document(session: GraphSession, document: GraphDocument): Either<GraphSessionError, GraphSession>
session_current_graph(session: GraphSession): Option<GraphScope>
session_current_nodes(session: GraphSession): Readonly<Record<NodeId, GraphNodeRecord>>
session_current_bindings(session: GraphSession): Readonly<Record<BindingId, GraphBindingRecord>>
session_current_boundary_bindings(session: GraphSession): Readonly<Record<BoundaryId, GraphBoundaryBinding>>
```

- `create_graph_session` 从 root 创建 `[root_graph_id]` 路径，并确认 root graph 存在且 `kind` 为 `root`。
- `enter_subgraph` 要求 host node 在当前 graph 且带 `nested_graph_id`；nested graph 的 `parent_graph_id` 必须等于当前 graph。成功后把 nested graph id 追加到 path。
- `exit_subgraph` 从非 root path 移除最后一级；root 返回 `cannot_exit_root`。
- `session_set_document` 用新 document 替换 session 的 document 并保留当前 path，但只校验 path 上的 graph 链仍存在且层级一致，不重复调用 `validate_graph_document` 校验整份 document。
- `session_current_graph` 返回当前 graph；path 失效时返回 `None`。`session_current_nodes` / `session_current_bindings` / `session_current_boundary_bindings` 过滤出当前 graph 的不可变 record。

GraphSession 仍是纯核心层能力；runtime、plugin 与 executor 尚未迁移使用。现有 `subgraph_plugin` 的 `enter_subgraph` 事件仍使用 stub node 流程。

## 边界编辑操作

`src/core/graph/boundary.ts` 提供 scope 边界 slot 的增删改，并自动同步该 scope 的所有 host node 端口。这些操作不可变：成功返回新 `GraphDocument`，失败返回 `Either<GraphBoundaryError, GraphDocument>`，不修改原 document、不抛堆栈异常。

```ts
type GraphBoundaryDirection = 'input' | 'output';
type GraphBoundaryMapping = {
  readonly node_id: NodeId;
  readonly port_id: string;
};
type AddGraphBoundaryOptions = {
  readonly graph_id: GraphId;
  readonly direction: GraphBoundaryDirection;
  readonly slot: GraphSlot;
  readonly mapping: GraphBoundaryMapping;
  readonly boundary_id?: BoundaryId;
};
type GraphBoundarySlotUpdate = Partial<GraphSlot>;

add_graph_boundary(
  document: GraphDocument,
  options: AddGraphBoundaryOptions,
): Either<GraphBoundaryError, GraphDocument>;
remove_graph_boundary(
  document: GraphDocument,
  graph_id: GraphId,
  direction: GraphBoundaryDirection,
  slot_id: string,
): Either<GraphBoundaryError, GraphDocument>;
update_graph_boundary_slot(
  document: GraphDocument,
  graph_id: GraphId,
  direction: GraphBoundaryDirection,
  slot_id: string,
  updates: GraphBoundarySlotUpdate,
): Either<GraphBoundaryError, GraphDocument>;
```

- `add_graph_boundary` 在目标 graph scope 的 input/output slots 后追加新 slot，写入对应 `boundary_bindings` mapping，并给每个 `nested_graph_id` 指向该 graph 的 host node 追加同名端口。默认 boundary id 是 `${graph_id}:${direction}:${slot_id}`，也可用 `boundary_id` 指定。
- mapping 的 node 必须存在于目标 graph，且对应方向端口必须存在。重复 slot、重复 boundary id、缺失 graph/node/port 等情况都返回对应 `GraphBoundaryError`。
- `update_graph_boundary_slot` 更新 slot 元数据并同步所有 host node 的同名端口；slot `id` 不可变，尝试改 id 返回 `invalid_arguments`。
- `remove_graph_boundary` 删除 slot、对应 boundary mapping 以及所有 host node 的同名端口。若任一 host node 的该端口仍被父 graph binding 使用，返回 `host_port_in_use`，错误含 `host_node_id`、`binding_id` 等定位信息，且不回写原 document。
- 失败 union 包含 `graph_not_found`、`boundary_slot_already_exists`、`boundary_slot_not_found`、mapping 节点/端口相关错误、`boundary_id_already_exists`、`invalid_arguments` 与 `host_port_in_use`，调用方可按 `type` 分支处理。

边界 slot 编辑也仍是纯核心层 API；runtime、plugin 与 executor 尚未迁移使用，旧 subgraph plugin 仍使用 subgraph stub node。

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

## 执行图 flatten

`flatten_graph_document` 定义在 `src/core/graph/flatten.ts`，从 root 递归展开 `GraphDocument` 成扁平执行图 view。它是纯函数，返回 `Either<GraphFlattenError, FlattenedGraph>`，不修改原 document，也不抛堆栈异常。

```ts
flatten_graph_document(document: GraphDocument): Either<GraphFlattenError, FlattenedGraph>
```

flat view 的公开类型如下：

```ts
type GraphScopeStep = {
  readonly graph_id: GraphId;
  readonly host_node_id?: NodeId;
};

type FlattenedGraphNode = {
  readonly instance_id: string;
  readonly scope_steps: readonly GraphScopeStep[];
  readonly graph_id: GraphId;
  readonly node_id: NodeId;
  readonly node: GraphNodeRecord;
};

type FlattenedGraphBinding = {
  readonly id: string;
  readonly source_instance_id: string;
  readonly source_handle: string;
  readonly target_instance_id: string;
  readonly target_handle: string;
};

type FlattenedGraph = {
  readonly nodes: Readonly<Record<string, FlattenedGraphNode>>;
  readonly bindings: Readonly<Record<string, FlattenedGraphBinding>>;
};
```

- flat view 只输出实际内容节点与 binding，host 节点本身不进入结果。每个 `FlattenedGraphNode` 保留原始 `GraphNodeRecord`，同时给出该实例的 `instance_id` 与 `scope_steps`；`instance_id` 从 root graph id 开始、逐层追加 host node id，`scope_steps` 保存对应的 graph 路径，嵌套层 step 带 `host_node_id`。
- 同一 subgraph scope 被多个 host 引用时，host node id 不同，因此各 host 会得到独立展开实例，flat node 与 binding 不会互相覆盖。
- root 内普通 binding 保留原 binding id；进入嵌套实例后，binding id 会加上实例路径，避免不同 host 实例中的同名 binding 冲突。
- binding 端点若是 host node 的端口，flatten 会沿该 host 指向的 nested graph 查找对应方向与 slot 的 `boundary_bindings`，再继续解析到真实内部节点端口；内部节点若又是更深层 host，会继续穿透。最终 `FlattenedGraphBinding` 的端点指向非 host 内部节点的实例 id 与端口 handle。
- 同一 graph scope 内，相同 `direction` + `slot_id` 不允许存在多个 boundary mapping。发现重复时返回 `duplicate_boundary_mapping`，错误携带 `graph_id`、`direction`、`slot_id` 与用于定位的 `boundary_ids`。
- host binding 对应的 slot 缺少 boundary mapping 时返回 `host_binding_missing_boundary`，错误携带 `binding_id`、`host_node_id`、`direction`、`slot_id` 与 `nested_graph_id`。mapping 指向不存在节点、节点 graph 不匹配或端口不存在时，分别返回 `boundary_mapping_node_not_found`、`boundary_mapping_node_graph_mismatch`、`boundary_mapping_port_not_found`。
- `GraphFlattenError` 还覆盖 root/nested graph 缺失、节点 graph 不匹配与 scope cycle 等非法输入，调用方按 `type` 分支处理。
- flatten 结果仍是纯数据 execution view，供 future executor 使用；现有 runtime、plugin 与 executor 尚未消费该 API，仍按旧 runtime stub/`custom_data.graph` 流程工作。

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
