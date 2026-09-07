import { describe, it, expect } from 'vitest';
import { create_initial_state } from '@/core/state';
import { add_node } from '@/core/node_ops';
import {
  pointer_down,
  pointer_move,
  pointer_up,
  wheel_zoom,
  update_modifiers,
} from '@/core/interactions';
import { vec2_create } from '@/core/math';
import * as O from 'fp-ts/Option';
import { select_tool } from '@/core/tools/select_tool';

describe('interactions', () => {
  const node = () => ({
    id: 'n1',
    type: 'default',
    position: vec2_create(0, 0),
    size: vec2_create(100, 100),
    title: 'N',
    inputs: [{ id: 'in1', label: 'In', type: 'input' as const }],
    outputs: [{ id: 'out1', label: 'Out', type: 'output' as const }],
    widgets: [],
    custom_data: {},
  });

  const base = () => add_node(create_initial_state(), node());
  const mod = () => ({ ctrl: false, shift: false, alt: false, meta: false });

  it('selects and drags node on pointer down', () => {
    const s = pointer_down(base(), {
      screen_position: vec2_create(10, 10),
      target_node_id: O.some('n1'),
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: mod(),
    });
    expect(s.selected_node_ids).toEqual(['n1']);
    expect(s.interaction.mode).toBe('dragging');
  });

  it('starts box selecting on empty area', () => {
    const s = pointer_down(base(), {
      screen_position: vec2_create(10, 10),
      target_node_id: O.none,
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: mod(),
    });
    expect(s.interaction.mode).toBe('box_selecting');
  });

  it('starts panning on empty area with ctrl', () => {
    const s = pointer_down(base(), {
      screen_position: vec2_create(10, 10),
      target_node_id: O.none,
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: { ...mod(), ctrl: true },
    });
    expect(s.interaction.mode).toBe('panning');
  });

  it('starts resizing on resize handle', () => {
    const s = pointer_down(base(), {
      screen_position: vec2_create(10, 10),
      target_node_id: O.some('n1'),
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.some('resize'),
      modifiers: mod(),
    });
    expect(s.interaction.mode).toBe('resizing');
  });

  it('applies zoom with wheel_zoom', () => {
    const s1 = wheel_zoom(base(), {
      screen_position: vec2_create(100, 100),
      delta_x: 0,
      delta_y: -120,
      modifiers: { ...mod(), ctrl: true },
    });
    expect(s1.camera.zoom).toBeGreaterThan(1);
    const s2 = wheel_zoom(base(), {
      screen_position: vec2_create(100, 100),
      delta_x: 0,
      delta_y: 120,
      modifiers: { ...mod(), ctrl: true },
    });
    expect(s2.camera.zoom).toBeLessThan(1);
  });

  it('pans with wheel_zoom without ctrl', () => {
    const s = wheel_zoom(base(), {
      screen_position: vec2_create(100, 100),
      delta_x: 10,
      delta_y: 20,
      modifiers: mod(),
    });
    expect(s.camera.position.x).toBe(-10);
    expect(s.camera.position.y).toBe(-20);
  });

  it('updates modifiers', () => {
    const s = update_modifiers(base(), { ctrl: true, shift: false, alt: true, meta: false });
    expect(s.modifiers.ctrl).toBe(true);
    expect(s.modifiers.alt).toBe(true);
  });

  it('drags a view-only boundary rail from a direct pointer down', () => {
    const rail = {
      ...node(),
      id: 'rail',
      type: 'subgraph_input',
      position: vec2_create(100, 100),
      size: vec2_create(180, 80),
      inputs: [],
      outputs: [{ id: '__easel_boundary_add__', label: 'Add', type: 'output' as const }],
      custom_data: { view_only: true, boundary_direction: 'input' },
    };
    let s = add_node(base(), rail);
    s = pointer_down(s, {
      screen_position: vec2_create(110, 110),
      target_node_id: O.some('rail'),
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: mod(),
    });
    expect(s.selected_node_ids).toContain('rail');
    expect(s.interaction.mode).toBe('dragging');

    s = pointer_move(s, {
      screen_position: vec2_create(140, 150),
      target_node_id: O.some('rail'),
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: mod(),
    });
    expect(s.nodes['rail']?.position).toEqual(vec2_create(130, 140));
  });

  it('select_tool drags view-only rails while box selection still skips them', () => {
    const on_pointer_down = select_tool.on_pointer_down;
    const on_pointer_move = select_tool.on_pointer_move;
    const on_pointer_up = select_tool.on_pointer_up;
    if (on_pointer_down == null || on_pointer_move == null || on_pointer_up == null) {
      throw new Error('expected select_tool handlers');
    }
    const rail = {
      ...node(),
      id: 'rail',
      type: 'subgraph_input',
      position: vec2_create(100, 100),
      size: vec2_create(180, 80),
      inputs: [],
      outputs: [{ id: '__easel_boundary_add__', label: 'Add', type: 'output' as const }],
      custom_data: { view_only: true, boundary_direction: 'input' },
    };
    let s = add_node(base(), rail);
    const down_result = on_pointer_down(s, s.interaction, {
      screen_position: vec2_create(110, 110),
      target_node_id: O.some('rail'),
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: mod(),
    });
    if (down_result == null) {
      throw new Error('expected select_tool pointer_down result');
    }
    expect(down_result.state.interaction.mode).toBe('dragging');
    expect(down_result.state.selected_node_ids).toContain('rail');

    s = down_result.state;
    const move_result = on_pointer_move(s, s.interaction, {
      screen_position: vec2_create(140, 150),
      target_node_id: O.some('rail'),
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: mod(),
    });
    if (move_result == null) {
      throw new Error('expected select_tool pointer_move result');
    }
    expect(move_result.state.nodes['rail']?.position).toEqual(vec2_create(130, 140));

    s = add_node(base(), rail);
    const box_down = on_pointer_down(s, s.interaction, {
      screen_position: vec2_create(0, 0),
      target_node_id: O.none,
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: mod(),
    });
    if (box_down == null) {
      throw new Error('expected select_tool box pointer_down result');
    }
    s = box_down.state;
    const box_move = on_pointer_move(s, s.interaction, {
      screen_position: vec2_create(300, 300),
      target_node_id: O.none,
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: mod(),
    });
    if (box_move == null) {
      throw new Error('expected select_tool box pointer_move result');
    }
    s = box_move.state;
    const box_up = on_pointer_up(s, s.interaction, {
      screen_position: vec2_create(300, 300),
      target_node_id: O.none,
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: mod(),
    });
    if (box_up == null) {
      throw new Error('expected select_tool box pointer_up result');
    }
    expect(box_up.state.selected_node_ids).toContain('n1');
    expect(box_up.state.selected_node_ids).not.toContain('rail');
  });

  it('excludes view-only boundary rails from box selection', () => {
    const rail = {
      ...node(),
      id: 'rail',
      type: 'subgraph_input',
      position: vec2_create(100, 100),
      size: vec2_create(180, 80),
      inputs: [],
      outputs: [{ id: '__easel_boundary_add__', label: 'Add', type: 'output' as const }],
      custom_data: { view_only: true, boundary_direction: 'input' },
    };
    let s = add_node(base(), rail);
    s = pointer_down(s, {
      screen_position: vec2_create(0, 0),
      target_node_id: O.none,
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: mod(),
    });
    s = pointer_move(s, {
      screen_position: vec2_create(200, 200),
      target_node_id: O.none,
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: mod(),
    });
    s = pointer_up(s, {
      screen_position: vec2_create(200, 200),
      target_node_id: O.none,
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: mod(),
    });
    expect(s.selected_node_ids).toContain('n1');
    expect(s.selected_node_ids).not.toContain('rail');
  });

  it('completes box selection on pointer up', () => {
    let s = pointer_down(base(), {
      screen_position: vec2_create(0, 0),
      target_node_id: O.none,
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: mod(),
    });
    s = pointer_move(s, {
      screen_position: vec2_create(200, 200),
      target_node_id: O.none,
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: mod(),
    });
    s = pointer_up(s, {
      screen_position: vec2_create(200, 200),
      target_node_id: O.none,
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: mod(),
    });
    expect(s.interaction.mode).toBe('idle');
    expect(s.selected_node_ids).toContain('n1');
  });

  it('completes box selection with shift modifier (additive)', () => {
    let s = base();
    // Add a second node
    s = add_node(s, {
      id: 'n2',
      type: 'default',
      position: vec2_create(300, 0),
      size: vec2_create(100, 100),
      title: 'N2',
      inputs: [],
      outputs: [],
      widgets: [],
      custom_data: {},
    });
    // First select n1
    s = pointer_down(s, {
      screen_position: vec2_create(10, 10),
      target_node_id: O.some('n1'),
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: mod(),
    });
    s = pointer_up(s, {
      screen_position: vec2_create(10, 10),
      target_node_id: O.some('n1'),
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: mod(),
    });
    expect(s.selected_node_ids).toEqual(['n1']);
    // Then box-select n2 with shift
    s = pointer_down(s, {
      screen_position: vec2_create(250, -50),
      target_node_id: O.none,
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: { ...mod(), shift: true },
    });
    s = pointer_move(s, {
      screen_position: vec2_create(450, 150),
      target_node_id: O.none,
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: { ...mod(), shift: true },
    });
    s = pointer_up(s, {
      screen_position: vec2_create(450, 150),
      target_node_id: O.none,
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: { ...mod(), shift: true },
    });
    expect(s.interaction.mode).toBe('idle');
    expect(s.selected_node_ids).toContain('n1');
    expect(s.selected_node_ids).toContain('n2');
  });

  it('clamps resize to minimum size', () => {
    let s = base();
    s = pointer_down(s, {
      screen_position: vec2_create(10, 10),
      target_node_id: O.some('n1'),
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.some('resize'),
      modifiers: mod(),
    });
    s = pointer_move(s, {
      screen_position: vec2_create(-200, -200),
      target_node_id: O.some('n1'),
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: mod(),
    });
    expect(s.nodes.n1.size.x).toBe(50);
    expect(s.nodes.n1.size.y).toBe(30);
  });
});
