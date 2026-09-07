import type { AIRuntime } from "@koloda/ai";
import { IDLE_SAVE_DEBOUNCE_MS } from "@koloda/assistant";
import type { Conversation, ConversationListItem, SetConversationData } from "@koloda/app";
import { aiRuntimeAtom, queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import * as React from "react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialConversationState } from "../state/conversation-reducer";
import type { ConversationReducerState } from "../state/conversation-reducer";
import { touchConversationAtom, upsertConversationAtom } from "../state/conversation-store";
import { ensureAssistantEngine } from "../runs/assistant-engine-instance";
import {
  ensureAssistantPersistenceHost,
  isAssistantPersistenceWriteAdapterReady,
  resetAssistantEngineForTests,
} from "../runs/assistant-persistence-host";
import { useConversationSaveHost } from "./use-conversation-save-host";

function makeConversation(id: string, overrides: Partial<ConversationReducerState> = {}): ConversationReducerState {
  return {
    ...initialConversationState,
    id,
    createdAt: new Date(1),
    messages: [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
        metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
      },
    ],
    ...overrides,
  };
}

function buildQueries(onWrite?: (id: string) => void): Queries {
  return {
    setConversationMutation: () => ({
      mutationFn: async (data: SetConversationData): Promise<Conversation> => {
        onWrite?.(data.id);
        return {
          id: data.id,
          title: data.title ?? null,
          state: data.state,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    }),
  } as unknown as Queries;
}

function createMockAIRuntime(): AIRuntime {
  return {
    listModels: async () => [],
    chat: async () => undefined,
  };
}

function createTestWrapper(onWrite?: (id: string) => void) {
  const store = createStore();
  store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries(onWrite));
  store.set(aiRuntimeAtom as unknown as Parameters<typeof store.set>[0], createMockAIRuntime());
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return {
    store,
    queryClient,
    Wrapper: function Wrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      );
    },
  };
}

