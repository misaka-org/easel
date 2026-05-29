import type { LogEntry, LogLevel, LoggerService } from './types';

// LoggerServiceImpl — 日志服务实现
// 内部存储所有日志条目，id 自增，支持订阅通知
class LoggerServiceImpl implements LoggerService {
  private _entries: LogEntry[] = [];
  private _subscribers: Set<(entry: LogEntry) => void> = new Set();
  private _next_id: number = 1;

  get entries(): readonly LogEntry[] {
    return this._entries;
  }

  debug(msg: string, data?: unknown): void {
    this._log('debug', msg, data);
  }

  info(msg: string, data?: unknown): void {
    this._log('info', msg, data);
  }

  warn(msg: string, data?: unknown): void {
    this._log('warn', msg, data);
  }

  error(msg: string, data?: unknown): void {
    this._log('error', msg, data);
  }

  clear(): void {
    this._entries = [];
  }

  subscribe(fn: (entry: LogEntry) => void): () => void {
    this._subscribers.add(fn);
    return () => {
      this._subscribers.delete(fn);
    };
  }

  // 内部日志方法：创建条目、存储、通知订阅者
  private _log(level: LogLevel, msg: string, data?: unknown): void {
    const entry: LogEntry = {
      id: this._next_id++,
      timestamp: Date.now(),
      level,
      message: msg,
      data,
    };

    this._entries.push(entry);

    for (const fn of this._subscribers) {
      fn(entry);
    }
  }
};

// 工厂函数：创建 LoggerService 实例
export function create_logger_service(): LoggerService {
  return new LoggerServiceImpl();
};