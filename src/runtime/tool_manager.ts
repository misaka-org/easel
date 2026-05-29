/**
 * ToolManager — 工具注册/激活/事件路由。
 *
 * 运行时层，管理光标切换和事件分发到当前活跃工具。
 */

import type { State } from '@/core/types';
import type { Tool, ToolResult } from '@/core/tool';
import type { PointerEventParams, WheelEventParams } from '@/core/interactions';
import { select_tool } from '@/core/tools/select_tool';
import { hand_tool } from '@/core/tools/hand_tool';
import type { Dispatch } from './store';

export class ToolManager {
  private tools = new Map<string, Tool>();
  private container: HTMLElement | null = null;
  private dispatch: Dispatch;

  constructor(dispatch: Dispatch) {
    this.dispatch = dispatch;
    this.register(select_tool);
    this.register(hand_tool);
  }

  /** 绑定 DOM 容器（用于 cursor 切换）。 */
  bind_container(container: HTMLElement): void {
    this.container = container;
  }

  /**
   * 注册自定义工具。
   *
   * 插件可在 setup 时调用 easel.tools.register(myTool) 添加自定工具。
   * 工具会自动出现在工具栏和 context menu 中，用户可通过 easel.tools.activate(id) 切换。
   *
   * @example
   * ```ts
   * const eraser_tool: Tool = {
   *   id: 'eraser',
   *   label: 'Eraser',
   *   cursor: 'not-allowed',
 *   on_pointer_down: (state, _interaction, event) => {
   *     // ... 擦除逻辑
   *     return { state };
   *   },
   * };
   * easel.tools.register(eraser_tool);
   * ```
   */
  register(tool: Tool): void {
    this.tools.set(tool.id, tool);
  }

  /** 获取已注册工具。 */
  get(id: string): Tool | undefined {
    return this.tools.get(id);
  }

  /** 获取所有已注册工具。 */
  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  /** 激活工具。 */
  activate(id: string): void {
    if (!this.tools.has(id)) return;
    this.dispatch(s => ({ ...s, active_tool: id }));
    if (this.container) {
      this.container.style.cursor = this.tools.get(id)!.cursor || 'default';
    }
  }

  /** 处理 pointerdown 事件。 */
  handle_pointer_down(state: State, event: PointerEventParams): ToolResult | null {
    const tool = this.tools.get(state.active_tool);
    if (!tool?.on_pointer_down) return null;
    return tool.on_pointer_down(state, state.interaction, event);
  }

  /** 处理 pointermove 事件。 */
  handle_pointer_move(state: State, event: PointerEventParams): ToolResult | null {
    const tool = this.tools.get(state.active_tool);
    if (!tool?.on_pointer_move) return null;
    return tool.on_pointer_move(state, state.interaction, event);
  }

  /** 处理 pointerup 事件。 */
  handle_pointer_up(state: State, event?: PointerEventParams): ToolResult | null {
    const tool = this.tools.get(state.active_tool);
    if (!tool?.on_pointer_up) return null;
    return tool.on_pointer_up(state, state.interaction, event);
  }

  /** 处理 wheel 事件。 */
  handle_wheel(state: State, event: WheelEventParams): ToolResult | null {
    const tool = this.tools.get(state.active_tool);
    if (!tool?.on_wheel) return null;
    return tool.on_wheel(state, event);
  }
}
