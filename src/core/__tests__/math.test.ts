import { describe, it, expect } from 'vitest';
import { vec2_create, vec2_add, vec2_sub, vec2_scale } from '@/core/math';

describe('math', () => {
  it('should add vectors', () => {
    const a = vec2_create(1, 2);
    const b = vec2_create(3, 4);
    expect(vec2_add(a, b)).toEqual(vec2_create(4, 6));
  });

  it('should subtract vectors', () => {
    const a = vec2_create(5, 5);
    const b = vec2_create(2, 3);
    expect(vec2_sub(a, b)).toEqual(vec2_create(3, 2));
  });

  it('should scale vector', () => {
    const a = vec2_create(2, 3);
    expect(vec2_scale(a, 2)).toEqual(vec2_create(4, 6));
  });
});