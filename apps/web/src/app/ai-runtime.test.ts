import { afterEach, describe, expect, it, vi } from "vitest";
import type { DB } from "@koloda/db-sqlite";
import { createWebAIRuntime } from "./ai-runtime";

vi.mock("./ai", () => ({
  loadAIProfileSecrets: async () => ({ provider: "openrouter", apiKey: "sk-or" }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("web AIRuntime listModels", () => {
  it("reports a failed model fetch with an AI error code", async () => {
    // Twin: `cmd_ai_list_models` wraps the same call in `wrapAIError` (apps/electron/src/ai-ipc.ts).
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await expect(createWebAIRuntime({} as DB).listModels("profile-1")).rejects.toMatchObject({ code: "ai.network" });
  });
});
