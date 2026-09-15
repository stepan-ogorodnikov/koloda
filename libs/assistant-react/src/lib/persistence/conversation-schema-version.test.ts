import { describe, expect, it } from "vitest";
import { CONVERSATION_SCHEMA_VERSION, migratePersistedConversation } from "./conversation-schema-version";

/** Returns the migrated row of an `ok` migration result, failing the test otherwise. */
function expectMigrated(value: unknown): Record<string, unknown> {
  const result = migratePersistedConversation(value);
  if (result.status !== "ok") {
    throw new Error(`expected migration result "ok", got ${JSON.stringify(result)}`);
  }
  return result.value;
}

describe("migratePersistedConversation", () => {
  it("passes a current-version row through and stamps the current version", () => {
    const migrated = expectMigrated({ id: "conv-1", schemaVersion: CONVERSATION_SCHEMA_VERSION });
    expect(migrated).toEqual({ id: "conv-1", schemaVersion: CONVERSATION_SCHEMA_VERSION });
  });

  it("treats a missing schemaVersion as v0 and migrates forward", () => {
    const migrated = expectMigrated({ id: "conv-1" });
    expect(migrated.schemaVersion).toBe(CONVERSATION_SCHEMA_VERSION);
  });

  it("treats an explicit schemaVersion 0 as v0 and migrates forward", () => {
    const migrated = expectMigrated({ id: "conv-1", schemaVersion: 0 });
    expect(migrated.schemaVersion).toBe(CONVERSATION_SCHEMA_VERSION);
  });

  it("classifies a future schemaVersion as unsupportedVersion with the declared number", () => {
    expect(migratePersistedConversation({ id: "conv-1", schemaVersion: CONVERSATION_SCHEMA_VERSION + 1 })).toEqual({
      status: "unsupportedVersion",
      found: CONVERSATION_SCHEMA_VERSION + 1,
    });
  });

  it("classifies non-object rows as invalid (not-an-object)", () => {
    expect(migratePersistedConversation(null)).toEqual({ status: "invalid", reason: "not-an-object" });
    expect(migratePersistedConversation("string")).toEqual({ status: "invalid", reason: "not-an-object" });
    expect(migratePersistedConversation([])).toEqual({ status: "invalid", reason: "not-an-object" });
  });

  it("classifies a malformed schemaVersion as invalid (malformed-version)", () => {
    expect(migratePersistedConversation({ schemaVersion: "2" })).toEqual({
      status: "invalid",
      reason: "malformed-version",
    });
    expect(migratePersistedConversation({ schemaVersion: 1.5 })).toEqual({
      status: "invalid",
      reason: "malformed-version",
    });
    expect(migratePersistedConversation({ schemaVersion: -1 })).toEqual({
      status: "invalid",
      reason: "malformed-version",
    });
  });

  it("heals legacy run termination reasons during v0→v1 migration", () => {
    const migrated = expectMigrated({
      id: "conv-1",
      runs: {
        r1: { status: "success", reason: "user" },
        r2: { status: "canceled" },
        r3: { status: "interrupted" },
      },
    });
    expect(migrated.runs).toEqual({
      r1: { status: "success" },
      r2: { status: "canceled", reason: "user" },
      r3: { status: "interrupted", reason: "crash_recovery" },
    });
  });

  it("leaves non-object run entries untouched and still stamps the version", () => {
    const migrated = expectMigrated({
      id: "conv-1",
      runs: { r1: "garbage" },
    });
    expect(migrated.runs).toEqual({ r1: "garbage" });
    expect(migrated.schemaVersion).toBe(CONVERSATION_SCHEMA_VERSION);
  });
});
