/**
 * Tool 类型定义。
 *
 * 每个工具是纯函数集合，所有 handler 返回新 State（保持 core 层不可变约束）。
 * ToolManager（runtime 层）负责激活/切换/事件路由。
 */

import type { State, Interaction } from './types';
import type { PointerEventParams, WheelEventParams } from './interactions';

/** Tool handler 的返回值，可选触发工具切换。 */
export type ToolResult = {
  state: State;
  transition?: string;
};

/** 工具定义——纯函数接口。 */
export type Tool = {
  readonly id: string;
  readonly label: string;
  readonly cursor?: string;
  on_pointer_down?: (state: State, interaction: Interaction, event: PointerEventParams) => ToolResult;
  on_pointer_move?: (state: State, interaction: Interaction, event: PointerEventParams) => ToolResult;
  on_pointer_up?: (state: State, interaction: Interaction, event?: PointerEventParams) => ToolResult;
  on_wheel?: (state: State, event: WheelEventParams) => ToolResult;
};
