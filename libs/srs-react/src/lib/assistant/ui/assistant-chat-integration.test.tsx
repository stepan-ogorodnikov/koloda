import type {
  AIModel,
  AIProfile,
  AIRuntime,
  ChatStreamRequest,
  GeneratedCard,
  ModelParameter,
  StreamUsage,
} from "@koloda/ai";
import type * as KolodaAiReactModule from "@koloda/ai-react";
import type { CardGenerationStreamRequest } from "@koloda/ai-react";
import { aiRuntimeAtom, queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import type { Template } from "@koloda/srs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider, useAtomValue } from "jotai";
import * as React from "react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAIModel, createAIProfile, createTemplate } from "../../../test/test-helpers";
import { CONVERSATION_SCHEMA_VERSION } from "../persistence/conversation-schema-version";
import {
  conversationsAtom,
  setCurrentConversationIdAtom,
  touchConversationAtom,
  upsertConversationAtom,
  blockedConversationRestoreAtom,
} from "../state/conversation-store";
import type { ConversationReducerState } from "../state/conversation-reducer";
import { initialConversationState } from "../state/conversation-reducer";
import { getAssistantEngine, resetAssistantEngineForTests } from "../runs/use-assistant-engine-host";
import { AssistantConversationRecovery } from "./assistant-conversation-recovery";
import {
  useAssistantAppShellHosts,
  useAssistantChatSessionHarness,
  useAssistantChatTestHarness,
} from "./assistant-chat-test-harness";
import { useConversationPersistence } from "../persistence/use-conversation-persistence";
import type { RunController } from "../runs/run-controller";

type PendingChat = {
  resolve: (usage: StreamUsage | undefined) => void;
  reject: (error: Error) => void;
};

/**
 * Module-level "wire" used by the mocked AIRuntime and the test code to
 * coordinate stream lifecycle and error injection.
 */
const wire = vi.hoisted(() => {
  return {
    profiles: [] as AIProfile[],
    models: [] as AIModel[],
    template: { id: 1 } as Template,
    // Stream controls — AIRuntime.chat/generateCards read these.
    chatStream: {
      started: 0,
      onChunk: null as null | ((chunk: string) => void),
      onStart: null as null | ((request: ChatStreamRequest, onChunk: (chunk: string) => void) => void),
      // Deferred promise controls for concurrent in-flight chats.
      pending: [] as PendingChat[],
      resolveNext: null as null | (() => void),
      rejectNext: null as null | ((error: Error) => void),
      keepInFlight: false,
    },
    cardStream: {
      started: 0,
      onCard: null as null | ((card: GeneratedCard) => void),
      onStart: null as null | ((request: CardGenerationStreamRequest, onCard: (card: GeneratedCard) => void) => void),
      abortNext: false,
    },
    // Save mutation spy. The `state` payload is the full serialized
    // ConversationReducerState — tests that need to assert on the run status
    // (e.g. the pagehide-cancellation test) inspect this field.
    setConversationCalls: [] as Array<{
      id: string;
      title: string | null;
      state: { runs: Record<string, { status: string }> } | null;
    }>,
  };
});

vi.mock("@koloda/ai-react", async () => {
  const actual = await vi.importActual<typeof KolodaAiReactModule>("@koloda/ai-react");
  return {
    ...actual,
    useAIProfiles: (profileId?: string | null) => {
      const profile = wire.profiles[0] ?? null;
      const selectedProfile = profileId ? profile : null;
      return {
        profiles: wire.profiles,
        isLoading: false,
        isError: false,
        defaultProfileId: profile?.id ?? null,
        selectedProfile,
        missingSecretFieldLabels: [],
      };
    },
    useAIModels: (_credentialId: string | null) => ({
      models: wire.models,
      isLoading: false,
      isError: false,
    }),
  };
});

vi.mock("./use-assistant-profile-selection", () => {
  // Re-export a thin shim that reads from the same `wire` used by the
  // mock of `@koloda/ai-react`. The shim mirrors the public shape of
  // `useAssistantProfileSelection` exactly.
  return {
    useAssistantProfileSelection: () => {
      const profile = wire.profiles[0] ?? null;
      return {
        profileId: profile?.id ?? "",
        modelId: wire.models[0]?.id ?? "",
        modelName: wire.models[0]?.name,
        models: wire.models,
        isModelsLoading: false,
        isModelsError: false,
        selectedProfile: profile,
        profiles: wire.profiles,
        defaultProfileId: profile?.id ?? null,
        missingSecretFieldLabels: [] as string[],
        provider: profile?.secrets?.provider ?? null,
        modelParameters: [] as ModelParameter[],
        hasProfiles: wire.profiles.length > 0,
        handleModelProfileChange: () => {},
        handleModelParameterChange: () => {},
      };
    },
  };
});

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
}));

