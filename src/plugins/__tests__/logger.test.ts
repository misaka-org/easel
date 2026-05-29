import { describe, it, expect, vi } from 'vitest';
import { create_logger_service } from '@/plugins/logger/service';

describe('logger service', () => {
  describe('基本操作', () => {
    it('create_logger_service 创建实例', () => {
      const service = create_logger_service();
      expect(service).toBeDefined();
      expect(service.entries).toEqual([]);
    });

    it('info/warn/error/debug 向 entries 添加日志', () => {
      const service = create_logger_service();
      service.info('信息');
      service.warn('警告');
      service.error('错误');
      service.debug('调试');
      expect(service.entries).toHaveLength(4);
    });

    it('entries 按添加顺序排列', () => {
      const service = create_logger_service();
      service.info('first');
      service.warn('second');
      service.error('third');
      expect(service.entries[0]!.message).toBe('first');
      expect(service.entries[1]!.message).toBe('second');
      expect(service.entries[2]!.message).toBe('third');
    });

    it('clear() 清空所有条目', () => {
      const service = create_logger_service();
      service.info('something');
      expect(service.entries).toHaveLength(1);
      service.clear();
      expect(service.entries).toHaveLength(0);
    });

    it('id 自增，第一个条目 id=1', () => {
      const service = create_logger_service();
      service.info('first');
      service.info('second');
      service.info('third');
      expect(service.entries[0]!.id).toBe(1);
      expect(service.entries[1]!.id).toBe(2);
      expect(service.entries[2]!.id).toBe(3);
    });
  });

  describe('subscribe 订阅', () => {
    it('订阅者收到新日志条目', () => {
      const service = create_logger_service();
      const fn = vi.fn();
      service.subscribe(fn);
      service.info('hello');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'hello', level: 'info' }),
      );
    });

    it('取消订阅后不再收到通知', () => {
      const service = create_logger_service();
      const fn = vi.fn();
      const unsubscribe = service.subscribe(fn);
      unsubscribe();
      service.info('hello');
      expect(fn).not.toHaveBeenCalled();
    });

    it('多个订阅者各自收到通知', () => {
      const service = create_logger_service();
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      service.subscribe(fn1);
      service.subscribe(fn2);
      service.info('hi');
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
    });
  });

  describe('日志条目内容', () => {
    it('level 字段正确', () => {
      const service = create_logger_service();
      service.debug('d');
      service.info('i');
      service.warn('w');
      service.error('e');
      expect(service.entries[0]!.level).toBe('debug');
      expect(service.entries[1]!.level).toBe('info');
      expect(service.entries[2]!.level).toBe('warn');
      expect(service.entries[3]!.level).toBe('error');
    });

    it('message 字段正确', () => {
      const service = create_logger_service();
      service.info('test message');
      expect(service.entries[0]!.message).toBe('test message');
    });

    it('data 字段正确传递', () => {
      const service = create_logger_service();
      const data = { key: 'value' };
      service.info('with data', data);
      expect(service.entries[0]!.data).toBe(data);
    });

    it('timestamp 是合理的时间戳', () => {
      const service = create_logger_service();
      const before = Date.now();
      service.info('timing');
      const after = Date.now();
      const ts = service.entries[0]!.timestamp;
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });
  });

  describe('Readonly entries', () => {
    it('entries 返回的是只读引用', () => {
      const service = create_logger_service();
      const entries = service.entries;
      expect(Array.isArray(entries)).toBe(true);
    });
  });
});