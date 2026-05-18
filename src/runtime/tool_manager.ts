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
import { wire_tool } from '@/core/tools/wire_tool';

export type Dispatch = (updater: (state: State) => State) => void;

export class ToolManager {
  private tools = new Map<string, Tool>();
  private container: HTMLElement | null = null;
  private dispatch: Dispatch;

  constructor(dispatch: Dispatch) {
    this.dispatch = dispatch;
    // 注册内置工具
    this.register(select_tool);
    this.register(hand_tool);
    this.register(wire_tool);
  }

  /** 绑定 DOM 容器（用于 cursor 切换）。 */
  bind_container(container: HTMLElement): void {
    this.container = container;
  }

  /** 注册工具。 */
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
    if (!tool?.onPointerDown) return null;
    return tool.onPointerDown(state, state.interaction, event);
  }

  /** 处理 pointermove 事件。 */
  handle_pointer_move(state: State, event: PointerEventParams): ToolResult | null {
    const tool = this.tools.get(state.active_tool);
    if (!tool?.onPointerMove) return null;
    return tool.onPointerMove(state, state.interaction, event);
  }

  /** 处理 pointerup 事件。 */
  handle_pointer_up(state: State, event?: PointerEventParams): ToolResult | null {
    const tool = this.tools.get(state.active_tool);
    if (!tool?.onPointerUp) return null;
    return tool.onPointerUp(state, state.interaction, event);
  }

  /** 处理 wheel 事件。 */
  handle_wheel(state: State, event: WheelEventParams): ToolResult | null {
    const tool = this.tools.get(state.active_tool);
    if (!tool?.onWheel) return null;
    return tool.onWheel(state, event);
  }
}
