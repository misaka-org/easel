# 图执行引擎 (GraphExecutor)

拓扑排序的异步节点执行引擎，带 LRU 输入缓存、子图透明执行和实时模式。

## 基本用法

```ts
const executor = new GraphExecutor(easel);

executor.compile(); // 编译：检查依赖，拓扑排序
await executor.run(); // 全量执行
await executor.step(); // 单步执行一个节点
executor.stop(); // 停止
executor.clear_cache(); // 清除输入缓存
```

## 执行流程

```
compile() -> Kahn 拓扑排序 -> 入度表/邻接表 -> ready_queue
run()     -> 从 ready_queue 取零入度节点，并行执行
         -> 完成后递减下游入度，新零入度节点入队
         -> 全部完成 status -> "completed"
```

## Muted / Bypass

`muted === true` 即 bypass，没有另一套 bypass 状态。执行引擎遇到 muted 节点会：

- `compile()` 不检查该节点的 required input/widget，避免因绕过导致误报错误
- 不调用节点的 `execute()`，因此不产生正常节点副作用
- 用 `muted_node_outputs()` 按输入端口 id 或同序端口直通输入到输出；没有可直通输入时输出为空
- 不写入普通执行缓存，mute 状态切换后不会复用旧的正常执行结果
- GraphExecutor 的 `run() / step() / realtime` 与 legacy `execute_subgraph()` 共用同一套规则

## 缓存机制

- 每个节点的输入按 key 排序 JSON 指纹化
- 指纹匹配时跳过执行，从缓存取输出
- 缓存跨编译持久化，通过 `clear_cache()` 清空
- **LRU 驱逐**：`max_cache_size`（默认 200），超出时淘汰最久未用的条目
- `cache_get()` 将访问的条目移到最近使用位置
- `cache_set()` 写满时驱逐最旧条目
- 设置 `max_cache_size = 0` 可完全禁用缓存

## 子图透明执行

SubgraphNode 对执行引擎透明：

- `execute_subgraph()` 读取节点的 `custom_data.graph`（内部 nodes + wires）
- 拓扑排序内部节点，注入 inputs/widget values，并行执行
- 递归支持嵌套子图
- `AbortSignal` 穿透：外部 abort 信号传入内部所有节点
- 某个内部节点报错不阻塞其他并行分支
- 找不到 node type 的节点安全跳过

## 实时模式

```ts
executor.start_realtime(); // 监听输入变化自动重算下游
executor.stop_realtime();
executor.notify_input_change(nodeId); // 手动触发
```

- 输入变化后 80ms 防抖
- 内部拓扑排序保证正确顺序
- 只重算受影响的下游子图

## 执行状态

```ts
type ExecutionState = {
  status: 'idle' | 'running' | 'paused' | 'error' | 'completed' | 'stopped';
  node_states: Record<string, ExecutionNodeState>;
  ready_queue: string[];
  running_nodes: string[];
  in_degrees: Record<string, number>;
  adj: Record<string, string[]>;
};
```

每个节点独立追踪 idle -> running -> completed/error，含 progress 百分比。

## 扩展节点

实现 `execute` 方法接入执行引擎：

```ts
class MyNode extends DefaultNode {
  async execute(ctx: ExecuteContext): Promise<Record<string, unknown>> {
    const { node, inputs, report_progress, signal } = ctx;
    report_progress(50);
    await someAsyncWork(inputs, signal);
    report_progress(100);
    return { output: result };
  }
}
```
