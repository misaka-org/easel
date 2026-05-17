import {
  ReactiveEffectRunner,
  ReactiveEffectOptions,
  effect,
} from "@vue/reactivity";

// 帧级调度器 —— 收集所有待执行的 runner，在下一帧批量运行，
// 但通过帧预算控制避免霸占渲染线程导致丢帧。
class FrameScheduler {
  // 每帧预算：60fps 下约 16ms 一帧，留 4ms 给浏览器 layout/paint
  private static readonly budget_ms = 12;

  private tasks = new Set<ReactiveEffectRunner>();
  private raf_id: number | null = null;

  schedule(task: ReactiveEffectRunner): void {
    this.tasks.add(task);
    if (this.raf_id === null) {
      this.raf_id = requestAnimationFrame(() => this.flush());
    }
  }

  private flush(): void {
    this.raf_id = null;
    const deadline = performance.now() + FrameScheduler.budget_ms;

    // 最多 5 轮收敛（防止 effect 互相触发死循环）
    for (let round = 0; round < 5; round++) {
      // 没有待处理任务，或已经超帧预算 → 结束本轮
      if (this.tasks.size === 0) return;
      if (performance.now() >= deadline) break;

      const batch = Array.from(this.tasks);
      this.tasks.clear();

      for (let i = 0; i < batch.length; i++) {
        const runner = batch[i];
        if (runner.effect.dirty) runner.effect.run();

        // 每执行一个 effect 后检查预算——超过则将未执行的放回队列，下一帧继续
        if (performance.now() >= deadline) {
          for (let j = i + 1; j < batch.length; j++) {
            this.tasks.add(batch[j]);
          }
          if (this.tasks.size > 0) this.schedule_next();
          return;
        }
      }
    }

    // 预算内未完成，或 5 轮收敛仍未清空 → 安排下一帧继续
    if (this.tasks.size > 0) this.schedule_next();
  }

  private schedule_next(): void {
    if (this.raf_id === null) {
      this.raf_id = requestAnimationFrame(() => this.flush());
    }
  }
}

// 全局共享一个调度器
const global_scheduler = new FrameScheduler();

const create_scheduler = (fn: () => ReactiveEffectRunner) => () =>
  global_scheduler.schedule(fn());

/**
 * 帧级副作用 用法同effect()，但会同步所有操作在下一帧执行
 */
export const frame_effect = (
  fn: () => any,
  options?: ReactiveEffectOptions
): ReactiveEffectRunner => {
  const runner: ReactiveEffectRunner = effect(fn, {
    ...options,
    scheduler: create_scheduler(() => runner),
  });
  return runner;
};