function buildQueries(): Queries {
  return {
    getSettingsQuery: (name) => ({
      queryKey: queryKeys.settings.detail(name),
      queryFn: async () => ({
        content: { assistant: { temperature: 0.2, cardsPromptTemplate: null, chatPromptTemplate: null } },
      }),
    }),
    setSettingsMutation: () => ({ mutationFn: async () => undefined }),
    patchSettingsMutation: () => ({ mutationFn: async () => undefined }),
    getConversationQuery: (id: string) => ({
      queryKey: queryKeys.conversations.detail(id),
      queryFn: async () => ({
        id,
        title: null,
        state: { ...initialConversationState, id, createdAt: new Date(1).toISOString() },
        createdAt: new Date(1).toISOString(),
        updatedAt: null,
      }),
    }),
    getConversationsQuery: () => ({
      queryKey: queryKeys.conversations.all(),
      queryFn: async () => [],
    }),
    setConversationMutation: () => ({
      mutationFn: async (data: { id: string; title?: string | null }) => {
        wire.setConversationCalls.push({
          id: data.id,
          title: data.title ?? null,
          state: (data.state as { runs: Record<string, { status: string }> } | undefined) ?? null,
        });
        return {
          id: data.id,
          title: data.title ?? null,
          state: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      },
    }),
    deleteConversationMutation: () => ({ mutationFn: async () => undefined }),
    getAlgorithmsQuery: () => ({ queryKey: queryKeys.algorithms.all(), queryFn: async () => [] }),
    getAlgorithmQuery: (id) => ({ queryKey: queryKeys.algorithms.detail(id), queryFn: async () => null }),
    addAlgorithmMutation: () => ({ mutationFn: async () => undefined }),
    cloneAlgorithmMutation: () => ({ mutationFn: async () => undefined }),
    updateAlgorithmMutation: () => ({ mutationFn: async () => undefined }),
    deleteAlgorithmMutation: () => ({ mutationFn: async () => undefined }),
    getAlgorithmDecksQuery: (id) => ({ queryKey: queryKeys.algorithms.decks(id), queryFn: async () => [] }),
    getDecksQuery: () => ({ queryKey: queryKeys.decks.all(), queryFn: async () => [] }),
    getDeckQuery: (id: number) => ({
      queryKey: queryKeys.decks.detail(id),
      queryFn: async () => ({
        id,
        title: "Test deck",
        algorithmId: 1,
        templateId: wire.template.id,
        createdAt: new Date(1).toISOString(),
        updatedAt: null,
      }),
    }),
    addDeckMutation: () => ({ mutationFn: async () => undefined }),
    updateDeckMutation: () => ({ mutationFn: async () => undefined }),
    deleteDeckMutation: () => ({ mutationFn: async () => undefined }),
    getTemplatesQuery: () => ({ queryKey: queryKeys.templates.all(), queryFn: async () => [wire.template] }),
    getTemplateQuery: (id) => ({
      queryKey: queryKeys.templates.detail(id),
      queryFn: async () => wire.template,
    }),
    addTemplateMutation: () => ({ mutationFn: async () => undefined }),
    cloneTemplateMutation: () => ({ mutationFn: async () => undefined }),
    updateTemplateMutation: () => ({ mutationFn: async () => undefined }),
    deleteTemplateMutation: () => ({ mutationFn: async () => undefined }),
    getTemplateDecksQuery: (data) => ({
      queryKey: queryKeys.templates.decks(data.id),
      queryFn: async () => [],
    }),
    getCardsQuery: (params) => ({ queryKey: queryKeys.cards.deck(params), queryFn: async () => [] }),
    addCardMutation: () => ({ mutationFn: async () => undefined }),
    addCardsMutation: () => ({ mutationFn: async () => ({ insertedIds: [] }) }),
    updateCardMutation: () => ({ mutationFn: async () => undefined }),
    deleteCardMutation: () => ({ mutationFn: async () => undefined }),
    deleteCardsMutation: () => ({ mutationFn: async () => undefined }),
    resetCardProgressMutation: () => ({ mutationFn: async () => undefined }),
    getLessonsQuery: (filters) => ({
      queryKey: queryKeys.lessons.all(filters),
      queryFn: async () => ({ total: { untouched: 0, learn: 0, review: 0, total: 0 }, decks: [] }),
    }),
    getTodayReviewTotalsQuery: () => ({
      queryKey: queryKeys.lessons.todayReviewTotals(),
      queryFn: async () => undefined,
    }),
    getLessonDataQuery: (params) => ({
      queryKey: queryKeys.lessons.data(params),
      queryFn: async () => null,
    }),
    submitLessonResultMutation: () => ({ mutationFn: async () => undefined }),
    getReviewsQuery: (data) => ({ queryKey: queryKeys.reviews.card(data), queryFn: async () => [] }),
    addAIProfileMutation: () => ({ mutationFn: async () => undefined }),
    updateAIProfileMutation: () => ({ mutationFn: async () => undefined }),
    removeAIProfileMutation: () => ({ mutationFn: async () => undefined }),
    getAIProfileModelsQuery: (profileId: string) => ({
      queryKey: queryKeys.ai.models(profileId),
      queryFn: async () => wire.models,
    }),
    getAIProfilesQuery: () => ({
      queryKey: queryKeys.ai.profiles(),
      queryFn: async () => wire.profiles,
    }),
  };
}

function makeConversation(id: string, overrides: Partial<ConversationReducerState> = {}): ConversationReducerState {
  return {
    ...initialConversationState,
    id,
    createdAt: new Date(1),
    ...overrides,
  };
}

function createMockAIRuntime(): AIRuntime {
  return {
    listModels: async () => wire.models,
    chat: async (_profileId, request, onChunk, abortSignal) => {
      wire.chatStream.started += 1;
      wire.chatStream.onChunk = onChunk;
      wire.chatStream.onStart?.(request, onChunk);

      if (!wire.chatStream.keepInFlight) return undefined;

      return await new Promise<StreamUsage | undefined>((resolve, reject) => {
        const entry: PendingChat = { resolve, reject };
        wire.chatStream.pending.push(entry);
        // WHY: resolve/reject the oldest pending stream (FIFO) so tests that
        // start one stream and later resolveNext still work; rejectNext pops
        // the newest so an error lands on the latest armed run.
        wire.chatStream.resolveNext = () => {
          const next = wire.chatStream.pending.shift();
          next?.resolve(undefined);
        };
        wire.chatStream.rejectNext = (error: Error) => {
          const next = wire.chatStream.pending.pop();
          next?.reject(error);
        };

        if (abortSignal.aborted) {
          wire.chatStream.pending = wire.chatStream.pending.filter((p) => p !== entry);
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        abortSignal.addEventListener(
          "abort",
          () => {
            wire.chatStream.pending = wire.chatStream.pending.filter((p) => p !== entry);
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      });
    },
    generateCards: async (_profileId, request) => {
      wire.cardStream.started += 1;
      wire.cardStream.onCard = request.onCard ?? null;
      wire.cardStream.onStart?.(
        {
          input: request.input,
          messages: request.messages,
          systemPromptTemplate: request.systemPromptTemplate,
        },
        request.onCard ?? (() => {}),
      );
      if (wire.cardStream.abortNext) {
        throw new DOMException("Aborted", "AbortError");
      }
      const signal = request.abortSignal;
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
    },
  };
}

function makeWrapper() {
  const store = createStore();
  store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
  store.set(aiRuntimeAtom, createMockAIRuntime());
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // Preload the templates query cache so the template is available synchronously.
  queryClient.setQueryData(queryKeys.templates.detail(wire.template.id), wire.template);

  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>{children}</JotaiProvider>
      </QueryClientProvider>
    );
  };
}

function setupTestHarness(overrides: { profileId?: string; modelId?: string } = {}) {
  const profile = createAIProfile(overrides.profileId ? { id: overrides.profileId } : {});
  const model = createAIModel(overrides.modelId ? { id: overrides.modelId } : {});
  const template = createTemplate();

  // Reset wire between tests.
  wire.profiles = [profile];
  wire.models = [model];
  wire.template = template;
  wire.chatStream = {
    started: 0,
    onChunk: null,
    onStart: null,
    pending: [],
    resolveNext: null,
    rejectNext: null,
    keepInFlight: false,
  };
  wire.cardStream = { started: 0, onCard: null, onStart: null, abortNext: false };
  wire.setConversationCalls = [];

  const wrapper = makeWrapper();
  const store = (wrapper as unknown as { store?: never }).store;

  // The store is created inside makeWrapper; we expose it for tests that
  // need to drive the atoms directly. We do that by re-creating it here
  // and sharing the same instance.
  return { wrapper, store };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetAssistantEngineForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  resetAssistantEngineForTests();
});

describe("assistant chat integration (per-conversation state)", () => {
  it("handleStreamError: two streams in flight on different conversations, one errors, error routes to the right conversation", async () => {
    setupTestHarness();
    const store = createStore();
    store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
    store.set(aiRuntimeAtom, createMockAIRuntime());
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(upsertConversationAtom, makeConversation("B"));
    store.set(setCurrentConversationIdAtom, "A");

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(queryKeys.templates.detail(wire.template.id), wire.template);

    wire.chatStream.keepInFlight = true;

    function TestWrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      );
    }

    const onConversationIdChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ conversationId }: { conversationId: string | undefined }) =>
        useAssistantChatTestHarness({ conversationId, onConversationIdChange }),
      {
        wrapper: TestWrapper,
        initialProps: { conversationId: "A" as string | undefined },
      },
    );

    // Start a chat run on A. The mock keeps it in flight.
    await act(async () => {
      // Fire and forget — the promise never resolves.
      void result.current.controller.submit("Hello from A");
      await Promise.resolve();
    });

    // Switch to B and start a chat run on B.
    rerender({ conversationId: "B" });
    await act(async () => {
      store.set(setCurrentConversationIdAtom, "B");
      void result.current.controller.submit("Hello from B");
      await Promise.resolve();
    });

    // Both streams were started.
    expect(wire.chatStream.started).toBe(2);

    expect(wire.chatStream.rejectNext).not.toBeNull();
    await act(async () => {
      wire.chatStream.rejectNext!(new Error("stream blew up"));
    });

    // B's most recent run is failed with the error message.
    const stateB = store.get(conversationsAtom)["B"];
    const bRunIds = Object.keys(stateB.runs);
    const bLatestRun = stateB.runs[bRunIds[bRunIds.length - 1]!];
    expect(bLatestRun.status).toBe("failed");
    expect(bLatestRun.error).toEqual({ message: "stream blew up" });

    // A is unaffected — A's run is still streaming, and A's runs have no
    // error attached.
    const stateA = store.get(conversationsAtom)["A"];
    for (const run of Object.values(stateA.runs)) {
      expect(run.status).not.toBe("failed");
      expect(run.error).toBeUndefined();
    }
  });

  it("a chunk emitted after conversationId has changed still updates the originating conversation", async () => {
    setupTestHarness();
    const store = createStore();
    store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
    store.set(aiRuntimeAtom, createMockAIRuntime());
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(upsertConversationAtom, makeConversation("B"));
    store.set(setCurrentConversationIdAtom, "A");

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(queryKeys.templates.detail(wire.template.id), wire.template);

    function TestWrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      );
    }

    // Configure the chat stream to emit a chunk mid-flight, but only after
    // the test has had a chance to switch the current conversation to B.
    // We use a deferred promise (keepInFlight) so the stream stays in
    // flight until we resolve it after emitting the chunks.
    wire.chatStream.keepInFlight = true;
    wire.chatStream.onStart = (_request, onChunk) => {
      // Defer the chunk emission until after the test switches to B.
      setTimeout(() => {
        onChunk("late chunk");
        onChunk(" second chunk");
      }, 100);
    };

    const onConversationIdChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ conversationId }: { conversationId: string | undefined }) =>
        useAssistantChatTestHarness({ conversationId, onConversationIdChange }),
      {
        wrapper: TestWrapper,
        initialProps: { conversationId: "A" as string | undefined },
      },
    );

    let chatPromise!: Promise<void>;
    await act(async () => {
      chatPromise = result.current.controller.submit("Hello from A") as unknown as Promise<void>;
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    // Switch to B before the chat promise resolves.
    rerender({ conversationId: "B" });

    // Now resolve the chat stream so the run completes.
    await act(async () => {
      wire.chatStream.resolveNext?.();
      await chatPromise;
    });

    // The chunk landed on A, not on B (the current conversation).
    const stateA = store.get(conversationsAtom)["A"];
    const stateB = store.get(conversationsAtom)["B"];
    const aAssistant = stateA.messages.find((m) => m.role === "assistant");
    expect(aAssistant).toBeDefined();
    expect(aAssistant?.parts[0]).toEqual({ type: "text", text: "late chunk second chunk" });
    expect(stateB.messages.find((m) => m.role === "assistant")).toBeUndefined();
  });

  it("save host: dirtying A while viewing B schedules a save for A", async () => {
    setupTestHarness();
    const store = createStore();
    store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
    store.set(aiRuntimeAtom, createMockAIRuntime());
    store.set(
      upsertConversationAtom,
      makeConversation("A", {
        messages: [
          {
            id: "user-r1",
            role: "user",
            parts: [{ type: "text", text: "Hello from A" }],
            metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
          },
        ],
      }),
    );
    store.set(
      upsertConversationAtom,
      makeConversation("B", {
        messages: [
          {
            id: "user-r1",
            role: "user",
            parts: [{ type: "text", text: "Hello from B" }],
            metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
          },
        ],
      }),
    );
    store.set(setCurrentConversationIdAtom, "B");

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(queryKeys.templates.detail(wire.template.id), wire.template);
    queryClient.setQueryData(queryKeys.conversations.detail("A"), {
      id: "A",
      title: null,
      state: { ...initialConversationState, id: "A", createdAt: new Date(1).toISOString() },
      createdAt: new Date(1).toISOString(),
      updatedAt: null,
    });
    queryClient.setQueryData(queryKeys.conversations.detail("B"), {
      id: "B",
      title: null,
      state: { ...initialConversationState, id: "B", createdAt: new Date(1).toISOString() },
      createdAt: new Date(1).toISOString(),
      updatedAt: null,
    });

    function TestWrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      );
    }

    const onConversationIdChange = vi.fn();
    renderHook(() => useAssistantChatTestHarness({ conversationId: "B", onConversationIdChange }), {
      wrapper: TestWrapper,
    });

    // Allow restore's initial touch for B to settle, then clear save calls.
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    wire.setConversationCalls = [];

    // Dirty A in the background while B is the viewed conversation.
    await act(async () => {
      store.set(touchConversationAtom, "A");
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    const savesForA = wire.setConversationCalls.filter((c) => c.id === "A");
    expect(savesForA.length).toBeGreaterThanOrEqual(1);
    expect(wire.setConversationCalls.every((c) => c.id === "A")).toBe(true);
  });

  it("save throttler: bumps on A do not trigger saves for B and vice-versa", async () => {
    setupTestHarness();
    const store = createStore();
    store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
    store.set(aiRuntimeAtom, createMockAIRuntime());
    store.set(
      upsertConversationAtom,
      makeConversation("A", {
        messages: [
          {
            id: "user-r1",
            role: "user",
            parts: [{ type: "text", text: "Hello" }],
            metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
          },
        ],
      }),
    );
    store.set(
      upsertConversationAtom,
      makeConversation("B", {
        messages: [
          {
            id: "user-r1",
            role: "user",
            parts: [{ type: "text", text: "Different" }],
            metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
          },
        ],
      }),
    );
    store.set(setCurrentConversationIdAtom, "A");

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(queryKeys.templates.detail(wire.template.id), wire.template);
    // Pre-populate the conversation query cache so the restore effect
    // doesn't wait on a loading query.
    queryClient.setQueryData(queryKeys.conversations.detail("A"), {
      id: "A",
      title: null,
      state: { ...initialConversationState, id: "A", createdAt: new Date(1).toISOString() },
      createdAt: new Date(1).toISOString(),
      updatedAt: null,
    });
    queryClient.setQueryData(queryKeys.conversations.detail("B"), {
      id: "B",
      title: null,
      state: { ...initialConversationState, id: "B", createdAt: new Date(1).toISOString() },
      createdAt: new Date(1).toISOString(),
      updatedAt: null,
    });

    function TestWrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      );
    }

    const onConversationIdChange = vi.fn();
    const { rerender } = renderHook(
      ({ conversationId }: { conversationId: string | undefined }) =>
        useAssistantChatTestHarness({ conversationId, onConversationIdChange }),
      {
        wrapper: TestWrapper,
        initialProps: { conversationId: "A" as string | undefined },
      },
    );

    // Let restore settle, then isolate save-counter bumps.
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    wire.setConversationCalls = [];

    // Bump the save counter for A a few times.
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        store.set(touchConversationAtom, "A");
      });
    }

    // Switch to B and bump its save counter.
    rerender({ conversationId: "B" });
    await act(async () => {
      store.set(setCurrentConversationIdAtom, "B");
      store.set(touchConversationAtom, "B");
    });

    // Allow the idle-save debounce to fire for both queues.
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // Route-scoped host keeps both queues alive: A and B may both save, but
    // never cross-contaminate ids.
    expect(wire.setConversationCalls.length).toBeGreaterThanOrEqual(1);
    const ids = new Set(wire.setConversationCalls.map((c) => c.id));
    for (const id of ids) {
      expect(["A", "B"]).toContain(id);
    }
    expect(wire.setConversationCalls.some((c) => c.id === "B")).toBe(true);
  });

  it("throttled save during a streaming run persists the run as streaming", async () => {
    setupTestHarness();
    const store = createStore();
    store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
    store.set(aiRuntimeAtom, createMockAIRuntime());
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(setCurrentConversationIdAtom, "A");

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(queryKeys.templates.detail(wire.template.id), wire.template);
    queryClient.setQueryData(queryKeys.conversations.detail("A"), {
      id: "A",
      title: null,
      state: { ...initialConversationState, id: "A", createdAt: new Date(1).toISOString() },
      createdAt: new Date(1).toISOString(),
      updatedAt: null,
    });

    function TestWrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      );
    }

    // Keep the chat stream in flight so the run stays in "streaming"
    // status while the throttled save fires.
    wire.chatStream.keepInFlight = true;

    const onConversationIdChange = vi.fn();
    const { result } = renderHook(() => useAssistantChatTestHarness({ conversationId: "A", onConversationIdChange }), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      void result.current.controller.submit("Hello from A");
      await Promise.resolve();
    });

    // Advance the throttled save's timer past the streaming window
    // (1000ms) so it fires and dispatches a save.
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });

    // A save was issued.
    expect(wire.setConversationCalls.length).toBeGreaterThanOrEqual(1);
    const persisted = wire.setConversationCalls[wire.setConversationCalls.length - 1]!;
    expect(persisted.id).toBe("A");

    // The throttled save persists a streaming checkpoint as-is. Restore
    // later converts orphaned streaming runs to interrupted/crash_recovery.
    const persistedRunIds = Object.keys(persisted.state?.runs ?? {});
    expect(persistedRunIds).toHaveLength(1);
    expect(persisted.state?.runs[persistedRunIds[0]!]?.status).toBe("streaming");
    expect(persisted.title).toBe("Hello from A");

    // The in-memory state was not touched by the persist transform.
    const afterState = store.get(conversationsAtom)["A"];
    expect(afterState.runs[persistedRunIds[0]!]?.status).toBe("streaming");

    // Cleanup: resolve the in-flight stream so the test exits cleanly.
    await act(async () => {
      wire.chatStream.resolveNext?.();
    });
  });

  it("pagehide during a streaming run interrupts runs and persists app_shutdown", async () => {
    setupTestHarness();
    const store = createStore();
    store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
    store.set(aiRuntimeAtom, createMockAIRuntime());
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(setCurrentConversationIdAtom, "A");

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(queryKeys.templates.detail(wire.template.id), wire.template);
    queryClient.setQueryData(queryKeys.conversations.detail("A"), {
      id: "A",
      title: null,
      state: { ...initialConversationState, id: "A", createdAt: new Date(1).toISOString() },
      createdAt: new Date(1).toISOString(),
      updatedAt: null,
    });

    function TestWrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      );
    }

    wire.chatStream.keepInFlight = true;

    const onConversationIdChange = vi.fn();
    const { result } = renderHook(() => useAssistantChatTestHarness({ conversationId: "A", onConversationIdChange }), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      void result.current.controller.submit("Hello from A");
      await Promise.resolve();
    });

    const beforeState = store.get(conversationsAtom)["A"];
    const beforeRunIds = Object.keys(beforeState.runs);
    expect(beforeRunIds).toHaveLength(1);
    expect(beforeState.runs[beforeRunIds[0]!]?.status).toBe("streaming");

    const callsBeforePagehide = wire.setConversationCalls.length;
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });

    // INVARIANT: shutdown interrupts then aborts; abort must not re-dirty an
    // already-terminal interrupted run, so pagehide produces one durable write.
    expect(wire.setConversationCalls.length).toBeGreaterThan(callsBeforePagehide);
    const persisted = wire.setConversationCalls[wire.setConversationCalls.length - 1]!;
    expect(persisted.id).toBe("A");

    const persistedRunIds = Object.keys(persisted.state?.runs ?? {});
    expect(persistedRunIds).toHaveLength(1);
    expect(persisted.state?.runs[persistedRunIds[0]!]?.status).toBe("interrupted");
    expect(persisted.state?.runs[persistedRunIds[0]!]?.reason).toBe("app_shutdown");
    expect(persisted.title).toBe("Hello from A");

    const afterState = store.get(conversationsAtom)["A"];
    expect(afterState.runs[persistedRunIds[0]!]?.status).toBe("interrupted");
    expect(afterState.runs[persistedRunIds[0]!]?.reason).toBe("app_shutdown");
    // INVARIANT: single durable shutdown write of the interrupted snapshot.
    expect(wire.setConversationCalls).toHaveLength(callsBeforePagehide + 1);
  });

  it("persisted pagehide/pageshow keeps the assistant available for a new run", async () => {
    setupTestHarness();
    const store = createStore();
    store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
    store.set(aiRuntimeAtom, createMockAIRuntime());
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(setCurrentConversationIdAtom, "A");

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(queryKeys.templates.detail(wire.template.id), wire.template);
    queryClient.setQueryData(queryKeys.conversations.detail("A"), {
      id: "A",
      title: null,
      state: { ...initialConversationState, id: "A", createdAt: new Date(1).toISOString() },
      createdAt: new Date(1).toISOString(),
      updatedAt: null,
    });

    function TestWrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      );
    }

    wire.chatStream.keepInFlight = true;

    const onConversationIdChange = vi.fn();
    const { result } = renderHook(() => useAssistantChatTestHarness({ conversationId: "A", onConversationIdChange }), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      void result.current.controller.submit("Hello from A");
      await Promise.resolve();
    });

    const beforeState = store.get(conversationsAtom)["A"];
    const beforeRunIds = Object.keys(beforeState.runs);
    expect(beforeRunIds).toHaveLength(1);
    expect(beforeState.runs[beforeRunIds[0]!]?.status).toBe("streaming");
    expect(wire.chatStream.started).toBe(1);

    const callsBeforePagehide = wire.setConversationCalls.length;
    await act(async () => {
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    });

    // INVARIANT: bfcache entry must not interrupt/persist app_shutdown or close the engine.
    expect(wire.setConversationCalls).toHaveLength(callsBeforePagehide);
    expect(store.get(conversationsAtom)["A"].runs[beforeRunIds[0]!]?.status).toBe("streaming");
    expect(getAssistantEngine().lifecycle).toBe("running");

    await act(async () => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });

    await act(async () => {
      wire.chatStream.resolveNext?.();
      await Promise.resolve();
    });

    expect(store.get(conversationsAtom)["A"].runs[beforeRunIds[0]!]?.status).toBe("success");
    expect(getAssistantEngine().lifecycle).toBe("running");

    await act(async () => {
      void result.current.controller.submit("Hello again after bfcache");
      await Promise.resolve();
    });

    expect(wire.chatStream.started).toBe(2);
    const afterState = store.get(conversationsAtom)["A"];
    const afterRunIds = Object.keys(afterState.runs);
    expect(afterRunIds).toHaveLength(2);
    expect(Object.values(afterState.runs).some((run) => run.status === "streaming")).toBe(true);

    await act(async () => {
      wire.chatStream.resolveNext?.();
      await Promise.resolve();
    });
  });

  it("pagehide plus unmount during a streaming run persists interrupted app_shutdown", async () => {
    setupTestHarness();
    const store = createStore();
    store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
    store.set(aiRuntimeAtom, createMockAIRuntime());
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(setCurrentConversationIdAtom, "A");

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(queryKeys.templates.detail(wire.template.id), wire.template);
    queryClient.setQueryData(queryKeys.conversations.detail("A"), {
      id: "A",
      title: null,
      state: { ...initialConversationState, id: "A", createdAt: new Date(1).toISOString() },
      createdAt: new Date(1).toISOString(),
      updatedAt: null,
    });

    function TestWrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      );
    }

    wire.chatStream.keepInFlight = true;

    const onConversationIdChange = vi.fn();
    const { result, unmount } = renderHook(
      () => useAssistantChatTestHarness({ conversationId: "A", onConversationIdChange }),
      {
        wrapper: TestWrapper,
      },
    );

    await act(async () => {
      void result.current.controller.submit("Hello from A");
      await Promise.resolve();
    });

    const beforeState = store.get(conversationsAtom)["A"];
    const beforeRunIds = Object.keys(beforeState.runs);
    expect(beforeRunIds).toHaveLength(1);
    expect(beforeState.runs[beforeRunIds[0]!]?.status).toBe("streaming");

    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });

    await act(async () => {
      unmount();
    });

    const lastForA = [...wire.setConversationCalls].reverse().find((c) => c.id === "A");
    expect(lastForA).toBeDefined();
    const lastRunIds = Object.keys(lastForA?.state?.runs ?? {});
    expect(lastRunIds).toHaveLength(1);
    expect(lastForA?.state?.runs[lastRunIds[0]!]?.status).toBe("interrupted");
    expect(lastForA?.state?.runs[lastRunIds[0]!]?.reason).toBe("app_shutdown");
    expect(lastForA?.title).toBe("Hello from A");

    const afterState = store.get(conversationsAtom)["A"];
    expect(afterState.runs[beforeRunIds[0]!]?.status).toBe("interrupted");
    expect(afterState.runs[beforeRunIds[0]!]?.reason).toBe("app_shutdown");
  });

  it("unmount without pagehide keeps an in-flight run streaming", async () => {
    setupTestHarness();
    const store = createStore();
    store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
    store.set(aiRuntimeAtom, createMockAIRuntime());
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(setCurrentConversationIdAtom, "A");

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(queryKeys.templates.detail(wire.template.id), wire.template);
    queryClient.setQueryData(queryKeys.conversations.detail("A"), {
      id: "A",
      title: null,
      state: { ...initialConversationState, id: "A", createdAt: new Date(1).toISOString() },
      createdAt: new Date(1).toISOString(),
      updatedAt: null,
    });

    function TestWrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      );
    }

    wire.chatStream.keepInFlight = true;

    const onConversationIdChange = vi.fn();
    const { result, unmount } = renderHook(
      () => useAssistantChatTestHarness({ conversationId: "A", onConversationIdChange }),
      {
        wrapper: TestWrapper,
      },
    );

    await act(async () => {
      void result.current.controller.submit("Hello from A");
      await Promise.resolve();
    });

    const beforeState = store.get(conversationsAtom)["A"];
    const beforeRunIds = Object.keys(beforeState.runs);
    expect(beforeState.runs[beforeRunIds[0]!]?.status).toBe("streaming");

    await act(async () => {
      unmount();
    });

    const afterState = store.get(conversationsAtom)["A"];
    expect(afterState.runs[beforeRunIds[0]!]?.status).toBe("streaming");
  });

  it("switch-away from AI route keeps an in-flight run streaming", async () => {
    setupTestHarness();
    const store = createStore();
    store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
    store.set(aiRuntimeAtom, createMockAIRuntime());
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(setCurrentConversationIdAtom, "A");

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(queryKeys.templates.detail(wire.template.id), wire.template);
    queryClient.setQueryData(queryKeys.conversations.detail("A"), {
      id: "A",
      title: null,
      state: { ...initialConversationState, id: "A", createdAt: new Date(1).toISOString() },
      createdAt: new Date(1).toISOString(),
      updatedAt: null,
    });

    function TestWrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      );
    }

    wire.chatStream.keepInFlight = true;
    const onConversationIdChange = vi.fn();
    const controllerRef: { current: RunController | null } = { current: null };

    function AppShell({ showAiRoute }: { showAiRoute: boolean }) {
      // WHY: Shell hosts stay mounted when the AI route unmounts (mirrors App).
      useAssistantAppShellHosts();
      if (!showAiRoute) return null;
      return <AiRouteChat />;
    }

    function AiRouteChat() {
      const { controller } = useAssistantChatSessionHarness({
        conversationId: "A",
        onConversationIdChange,
      });
      controllerRef.current = controller;
      return null;
    }

    const view = render(
      <TestWrapper>
        <AppShell showAiRoute />
      </TestWrapper>,
    );

    await act(async () => {
      void controllerRef.current!.submit("Hello from A");
      await Promise.resolve();
    });

    const beforeState = store.get(conversationsAtom)["A"];
    const beforeRunIds = Object.keys(beforeState.runs);
    expect(beforeRunIds).toHaveLength(1);
    expect(beforeState.runs[beforeRunIds[0]!]?.status).toBe("streaming");

    await act(async () => {
      view.rerender(
        <TestWrapper>
          <AppShell showAiRoute={false} />
        </TestWrapper>,
      );
    });

    const afterState = store.get(conversationsAtom)["A"];
    expect(afterState.runs[beforeRunIds[0]!]?.status).toBe("streaming");
  });

  it("pagehide after leaving AI route still persists app_shutdown", async () => {
    setupTestHarness();
    const store = createStore();
    store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
    store.set(aiRuntimeAtom, createMockAIRuntime());
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(setCurrentConversationIdAtom, "A");

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(queryKeys.templates.detail(wire.template.id), wire.template);
    queryClient.setQueryData(queryKeys.conversations.detail("A"), {
      id: "A",
      title: null,
      state: { ...initialConversationState, id: "A", createdAt: new Date(1).toISOString() },
      createdAt: new Date(1).toISOString(),
      updatedAt: null,
    });

    function TestWrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      );
    }

    wire.chatStream.keepInFlight = true;
    const onConversationIdChange = vi.fn();
    const controllerRef: { current: RunController | null } = { current: null };

    function AppShell({ showAiRoute }: { showAiRoute: boolean }) {
      useAssistantAppShellHosts();
      if (!showAiRoute) return null;
      return <AiRouteChat />;
    }

    function AiRouteChat() {
      const { controller } = useAssistantChatSessionHarness({
        conversationId: "A",
        onConversationIdChange,
      });
      controllerRef.current = controller;
      return null;
    }

    const view = render(
      <TestWrapper>
        <AppShell showAiRoute />
      </TestWrapper>,
    );

    await act(async () => {
      void controllerRef.current!.submit("Hello from A");
      await Promise.resolve();
    });

    const beforeState = store.get(conversationsAtom)["A"];
    const beforeRunIds = Object.keys(beforeState.runs);
    expect(beforeState.runs[beforeRunIds[0]!]?.status).toBe("streaming");

    await act(async () => {
      view.rerender(
        <TestWrapper>
          <AppShell showAiRoute={false} />
        </TestWrapper>,
      );
    });

    // INVARIANT: leaving /ai must not remove shell unload listeners.
    expect(store.get(conversationsAtom)["A"].runs[beforeRunIds[0]!]?.status).toBe("streaming");

    const callsBeforePagehide = wire.setConversationCalls.length;
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(wire.setConversationCalls.length).toBeGreaterThan(callsBeforePagehide);
    const persisted = wire.setConversationCalls[wire.setConversationCalls.length - 1]!;
    expect(persisted.id).toBe("A");
    const persistedRunIds = Object.keys(persisted.state?.runs ?? {});
    expect(persistedRunIds).toHaveLength(1);
    expect(persisted.state?.runs[persistedRunIds[0]!]?.status).toBe("interrupted");
    expect(persisted.state?.runs[persistedRunIds[0]!]?.reason).toBe("app_shutdown");

    const afterState = store.get(conversationsAtom)["A"];
    expect(afterState.runs[beforeRunIds[0]!]?.status).toBe("interrupted");
    expect(afterState.runs[beforeRunIds[0]!]?.reason).toBe("app_shutdown");
  });
});

