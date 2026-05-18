import { describe, it, expect } from 'vitest';

// 测试 fingerprint 逻辑（从 engine.ts 提取）
function inputs_fingerprint(inputs: Record<string, unknown>): string {
  return Object.keys(inputs).sort()
    .map(k => k + '\x00' + typeof inputs[k] + '\x00' + String(inputs[k]))
    .join('\x01');
}

describe('inputs_fingerprint', () => {
  it('produces deterministic fingerprint for same inputs', () => {
    const a = { x: 1, y: 'hello' };
    const b = { y: 'hello', x: 1 };
    expect(inputs_fingerprint(a)).toBe(inputs_fingerprint(b));
  });

  it('differs for different values', () => {
    const a = { x: 1 };
    const b = { x: 2 };
    expect(inputs_fingerprint(a)).not.toBe(inputs_fingerprint(b));
  });

  it('differs for different types with same string representation', () => {
    const a = { x: 1 };
    const b = { x: '1' };
    // typeof 1 = 'number', typeof '1' = 'string' -> different
    expect(inputs_fingerprint(a)).not.toBe(inputs_fingerprint(b));
  });

  it('handles empty inputs', () => {
    expect(inputs_fingerprint({})).toBe('');
  });

  it('handles boolean and null values', () => {
    const a = { enabled: true, meta: null as unknown };
    expect(() => inputs_fingerprint(a)).not.toThrow();
    expect(inputs_fingerprint(a).length).toBeGreaterThan(0);
  });

  it('handles undefined value (becomes "undefined" string)', () => {
    const a = { x: undefined };
    const fp = inputs_fingerprint(a);
    expect(fp).toContain('undefined');
  });
});