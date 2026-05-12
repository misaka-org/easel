import { describe, it, expect } from "vitest";
import { create_initial_state } from "../state";
import { add_node } from "../node_ops";
import { pointer_down, pointer_move, pointer_up } from "../interactions";
import { vec2_create } from "../math";
import * as O from "fp-ts/Option";

describe("interactions", () => {
  const node_a = {
    id: "node_1",
    type: "default",
    position: vec2_create(0, 0),
    size: vec2_create(100, 100),
    title: "Node 1",
    inputs: [],
    outputs: [],
    widgets: [],
    custom_data: {},
  };

  const initial_state = add_node(create_initial_state(), node_a);
  const empty_modifiers = {
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
  };

  it("should select node on pointer down", () => {
    const state = pointer_down(initial_state, {
      screen_position: vec2_create(10, 10),
      target_node_id: O.some("node_1"),
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: empty_modifiers,
    });
    expect(state.selected_node_ids).toEqual(["node_1"]);
    expect(state.interaction.mode).toBe("dragging");
  });

  it("should pan on background pointer down", () => {
    const state = pointer_down(initial_state, {
      screen_position: vec2_create(10, 10),
      target_node_id: O.none,
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: { ...empty_modifiers, ctrl: true },
    });
    expect(state.selected_node_ids).toEqual([]);
    expect(state.interaction.mode).toBe("panning");
  });

  it("should drag selected node", () => {
    let state = pointer_down(initial_state, {
      screen_position: vec2_create(10, 10),
      target_node_id: O.some("node_1"),
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: empty_modifiers,
    });
    state = pointer_move(state, {
      screen_position: vec2_create(20, 20),
      target_node_id: O.some("node_1"),
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: empty_modifiers,
    });
    expect(state.nodes["node_1"]?.position).toEqual(vec2_create(10, 10)); // Based on zoom=1

    state = pointer_up(state, {
      screen_position: vec2_create(20, 20),
      target_node_id: O.none,
      target_port_id: O.none,
      target_port_type: O.none,
      target_action: O.none,
      modifiers: empty_modifiers,
    });
    expect(state.interaction.mode).toBe("idle");
  });
});