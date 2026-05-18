import { describe, it, expect } from 'vitest';
import { create_initial_state } from '@/core/state';
import { add_binding, remove_binding } from '@/core/binding_ops';
import { create_data_flow_binding } from '@/core/types';

describe('binding_ops', () => {
  it('should add a binding', () => {
    const b = create_data_flow_binding('n1', 'p1', 'n2', 'p2');
    const s = add_binding(create_initial_state(), b);
    expect(s.bindings[b.id]).toBeDefined();
  });

  it('should remove a binding', () => {
    const b = create_data_flow_binding('n1', 'p1', 'n2', 'p2');
    const s = remove_binding(add_binding(create_initial_state(), b), b.id);
    expect(Object.values(s.bindings).length).toBe(0);
  });
});
