import { describe, expect, it } from "vitest";
import { createRunControllerRegistry } from "./run-controller-registry";

describe("createRunControllerRegistry", () => {
  it("dispose seals beginRun", () => {
    const registry = createRunControllerRegistry();
    const controller = registry.beginRun("run-1");
    expect(controller.signal.aborted).toBe(false);

    registry.dispose();
    expect(registry.isClosed).toBe(true);
    expect(controller.signal.aborted).toBe(true);
    expect(() => registry.beginRun("run-2")).toThrow(/closed/);
  });
});
