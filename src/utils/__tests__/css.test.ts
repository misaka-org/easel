// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { apply_styles } from '@/utils/css';

describe('apply_styles', () => {
  it('applies multiple styles', () => {
    const el = document.createElement('div');
    apply_styles(el, { color: 'red', fontSize: '14px', backgroundColor: 'blue' });
    expect(el.style.color).toBe('red');
    expect(el.style.fontSize).toBe('14px');
    expect(el.style.backgroundColor).toBe('blue');
  });

  it('overwrites existing styles', () => {
    const el = document.createElement('div');
    el.style.color = 'red';
    apply_styles(el, { color: 'green' });
    expect(el.style.color).toBe('green');
  });

  it('empty object does nothing', () => {
    const el = document.createElement('div');
    apply_styles(el, {});
  });
});