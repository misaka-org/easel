# 图执行引擎 (GraphExecutor)

拓扑排序的异步节点执行引擎，带输入缓存和实时模式。

## 基本用法

```ts
const executor = new GraphExecutor(easel);

executor.compile();          // 编译：检查依赖，拓扑排序
await executor.run();        // 全量执行
await executor.step();       // 单步执行一个节点
executor.stop();             // 停止
executor.clear_cache();      // 清除输入缓存
```

## 执行流程

```
compile() -> Kahn 拓扑排序 -> 入度表/邻接表 -> ready_queue
run()     -> 从 ready_queue 取零入度节点，并行执行
         -> 完成后递减下游入度，新零入度节点入队
         -> 全部完成 status -> "completed"
```

## 缓存机制

- 每个节点的输入按 key 排序 JSON 指纹化
- 指纹匹配时跳过执行，从缓存取输出
- 缓存跨编译持久化，通过 `clear_cache()` 清空

## 实时模式

```ts
executor.start_realtime();   // 监听输入变化自动重算下游
executor.stop_realtime();
executor.notify_input_change(nodeId);  // 手动触发
```

- 输入变化后 80ms 防抖
- 内部拓扑排序保证正确顺序
- 只重算受影响的下游子图

## 执行状态

```ts
type ExecutionState = {
  status: "idle" | "running" | "paused" | "error" | "completed" | "stopped";
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