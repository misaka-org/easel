export type Vec2 = { readonly x: number; readonly y: number };

export const vec2_create = (x: number, y: number): Vec2 => ({ x, y });
export const vec2_add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const vec2_sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const vec2_scale = (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s });
export const vec2_lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export const aabb_intersect = (pos1: Vec2, size1: Vec2, pos2: Vec2, size2: Vec2): boolean => {
  return (
    pos1.x < pos2.x + size2.x &&
    pos1.x + size1.x > pos2.x &&
    pos1.y < pos2.y + size2.y &&
    pos1.y + size1.y > pos2.y
  );
};

export const aabb_contains = (pos1: Vec2, size1: Vec2, pos2: Vec2, size2: Vec2): boolean => {
  return (
    pos2.x >= pos1.x &&
    pos2.y >= pos1.y &&
    pos2.x + size2.x <= pos1.x + size1.x &&
    pos2.y + size2.y <= pos1.y + size1.y
  );
};
