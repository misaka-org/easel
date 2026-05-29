import { describe, it, expect } from 'vitest';
import { GroupNode } from '@/nodes/group';

describe('GroupNode', () => {
  it('mounts without errors', () => {
    const el = document.createElement('div');
    const node = new GroupNode(el, () => {}, 'test', { app_events: {} } as any);
    expect(node).toBeDefined();
  });

  // TODO: reimplement children management with group plugin extension table
  it.todo('adds child membership on drop inside bounds');
  it.todo('removes child membership on drop outside bounds');
});