describe("useConversationSaveHost", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetAssistantEngineForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetAssistantEngineForTests();
  });

  it("does not register during render; commits adapter in layout effect", () => {
    const renderChecks: boolean[] = [];
    function Probe() {
      renderChecks.push(isAssistantPersistenceWriteAdapterReady());
      useConversationSaveHost();
      return null;
    }

    const { Wrapper } = createTestWrapper();
    render(<Probe />, { wrapper: Wrapper });

    // Strict Mode may re-render after layout effect; the first render must stay unregistered.
    expect(renderChecks[0]).toBe(false);
    expect(isAssistantPersistenceWriteAdapterReady()).toBe(true);
  });

  it("title-stable autosave upserts the list cache without a refetch", async () => {
    const seededList: ConversationListItem[] = [
      { id: "A", title: "hello", createdAt: "2026-07-01T11:00:00.000Z", updatedAt: null, hasTurns: true },
    ];
    const { store, queryClient, Wrapper } = createTestWrapper();
    queryClient.setQueryData(queryKeys.conversations.all(), seededList);
    store.set(
      upsertConversationAtom,
      makeConversation("A", {
        messages: [
          {
            id: "user-r1",
            role: "user",
            parts: [{ type: "text", text: "hello" }],
            metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
          },
        ],
      }),
    );
    function Probe() {
      useConversationSaveHost();
      return null;
    }
    render(<Probe />, { wrapper: Wrapper });

    store.set(touchConversationAtom, "A");
    await vi.advanceTimersByTimeAsync(IDLE_SAVE_DEBOUNCE_MS);
    await Promise.resolve();
    await Promise.resolve();

    // WHY: the written row carries the same title, so the list cache must be
    // updated in place (new array reference) instead of invalidated.
    const list = queryClient.getQueryData<ConversationListItem[]>(queryKeys.conversations.all());
    expect(list).not.toBe(seededList);
    expect(list).toHaveLength(1);
    expect(list![0]!.id).toBe("A");
    expect(list![0]!.title).toBe("hello");
    expect(list![0]!.updatedAt).not.toBeNull();
    expect(list![0]!.hasTurns).toBe(true);
  });

  it("prompt title changes upsert the list cache title in place", async () => {
    const seededList: ConversationListItem[] = [
      {
        id: "A",
        title: "hello",
        createdAt: "2026-07-01T11:00:00.000Z",
        updatedAt: "2026-07-01T11:00:00.000Z",
        hasTurns: false,
      },
    ];
    const { store, queryClient, Wrapper } = createTestWrapper();
    queryClient.setQueryData(queryKeys.conversations.all(), seededList);
    store.set(
      upsertConversationAtom,
      makeConversation("A", {
        messages: [],
        activeRunId: null,
        promptInput: "hello world",
      }),
    );
    function Probe() {
      useConversationSaveHost();
      return null;
    }
    render(<Probe />, { wrapper: Wrapper });

    store.set(touchConversationAtom, "A");
    await vi.advanceTimersByTimeAsync(IDLE_SAVE_DEBOUNCE_MS);
    await Promise.resolve();
    await Promise.resolve();

    const list = queryClient.getQueryData<ConversationListItem[]>(queryKeys.conversations.all());
    expect(list).not.toBe(seededList);
    expect(list).toHaveLength(1);
    expect(list![0]!.id).toBe("A");
    expect(list![0]!.title).toBe("hello world");
    expect(list![0]!.hasTurns).toBe(false);
  });

  it("first submitted turn flips hasTurns on the list cache without a refetch", async () => {
    const seededList: ConversationListItem[] = [
      {
        id: "A",
        title: "hello",
        createdAt: "2026-07-01T11:00:00.000Z",
        updatedAt: "2026-07-01T11:00:00.000Z",
        hasTurns: false,
      },
    ];
    const { store, queryClient, Wrapper } = createTestWrapper();
    queryClient.setQueryData(queryKeys.conversations.all(), seededList);
    store.set(
      upsertConversationAtom,
      makeConversation("A", {
        messages: [
          {
            id: "user-r1",
            role: "user",
            parts: [{ type: "text", text: "hello" }],
            metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
          },
        ],
      }),
    );
    function Probe() {
      useConversationSaveHost();
      return null;
    }
    render(<Probe />, { wrapper: Wrapper });

    store.set(touchConversationAtom, "A");
    await vi.advanceTimersByTimeAsync(IDLE_SAVE_DEBOUNCE_MS);
    await Promise.resolve();
    await Promise.resolve();

    const list = queryClient.getQueryData<ConversationListItem[]>(queryKeys.conversations.all());
    expect(list).not.toBe(seededList);
    expect(list![0]!.hasTurns).toBe(true);
    expect(list![0]!.title).toBe("hello");
  });

  it("unregisters on unmount", () => {
    const { Wrapper } = createTestWrapper();
    const { unmount } = renderHook(() => useConversationSaveHost(), { wrapper: Wrapper });

    expect(isAssistantPersistenceWriteAdapterReady()).toBe(true);
    unmount();
    expect(isAssistantPersistenceWriteAdapterReady()).toBe(false);
  });

  it("replacement host wins and prior unmount does not clear the current adapter", () => {
    const { Wrapper } = createTestWrapper();
    const first = renderHook(() => useConversationSaveHost(), { wrapper: Wrapper });
    const second = renderHook(() => useConversationSaveHost(), { wrapper: Wrapper });

    expect(isAssistantPersistenceWriteAdapterReady()).toBe(true);
    first.unmount();
    expect(isAssistantPersistenceWriteAdapterReady()).toBe(true);

    second.unmount();
    expect(isAssistantPersistenceWriteAdapterReady()).toBe(false);
  });

  it("survives React Strict Mode double mount", async () => {
    const writes: string[] = [];
    const { store, Wrapper } = createTestWrapper((id) => writes.push(id));
    store.set(upsertConversationAtom, makeConversation("A"));

    render(
      <React.StrictMode>
        <ProbeHost />
      </React.StrictMode>,
      { wrapper: Wrapper },
    );

    expect(isAssistantPersistenceWriteAdapterReady()).toBe(true);

    ensureAssistantEngine(store);
    ensureAssistantPersistenceHost(store);
    store.set(touchConversationAtom, "A");
    await vi.advanceTimersByTimeAsync(IDLE_SAVE_DEBOUNCE_MS);
    await Promise.resolve();
    await Promise.resolve();
    expect(writes).toEqual(["A"]);
  });
});

function ProbeHost() {
  useConversationSaveHost();
  return null;
}
