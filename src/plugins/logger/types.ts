// 日志级别类型
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// 日志条目接口
export interface LogEntry {
  id: number;
  timestamp: number;
  level: LogLevel;
  message: string;
  data?: unknown;
};

// 日志服务接口
export interface LoggerService {
  readonly entries: readonly LogEntry[];

  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
  debug(msg: string, data?: unknown): void;

  clear(): void;

  subscribe(fn: (entry: LogEntry) => void): () => void;
};