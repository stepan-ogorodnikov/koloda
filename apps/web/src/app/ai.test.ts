import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DB } from "@koloda/db-sqlite";
import { addAIProfile, updateAIProfile } from "./ai";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

// WHY: The host adapter under test owns validation and merge order; the SQL layer
// has its own integration suite. A Map-backed store keeps those concerns separate.
vi.mock("@koloda/db-sqlite", () => ({
  getSettings: async (_db: unknown, name: string) => {
    const content = store.get(name);
    return content === undefined ? null : { name, content };
  },
  setSettings: async (_db: unknown, row: { name: string; content: unknown }) => {
    store.set(row.name, row.content);
    return row;
  },
}));

const PROFILE_ID = "01900000-0000-7000-8000-000000000001";
const CREATED_AT = "2026-01-01T00:00:00.000Z";

function seedAiSettings(profiles: unknown[]) {
  store.set("ai", { profiles });
}

function storedProfiles(): Array<Record<string, unknown>> {
  const content = store.get("ai") as { profiles: Array<Record<string, unknown>> };
  return content.profiles;
}

describe("web AI profile save path", () => {
  beforeEach(() => {
    store.clear();
  });

  it("rejects a blank required apiKey on create and persists nothing", async () => {
    await expect(
      addAIProfile({} as DB, { title: "OpenRouter", secrets: { provider: "openrouter", apiKey: "" } }),
    ).rejects.toMatchObject({ name: "AppError", code: "validation.settings-ai.providers.api-key" });
    expect(store.has("ai")).toBe(false);
  });

  it("rejects a null required apiKey on create", async () => {
    await expect(addAIProfile({} as DB, { secrets: { provider: "openrouter", apiKey: null } })).rejects.toMatchObject({
      code: "validation.settings-ai.providers.api-key",
    });
  });

  it("persists a keyed profile with hasSecrets derived from the sent key", async () => {
    // WHY: Web keeps the usable key in the settings row (no keyring) and redacts
    // on public reads — assert the stored form, not the redacted public one.
    await addAIProfile({} as DB, { title: "OR", secrets: { provider: "openrouter", apiKey: "sk-or" } });
    expect(storedProfiles()).toHaveLength(1);
    expect(storedProfiles()[0]).toMatchObject({
      secrets: { provider: "openrouter", apiKey: "sk-or" },
      hasSecrets: true,
    });
  });

  it("accepts an ollama profile without an apiKey on create", async () => {
    await expect(
      addAIProfile({} as DB, { secrets: { provider: "ollama", baseUrl: "http://localhost:11434" } }),
    ).resolves.toBeUndefined();
  });

  it("rejects a blank apiKey on update and leaves the stored profile unchanged", async () => {
    seedAiSettings([
      {
        id: PROFILE_ID,
        title: "OpenRouter",
        secrets: { provider: "openrouter", apiKey: "sk-or" },
        hasSecrets: true,
        createdAt: CREATED_AT,
      },
    ]);

    await expect(
      updateAIProfile({} as DB, { id: PROFILE_ID, secrets: { provider: "openrouter", apiKey: "  " } }),
    ).rejects.toMatchObject({ code: "validation.settings-ai.providers.api-key" });

    expect(storedProfiles()[0]?.secrets).toEqual({ provider: "openrouter", apiKey: "sk-or" });
  });

  it("keeps the stored key when an ollama edit omits the apiKey", async () => {
    seedAiSettings([
      {
        id: PROFILE_ID,
        title: "Local",
        secrets: { provider: "ollama", baseUrl: "http://localhost:11434", apiKey: "local-key" },
        hasSecrets: true,
        createdAt: CREATED_AT,
      },
    ]);

    await updateAIProfile({} as DB, {
      id: PROFILE_ID,
      secrets: { provider: "ollama", baseUrl: "http://127.0.0.1:11434", apiKey: "" },
    });

    expect(storedProfiles()[0]?.secrets).toEqual({
      provider: "ollama",
      baseUrl: "http://127.0.0.1:11434",
      apiKey: "local-key",
    });
  });
});
