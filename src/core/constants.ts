/**
 * 共享常量 — 避免魔法数字分散在各模块。
 */

/** 布局 */
export const LAYOUT = {
  GAP_X: 60,
  GAP_Y: 40,
  PADDING: 80,
} as const;

/** 对齐吸附阈值 (px) */
export const SNAP_THRESHOLD = 10;

/** 自动平移 */
export const AUTO_PAN = {
  EDGE: 40,
  SPEED: 12,
} as const;

/** 历史最大步数 */
export const MAX_HISTORY = 30;

/** 节点最小尺寸 */
export const NODE_MIN = {
  WIDTH: 50,
  HEIGHT: 30,
} as const;

/** 缩放 */
export const ZOOM = {
  MIN: 0.1,
  MAX: 10,
  FACTOR: 1.1,
} as const;

/** 摄像机 */
export const CAMERA = {
  DURATION: 300,
} as const;

/** LOD */
export const LOD = {
  MIN_ZOOM: 0.4,
} as const;

/** 帧预算 (ms) */
export const FRAME_BUDGET_MS = 12;

/** 图执行器实时模式去抖 (ms) */
export const REALTIME_DEBOUNCE_MS = 80;
