import {
  ReactiveEffectRunner,
  ReactiveEffectOptions,
  effect,
} from "@vue/reactivity";

// 帧级调度器 —— 收集所有待执行的 runner，在下一帧一次性运行
class FrameScheduler {
  private tasks = new Set<ReactiveEffectRunner>();
  private rafId: number | null = null;

  schedule(task: ReactiveEffectRunner) {
    this.tasks.add(task);
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      // 取出当前所有任务，清空队列后再执行（避免执行过程中新加入的任务干扰）
      const tasks = Array.from(this.tasks);
      this.tasks.clear();
      for (const runner of tasks) {
        if (runner.effect.dirty) runner.effect.run();
      }
    });
  }
}

// 全局共享一个调度器
const global_scheduler = new FrameScheduler();

const create_scheduler = (fn: () => ReactiveEffectRunner) => () =>
  global_scheduler.schedule(fn());

/**
 * 帧级别副作用 用法同 effect()，但会同步所有操作在下一帧执行
 */
export const frame_effect = (
  fn: () => any,
  options?: ReactiveEffectOptions
) => {
  const runner = effect(fn, {
    ...options,
    scheduler: create_scheduler(() => runner),
  });
  return runner;
};
