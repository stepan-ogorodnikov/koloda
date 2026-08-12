import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  logAssistantStructured,
  resetAssistantStructuredLogger,
  setAssistantStructuredLogger,
  type AssistantStructuredLog,
} from "./assistant-observability";
import { createConversationPersistenceHost } from "./conversation-persistence-host";
import { createConversationSaveQueue } from "./create-conversation-save-queue";

describe("assistant structured observability", () => {
  const entries: AssistantStructuredLog[] = [];

  beforeEach(() => {
    entries.length = 0;
    vi.useFakeTimers();
    setAssistantStructuredLogger((entry) => {
      entries.push(entry);
    });
  });

  afterEach(() => {
    resetAssistantStructuredLogger();
    vi.useRealTimers();
  });

  it("logs saveStart and saveAck for a successful flush", async () => {
    const write = vi.fn(async () => true);
    const queue = createConversationSaveQueue({
      conversationId: "conv-1",
      write,
      isStreaming: () => false,
    });

    queue.notifyDirty();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conversationId: "conv-1",
          commandOrEvent: "saveStart",
          saveGeneration: 1,
        }),
        expect.objectContaining({
          conversationId: "conv-1",
          commandOrEvent: "saveAck",
          saveGeneration: 1,
        }),
      ]),
    );
    queue.dispose();
  });

  it("logs saveFailed without saveAck when a write throws", async () => {
    const write = vi.fn(async () => {
      throw new Error("db down");
    });
    const queue = createConversationSaveQueue({
      conversationId: "conv-2",
      write,
      isStreaming: () => false,
      random: () => 0,
    });

    queue.notifyDirty();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ commandOrEvent: "saveStart", saveGeneration: 1 }),
        expect.objectContaining({
          commandOrEvent: "saveFailed",
          saveGeneration: 1,
          retryAttempt: 1,
        }),
      ]),
    );
    expect(entries.some((entry) => entry.commandOrEvent === "saveAck")).toBe(false);
    queue.dispose();
  });

  it("logs deleteBegin, deleteCommit, and deleteRollback from the persistence host", async () => {
    let releaseWrite!: () => void;
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const host = createConversationPersistenceHost({
      createWrite: () => async () => {
        await writeGate;
        return true;
      },
      isStreaming: () => false,
      getInitialPending: () => ({ A: 1 }),
      subscribePendingSaves: () => () => {},
    });

    host.flushAllNow();
    await vi.advanceTimersByTimeAsync(0);

    const begin = host.beginDelete("A");
    await Promise.resolve();
    expect(entries).toContainEqual(expect.objectContaining({ conversationId: "A", commandOrEvent: "deleteBegin" }));

    releaseWrite();
    const deletion = await begin;

    deletion.rollback();
    expect(entries).toContainEqual(expect.objectContaining({ conversationId: "A", commandOrEvent: "deleteRollback" }));

    const committed = await host.beginDelete("A");
    committed.commit();
    expect(entries).toContainEqual(expect.objectContaining({ conversationId: "A", commandOrEvent: "deleteCommit" }));

    host.dispose();
  });

  it("exposes setAssistantStructuredLogger for tests", () => {
    logAssistantStructured({ conversationId: "probe", commandOrEvent: "probe" });
    expect(entries).toEqual([{ conversationId: "probe", commandOrEvent: "probe" }]);
  });
});
