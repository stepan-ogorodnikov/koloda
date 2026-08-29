import { describe, expect, it } from "vitest";
import { dispatchReducerAction } from "./utility";

describe("dispatchReducerAction", () => {
  it("dispatches a known action with its payload", () => {
    const actions = {
      add: (state: { count: number }, payload: { by: number }) => {
        state.count += payload.by;
      },
    };
    const state = { count: 1 };
    dispatchReducerAction(state, actions, ["add", { by: 2 }]);
    expect(state.count).toBe(3);
  });

  it("throws on an unknown action name instead of silently dropping it", () => {
    const actions = {
      add: (state: { count: number }) => {
        state.count += 1;
      },
    };
    const state = { count: 1 };
    expect(() => dispatchReducerAction(state, actions, ["remove", undefined] as never)).toThrow(
      "Unknown reducer action: remove",
    );
  });
});
