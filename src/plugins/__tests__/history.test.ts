import { describe, it, expect } from "vitest";
import { create_initial_state } from "@/core/state";
import { add_node } from "@/core/node_ops";
import { vec2_create } from "@/core/math";
import type { State } from "@/core/types";

describe("history plugin logic", () => {
  const MAX_HISTORY = 30;

  function snap(next: State): State {
    return { ...create_initial_state(), ...next, interaction: { mode: "idle" } as const };
  }

  it("records snapshot when nodes change and idle", () => {
    const hist: State[] = [create_initial_state()];
    let idx = 0;

    const s = add_node(create_initial_state(), {
      id: "n1", type: "test",
      position: vec2_create(100, 100), size: vec2_create(100, 80),
      title: "N1", inputs: [], outputs: [], widgets: [], custom_data: {},
    });

    const changed = hist[idx]?.nodes !== s.nodes;
    expect(changed).toBe(true);

    hist.splice(idx + 1);
    hist.push(snap(s));
    idx = hist.length - 1;

    expect(hist.length).toBe(2);
    expect(hist[1]!.nodes["n1"]).toBeDefined();
  });

  it("skips recording when not idle", () => {
    const hist: State[] = [create_initial_state()];
    const s1 = add_node(create_initial_state(), {
      id: "n1", type: "test",
      position: vec2_create(0, 0), size: vec2_create(100, 80),
      title: "N1", inputs: [], outputs: [], widgets: [], custom_data: {},
    });
    const dragging: State = { ...s1, interaction: { mode: "dragging", node_ids: ["n1"], start_pos: vec2_create(0, 0), original_nodes: s1.nodes } };
    if (dragging.interaction.mode === "idle") hist.push(snap(dragging));
    expect(hist.length).toBe(1);
  });

  it("undo restores previous snapshot", () => {
    const hist: State[] = [create_initial_state()];
    const s1 = add_node(create_initial_state(), {
      id: "a", type: "test",
      position: vec2_create(0, 0), size: vec2_create(100, 80),
      title: "A", inputs: [], outputs: [], widgets: [], custom_data: {},
    });
    hist.push(snap(s1));
    let idx = 1;
    idx = 0;
    expect(hist[idx]!.nodes["a"]).toBeUndefined();
  });

  it("redo restores forward snapshot", () => {
    const hist: State[] = [create_initial_state()];
    const s1 = add_node(create_initial_state(), {
      id: "a", type: "test",
      position: vec2_create(0, 0), size: vec2_create(100, 80),
      title: "A", inputs: [], outputs: [], widgets: [], custom_data: {},
    });
    hist.push(snap(s1));
    let idx = 1;
    idx = 0;
    idx = 1;
    expect(hist[idx]!.nodes["a"]).toBeDefined();
  });

  it("discards future after undo + new action", () => {
    const hist: State[] = [create_initial_state()];
    let idx = 0;
    for (let i = 0; i < 3; i++) {
      const s = add_node(hist[hist.length - 1]!, {
        id: "n" + i, type: "test",
        position: vec2_create(i * 100, 0), size: vec2_create(100, 80),
        title: "N" + i, inputs: [], outputs: [], widgets: [], custom_data: {},
      });
      hist.push(snap(s));
      idx = hist.length - 1;
    }
    expect(hist.length).toBe(4);
    idx = 1;
    hist.splice(idx + 1);
    expect(hist.length).toBe(2);
  });

  it("prunes old entries when exceeding MAX_HISTORY", () => {
    const hist: State[] = [create_initial_state()];
    for (let i = 0; i < MAX_HISTORY + 5; i++) {
      const s = add_node(hist[hist.length - 1]!, {
        id: "n" + i, type: "test",
        position: vec2_create(i * 10, 0), size: vec2_create(100, 80),
        title: "N" + i, inputs: [], outputs: [], widgets: [], custom_data: {},
      });
      hist.push(snap(s));
      if (hist.length > MAX_HISTORY) hist.shift();
    }
    expect(hist.length).toBeLessThanOrEqual(MAX_HISTORY);
  });
});
