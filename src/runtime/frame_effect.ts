import {
  ReactiveEffectRunner,
  ReactiveEffectOptions,
  effect,
} from "@vue/reactivity";

// 帧级调度器 —— 收集所有待执行的runner，在下一帧一次性运行
class FrameScheduler {
  private tasks = new Set<ReactiveEffectRunner>();
  private rafId: number | null = null;

  schedule(task: ReactiveEffectRunner) {
    this.tasks.add(task);
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      // 循环处理，直到所有 dirty effect 收敛（最多 5 轮防死循环）
      let safety = 0;
      while (this.tasks.size > 0 && safety < 5) {
        safety++;
        const current = this.tasks;
        this.tasks = new Set();
        for (const runner of current) {
          if (runner.effect.dirty) runner.effect.run();
        }
      }
    });
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
