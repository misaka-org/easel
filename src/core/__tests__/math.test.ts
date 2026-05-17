import { describe, it, expect } from 'vitest';
import { vec2_create, vec2_add, vec2_sub, vec2_scale, aabb_intersect, aabb_contains } from '@/core/math';

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

  describe('aabb_intersect', () => {
    it('detects overlapping boxes', () => {
      expect(aabb_intersect(vec2_create(0,0),vec2_create(100,100),vec2_create(50,50),vec2_create(100,100))).toBe(true);
    });
    it('rejects non-overlapping boxes', () => {
      expect(aabb_intersect(vec2_create(0,0),vec2_create(100,100),vec2_create(200,200),vec2_create(100,100))).toBe(false);
    });
    it('edge-touching does not count as overlap', () => {
      expect(aabb_intersect(vec2_create(0,0),vec2_create(100,100),vec2_create(100,0),vec2_create(100,100))).toBe(false);
    });
  });

  describe('aabb_contains', () => {
    it('detects fully contained box', () => {
      expect(aabb_contains(vec2_create(0,0),vec2_create(200,200),vec2_create(20,20),vec2_create(50,50))).toBe(true);
    });
    it('rejects partially overlapping', () => {
      expect(aabb_contains(vec2_create(0,0),vec2_create(100,100),vec2_create(50,50),vec2_create(100,100))).toBe(false);
    });
    it('rejects fully outside', () => {
      expect(aabb_contains(vec2_create(0,0),vec2_create(100,100),vec2_create(200,200),vec2_create(50,50))).toBe(false);
    });
  });
});