describe("assistant chat restore policy (blocked rows)", () => {
  function makeBlockedRowState(id: string, schemaVersion: unknown) {
    return {
      ...initialConversationState,
      id,
      createdAt: new Date(1).toISOString(),
      schemaVersion,
    };
  }

  function makeRecoveryWrapper(options: { deleteCalls?: string[] }) {
    const store = createStore();
    const queries = buildQueries();
    if (options.deleteCalls) {
      queries.deleteConversationMutation = () => ({
        mutationFn: async (data: { id: string }) => {
          options.deleteCalls!.push(data.id);
          return undefined;
        },
      });
    }
    store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], queries);
    store.set(aiRuntimeAtom, createMockAIRuntime());
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(queryKeys.templates.detail(wire.template.id), wire.template);

    function TestWrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      );
    }

    return { store, queryClient, TestWrapper };
  }

  function RecoveryHarness({ conversationId, onDeleted }: { conversationId: string; onDeleted?: () => void }) {
    useAssistantAppShellHosts();
    useAssistantChatSessionHarness({ conversationId, onConversationIdChange: () => {} });
    const blocked = useAtomValue(blockedConversationRestoreAtom)[conversationId] ?? null;
    if (!blocked) return null;
    return <AssistantConversationRecovery conversationId={conversationId} blocked={blocked} onDeleted={onDeleted} />;
  }

  it("restore: a future-version row is blocked and never written on selection, touch, or autosave", async () => {
    setupTestHarness();
    const store = createStore();
    store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
    store.set(aiRuntimeAtom, createMockAIRuntime());

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(queryKeys.templates.detail(wire.template.id), wire.template);
    queryClient.setQueryData(queryKeys.conversations.detail("ok"), {
      id: "ok",
      title: null,
      state: makeBlockedRowState("ok", CONVERSATION_SCHEMA_VERSION),
      createdAt: new Date(1).toISOString(),
      updatedAt: null,
    });
    queryClient.setQueryData(queryKeys.conversations.detail("future"), {
      id: "future",
      title: null,
      state: makeBlockedRowState("future", CONVERSATION_SCHEMA_VERSION + 1),
      createdAt: new Date(1).toISOString(),
      updatedAt: null,
    });

    function TestWrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      );
    }

    const onConversationIdChange = vi.fn();
    const phases: Array<{ isRestoring: boolean; blocked: boolean; hasLive: boolean }> = [];
    const { rerender } = renderHook(
      ({ conversationId }: { conversationId: string | undefined }) => {
        const result = useAssistantChatTestHarness({ conversationId, onConversationIdChange });
        const persistence = useConversationPersistence({ conversationId });
        const hasLive = conversationId ? !!useAtomValue(conversationsAtom)[conversationId] : false;
        phases.push({
          isRestoring: persistence.isRestoring,
          blocked: persistence.blockedRestore != null,
          hasLive,
        });
        return result;
      },
      {
        wrapper: TestWrapper,
        initialProps: { conversationId: "ok" as string | undefined },
      },
    );

    // Let the ok restore (and its restore-touch autosave) settle.
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    wire.setConversationCalls = [];
    phases.length = 0;

    // Selecting the future-version row must not produce editable state…
    rerender({ conversationId: "future" });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(store.get(conversationsAtom)["future"]).toBeUndefined();
    expect(store.get(blockedConversationRestoreAtom)["future"]).toEqual({
      status: "unsupportedVersion",
      found: CONVERSATION_SCHEMA_VERSION + 1,
      supported: CONVERSATION_SCHEMA_VERSION,
    });
    // INVARIANT: never leave the unresolved gap (not restoring, not blocked,
    // no live state) that would flash the editable chat shell.
    expect(phases.every((p) => p.isRestoring || p.blocked || p.hasLive)).toBe(true);
    expect(phases.some((p) => p.blocked)).toBe(true);
    // …and never reach the write mutation: no restore touch, no autosave,
    // no selection write.
    expect(wire.setConversationCalls.filter((c) => c.id === "future")).toHaveLength(0);
  });

  it("restore: a corrupt row is blocked and preserved until an explicit recovery action", async () => {
    setupTestHarness();
    const store = createStore();
    store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
    store.set(aiRuntimeAtom, createMockAIRuntime());

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(queryKeys.templates.detail(wire.template.id), wire.template);
    // malformed-version row: the version cannot be determined, so it is corrupt.
    queryClient.setQueryData(queryKeys.conversations.detail("corrupt"), {
      id: "corrupt",
      title: null,
      state: makeBlockedRowState("corrupt", "2"),
      createdAt: new Date(1).toISOString(),
      updatedAt: null,
    });

    function TestWrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      );
    }

    const onConversationIdChange = vi.fn();
    const phases: Array<{ isRestoring: boolean; blocked: boolean; hasLive: boolean }> = [];
    renderHook(
      () => {
        const result = useAssistantChatTestHarness({ conversationId: "corrupt", onConversationIdChange });
        const persistence = useConversationPersistence({ conversationId: "corrupt" });
        const hasLive = !!useAtomValue(conversationsAtom)["corrupt"];
        phases.push({
          isRestoring: persistence.isRestoring,
          blocked: persistence.blockedRestore != null,
          hasLive,
        });
        return result;
      },
      {
        wrapper: TestWrapper,
      },
    );

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(store.get(conversationsAtom)["corrupt"]).toBeUndefined();
    expect(store.get(blockedConversationRestoreAtom)["corrupt"]).toEqual({
      status: "corrupt",
      issues: [
        { path: "schemaVersion", kind: "invalid_type", message: "expected a non-negative integer schemaVersion" },
      ],
    });
    // INVARIANT: never leave the unresolved gap that would flash the editable chat shell.
    expect(phases.every((p) => p.isRestoring || p.blocked || p.hasLive)).toBe(true);
    expect(phases.some((p) => p.blocked)).toBe(true);
    // The stored row is preserved: no write mutation was ever called.
    expect(wire.setConversationCalls).toHaveLength(0);
  });

  it("recovery reset: explicitly discards a corrupt row and starts a fresh conversation under the same id", async () => {
    setupTestHarness();
    const deleteCalls: string[] = [];
    const { store, queryClient, TestWrapper } = makeRecoveryWrapper({ deleteCalls });
    queryClient.setQueryData(queryKeys.conversations.detail("corrupt"), {
      id: "corrupt",
      title: null,
      state: makeBlockedRowState("corrupt", "2"),
      createdAt: new Date(1).toISOString(),
      updatedAt: null,
    });

    const view = render(
      <TestWrapper>
        <RecoveryHarness conversationId="corrupt" />
      </TestWrapper>,
    );

    // The restore effect blocked the row and rendered the recovery screen.
    await act(async () => {
      await Promise.resolve();
    });
    expect(store.get(blockedConversationRestoreAtom)["corrupt"]?.status).toBe("corrupt");
    expect(store.get(conversationsAtom)["corrupt"]).toBeUndefined();
    expect(wire.setConversationCalls).toHaveLength(0);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ai.conversation.recovery.reset.trigger" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ai.conversation.recovery.reset.confirm" }));
    });

    // The stored row was explicitly discarded through the delete mutation…
    expect(deleteCalls).toEqual(["corrupt"]);
    // …the blocked entry is gone…
    expect(store.get(blockedConversationRestoreAtom)["corrupt"]).toBeUndefined();
    // …and a fresh current-version conversation exists under the same id.
    const state = store.get(conversationsAtom)["corrupt"];
    expect(state).toBeDefined();
    expect(state.id).toBe("corrupt");
    expect(state.messages).toHaveLength(0);
    expect(state.runs).toEqual({});
    expect(state.updatedAt).toBeNull();

    view.unmount();
  });

  it("recovery reset: the fresh conversation saves normally once content is added", async () => {
    setupTestHarness();
    const deleteCalls: string[] = [];
    const { store, queryClient, TestWrapper } = makeRecoveryWrapper({ deleteCalls });
    queryClient.setQueryData(queryKeys.conversations.detail("corrupt"), {
      id: "corrupt",
      title: null,
      state: makeBlockedRowState("corrupt", "2"),
      createdAt: new Date(1).toISOString(),
      updatedAt: null,
    });

    const controllerRef: { current: RunController | null } = { current: null };

    function RecoveryHarnessWithController() {
      useAssistantAppShellHosts();
      const { controller } = useAssistantChatSessionHarness({
        conversationId: "corrupt",
        onConversationIdChange: () => {},
      });
      controllerRef.current = controller;
      const blocked = useAtomValue(blockedConversationRestoreAtom)["corrupt"] ?? null;
      if (!blocked) return null;
      return <AssistantConversationRecovery conversationId="corrupt" blocked={blocked} />;
    }

    const view = render(
      <TestWrapper>
        <RecoveryHarnessWithController />
      </TestWrapper>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ai.conversation.recovery.reset.trigger" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ai.conversation.recovery.reset.confirm" }));
    });

    expect(deleteCalls).toEqual(["corrupt"]);
    expect(store.get(blockedConversationRestoreAtom)["corrupt"]).toBeUndefined();

    // The reset fresh state is editable: submitting a turn saves normally.
    await act(async () => {
      void controllerRef.current!.submit("Hello after reset");
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    const savesForCorrupt = wire.setConversationCalls.filter((c) => c.id === "corrupt");
    expect(savesForCorrupt.length).toBeGreaterThanOrEqual(1);
    expect(savesForCorrupt[0]?.title).toBe("Hello after reset");

    view.unmount();
  });

  it("recovery delete: explicitly removes the blocked row and notifies the route", async () => {
    setupTestHarness();
    const deleteCalls: string[] = [];
    const { store, queryClient, TestWrapper } = makeRecoveryWrapper({ deleteCalls });
    queryClient.setQueryData(queryKeys.conversations.detail("corrupt"), {
      id: "corrupt",
      title: null,
      state: makeBlockedRowState("corrupt", "2"),
      createdAt: new Date(1).toISOString(),
      updatedAt: null,
    });

    const onDeleted = vi.fn();
    const view = render(
      <TestWrapper>
        <RecoveryHarness conversationId="corrupt" onDeleted={onDeleted} />
      </TestWrapper>,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(store.get(blockedConversationRestoreAtom)["corrupt"]?.status).toBe("corrupt");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ai.conversation.delete.trigger" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ai.conversation.delete.confirm" }));
    });

    expect(deleteCalls).toEqual(["corrupt"]);
    expect(onDeleted).toHaveBeenCalledOnce();
    expect(store.get(blockedConversationRestoreAtom)["corrupt"]).toBeUndefined();
    expect(store.get(conversationsAtom)["corrupt"]).toBeUndefined();

    view.unmount();
  });

  it("restore: an ok row is restored into the store and is not blocked", async () => {
    setupTestHarness();
    const store = createStore();
    store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
    store.set(aiRuntimeAtom, createMockAIRuntime());

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(queryKeys.templates.detail(wire.template.id), wire.template);
    queryClient.setQueryData(queryKeys.conversations.detail("ok"), {
      id: "ok",
      title: null,
      state: {
        ...makeBlockedRowState("ok", CONVERSATION_SCHEMA_VERSION),
        messages: [
          {
            id: "user-r1",
            role: "user",
            parts: [{ type: "text", text: "Hello from ok" }],
            metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
          },
        ],
        runs: {
          r1: {
            id: "r1",
            mode: "chat",
            status: "success",
            cards: [],
            cardStatuses: {},
            templateFields: null,
            startedAt: new Date(1).toISOString(),
            elapsedSeconds: 1,
          },
        },
      },
      createdAt: new Date(1).toISOString(),
      updatedAt: null,
    });

    function TestWrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      );
    }

    const onConversationIdChange = vi.fn();
    renderHook(() => useAssistantChatTestHarness({ conversationId: "ok", onConversationIdChange }), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    const state = store.get(conversationsAtom)["ok"];
    expect(state).toBeDefined();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.parts[0]).toEqual({ type: "text", text: "Hello from ok" });
    expect(store.get(blockedConversationRestoreAtom)["ok"]).toBeUndefined();
  });

  it("restore: a missing row creates fresh state and saves normally", async () => {
    setupTestHarness();
    const store = createStore();
    const queries = buildQueries();
    // A row that does not exist resolves to null — restore must create fresh state.
    queries.getConversationQuery = (id: string) => ({
      queryKey: queryKeys.conversations.detail(id),
      queryFn: async () => null,
    });
    store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], queries);
    store.set(aiRuntimeAtom, createMockAIRuntime());

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(queryKeys.templates.detail(wire.template.id), wire.template);

    function TestWrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      );
    }

    const onConversationIdChange = vi.fn();
    const controllerRef: { current: RunController | null } = { current: null };

    function HarnessProbe() {
      const { controller } = useAssistantChatTestHarness({
        conversationId: "missing",
        onConversationIdChange,
      });
      controllerRef.current = controller;
      return null;
    }

    render(
      <TestWrapper>
        <HarnessProbe />
      </TestWrapper>,
    );

    // WHY: flush microtasks first so the initial query fetch resolves and its
    // notification timer is scheduled before advancing fake timers.
    await act(async () => {
      await Promise.resolve();
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    const state = store.get(conversationsAtom)["missing"];
    expect(state).toBeDefined();
    expect(state.id).toBe("missing");
    expect(state.messages).toHaveLength(0);
    expect(store.get(blockedConversationRestoreAtom)["missing"]).toBeUndefined();

    // The fresh conversation is editable and saves like any other.
    await act(async () => {
      void controllerRef.current!.submit("Hello missing");
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    const savesForMissing = wire.setConversationCalls.filter((c) => c.id === "missing");
    expect(savesForMissing.length).toBeGreaterThanOrEqual(1);
    expect(savesForMissing[0]?.title).toBe("Hello missing");
  });
});
