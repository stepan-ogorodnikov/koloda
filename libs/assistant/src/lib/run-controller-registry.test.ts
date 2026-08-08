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

  it("records abort provenance for cancel and dispose", () => {
    const registry = createRunControllerRegistry();
    const userRun = registry.beginRun("user-run");
    const shutdownRun = registry.beginRun("shutdown-run");

    registry.cancel("user-run", "user");
    expect(userRun.signal.aborted).toBe(true);
    expect(registry.takeAbortReason("user-run")).toBe("user");
    expect(registry.takeAbortReason("user-run")).toBeUndefined();

    registry.dispose("app_shutdown");
    expect(shutdownRun.signal.aborted).toBe(true);
    expect(registry.takeAbortReason("shutdown-run")).toBe("app_shutdown");
  });

  it("beginRun clears stale abort provenance for a reused runId", () => {
    const registry = createRunControllerRegistry();
    registry.beginRun("run-1");
    registry.cancel("run-1", "user");
    registry.beginRun("run-1");
    expect(registry.takeAbortReason("run-1")).toBeUndefined();
  });
});
