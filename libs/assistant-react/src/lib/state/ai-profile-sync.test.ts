import { describe, expect, it } from "vitest";
import { lastUsedOnRunStart, modelChangeSync, parameterChangeSync, profileChangeSync } from "./ai-profile-sync";

describe("ai-profile-sync", () => {
  it("lastUsedOnRunStart omits modelParameters so stored params are preserved", () => {
    expect(lastUsedOnRunStart("p1", "m1")).toEqual({ profileId: "p1", modelId: "m1" });
  });

  it("profile and model changes send empty modelParameters payloads", () => {
    expect(profileChangeSync("p2", "m2")).toEqual({
      conversation: { profileId: "p2", modelId: "m2", modelParameters: {} },
      global: { profileId: "p2", modelId: "m2", modelParameters: {} },
    });
    expect(modelChangeSync("p1", "m3")).toEqual({
      conversation: { modelId: "m3", modelParameters: {} },
      global: { profileId: "p1", modelId: "m3", modelParameters: {} },
    });
  });

  it("parameter changes patch a single key on the global record", () => {
    expect(parameterChangeSync("p1", "m1", "reasoning_effort", "high")).toEqual({
      conversation: { paramType: "reasoning_effort", value: "high" },
      global: {
        profileId: "p1",
        modelId: "m1",
        modelParameters: { reasoning_effort: "high" },
      },
    });
    expect(parameterChangeSync("p1", "m1", "reasoning_effort", null).global.modelParameters).toEqual({
      reasoning_effort: "",
    });
  });
});
