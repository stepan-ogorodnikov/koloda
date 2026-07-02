import type { ChatStreamGenerator, ChatStreamRequest, GeneratedCard, ModelParameter, StreamUsage } from "@koloda/ai";
import type * as KolodaAiReactModule from "@koloda/ai-react";
import type { StreamResult } from "@koloda/ai-react";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import * as React from "react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAIModel, createAIProfile, createTemplate } from "../../test/test-helpers";
import {
  conversationsAtom,
  setCurrentConversationIdAtom,
  upsertConversationAtom,
} from "./assistant-conversation-atoms";
import type { ConversationState } from "./conversation-state";
import { initialConversationState } from "./conversation-state";
import type { CardGenerationStreamRequest } from "./use-assistant-card-generation";
import { useAssistantChat } from "./use-assistant-chat";

/**
 * Module-level "wire" used by the mocked stream hooks and the test code to
 * coordinate stream lifecycle and error injection.
 */
const wire = vi.hoisted(() => {
  return {
    // Stream controls
    chatStream: {
      started: 0,
      onChunk: null as null | ((chunk: string) => void),
      onStart: null as null | ((request: ChatStreamRequest, onChunk: (chunk: string) => void) => void),
      // Deferred promise controls for the chat stream. The mock returns
      // a deferred promise and exposes the resolve function so the test
      // can decide when (and whether) the stream completes.
      resolveNext: null as null | (() => void),
      keepInFlight: false,
    },
    cardStream: {
      started: 0,
      onCard: null as null | ((card: GeneratedCard) => void),
      onStart: null as null | ((request: CardGenerationStreamRequest, onCard: (card: GeneratedCard) => void) => void),
      abortNext: false,
    },
    // Captured error callbacks so the test can trigger errors.
    onChatError: null as null | ((error: Error) => void),
    onCardError: null as null | ((error: Error) => void),
    // Save mutation spy. The `state` payload is the full serialized
    // ConversationState — tests that need to assert on the run status
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
    useChatStream: (
      _generator: ChatStreamGenerator,
      onError?: (error: Error) => void,
    ) => {
      wire.onChatError = onError ?? null;
      return {
        text: "",
        isStreaming: false,
        error: null,
        usage: null,
        stream: (
          request: ChatStreamRequest,
          onChunk: (chunk: string) => void,
        ): Promise<{ streamResult: StreamResult; usage: StreamUsage | null }> => {
          wire.chatStream.started += 1;
          wire.chatStream.onChunk = onChunk;
          wire.chatStream.onStart?.(request, onChunk);
          // If the test asked to keep the stream in flight, return a
          // deferred promise that the test can resolve via
          // `wire.chatStream.resolveNext`. Otherwise resolve immediately
          // so the run completes synchronously.
          if (wire.chatStream.keepInFlight) {
            return new Promise<{ streamResult: StreamResult; usage: StreamUsage | null }>((resolve) => {
              wire.chatStream.resolveNext = () => resolve({ streamResult: "success" as StreamResult, usage: null });
            });
          }
          return Promise.resolve({ streamResult: "success" as StreamResult, usage: null });
        },
        cancel: () => {},
      };
    },
    useAIProfiles: (profileId?: string | null) => {
      const profile = wire.profiles[0] ?? null;
      const selectedProfile = profileId ? profile : null;
      return {
        profiles: wire.profiles,
        isLoading: false,
        isError: false,
        defaultProfileId: profile?.id ?? null,
        selectedProfile,
        lastUsedModel: profile?.lastUsedModel ?? null,
        secrets: selectedProfile?.secrets ?? null,
        apiKey: selectedProfile?.secrets?.apiKey ?? null,
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

vi.mock("./use-assistant-card-generation", () => ({
  useAssistantCardGeneration: (
    _streamGenerator: unknown,
    onError?: (error: Error) => void,
  ) => {
    wire.onCardError = onError ?? null;
    return {
      cards: [],
      isGenerating: false,
      error: null,
      generate: async (
        _request: CardGenerationStreamRequest,
        onCard?: (card: GeneratedCard) => void,
      ) => {
        wire.cardStream.started += 1;
        wire.cardStream.onCard = onCard ?? null;
        wire.cardStream.onStart?.(_request, onCard ?? (() => {}));
        return "success" as StreamResult;
      },
      clearCards: () => {},
      cancel: () => {},
    };
  },
}));

vi.mock("./use-assistant-configuration", () => {
  // Re-export a thin shim that reads from the same `wire` used by the
  // mock of `@koloda/ai-react`. The shim mirrors the public shape of
  // `useAssistantConfiguration` exactly.
  return {
    useAssistantConfiguration: () => {
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
        provider: profile?.secrets?.provider ?? null,
        modelParameters: [] as ModelParameter[],
        hasProfiles: wire.profiles.length > 0,
        handleProfileChange: () => {},
        handleModelChange: () => {},
        handleModelParameterChange: () => {},
      };
    },
  };
});

vi.mock("./use-assistant-client", () => ({
  useAssistantClient: () => ({
    streamGenerator: (() => {}) as never,
    chatStreamGenerator: (() => {}) as never,
  }),
}));

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
}));

function buildQueries(): Queries {
  return {
    getSettingsQuery: () => ({
      queryFn: async () => ({
        content: { assistant: { temperature: 0.2, cardsPromptTemplate: null, chatPromptTemplate: null } },
      }),
    }),
    setSettingsMutation: () => ({ mutationFn: async () => undefined }),
    patchSettingsMutation: () => ({ mutationFn: async () => undefined }),
    getConversationQuery: (id: string) => ({
      queryFn: async () => ({
        id,
        title: null,
        state: { ...initialConversationState, id, createdAt: new Date(1).toISOString() },
        createdAt: new Date(1).toISOString(),
        updatedAt: null,
      }),
    }),
    getConversationsQuery: () => ({ queryFn: async () => [] }),
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
    getAlgorithmsQuery: () => ({ queryFn: async () => [] }),
    getAlgorithmQuery: () => ({ queryFn: async () => null }),
    addAlgorithmMutation: () => ({ mutationFn: async () => undefined }),
    cloneAlgorithmMutation: () => ({ mutationFn: async () => undefined }),
    updateAlgorithmMutation: () => ({ mutationFn: async () => undefined }),
    deleteAlgorithmMutation: () => ({ mutationFn: async () => undefined }),
    getAlgorithmDecksQuery: () => ({ queryFn: async () => [] }),
    getDecksQuery: () => ({ queryFn: async () => [] }),
    getDeckQuery: (id: number) => ({
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
    getTemplatesQuery: () => ({ queryFn: async () => [wire.template] }),
    getTemplateQuery: () => ({ queryFn: async () => wire.template }),
    addTemplateMutation: () => ({ mutationFn: async () => undefined }),
    cloneTemplateMutation: () => ({ mutationFn: async () => undefined }),
    updateTemplateMutation: () => ({ mutationFn: async () => undefined }),
    deleteTemplateMutation: () => ({ mutationFn: async () => undefined }),
    getTemplateDecksQuery: () => ({ queryFn: async () => [] }),
    getCardsQuery: () => ({ queryFn: async () => [] }),
    addCardMutation: () => ({ mutationFn: async () => undefined }),
    addCardsMutation: () => ({ mutationFn: async () => ({ insertedIds: [] }) }),
    updateCardMutation: () => ({ mutationFn: async () => undefined }),
    deleteCardMutation: () => ({ mutationFn: async () => undefined }),
    deleteCardsMutation: () => ({ mutationFn: async () => undefined }),
    resetCardProgressMutation: () => ({ mutationFn: async () => undefined }),
    getLessonsQuery: () => ({ queryFn: async () => [] }),
    getTodayReviewTotalsQuery: () => ({ queryFn: async () => undefined }),
    getLessonDataQuery: () => ({ queryFn: async () => null }),
    submitLessonResultMutation: () => ({ mutationFn: async () => undefined }),
    getReviewsQuery: () => ({ queryFn: async () => [] }),
    addAIProfileMutation: () => ({ mutationFn: async () => undefined }),
    updateAIProfileMutation: () => ({ mutationFn: async () => undefined }),
    removeAIProfileMutation: () => ({ mutationFn: async () => undefined }),
    touchAIProfileMutation: () => ({ mutationFn: async (_args: { id: string; modelId: string }) => undefined }),
    getAIProfileModelsQuery: (_profileId: string) => ({ queryFn: async () => wire.models }),
    getAIProfilesQuery: () => ({ queryFn: async () => wire.profiles }),
  };
}

function makeConversation(id: string, overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    ...initialConversationState,
    id,
    createdAt: new Date(1),
    ...overrides,
  };
}

function makeWrapper() {
  const store = createStore();
  store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
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
    abortNext: false,
    resolveNext: null,
    keepInFlight: false,
  };
  wire.cardStream = { started: 0, onCard: null, onStart: null, abortNext: false };
  wire.onChatError = null;
  wire.onCardError = null;
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
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useAssistantChat (hook-level integration with per-conversation state)", () => {
  it("handleStreamError: two streams in flight on different conversations, one errors, error routes to the right conversation", async () => {
    setupTestHarness();
    const store = createStore();
    store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(upsertConversationAtom, makeConversation("B"));
    store.set(setCurrentConversationIdAtom, "A");

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(queryKeys.templates.detail(wire.template.id), wire.template);

    // Hold the chat stream open so both runs stay in flight while we
    // trigger the error. The mock returns a deferred promise so the
    // chat completion callback is never invoked and the chat
    // pending-failure ref (managed by `usePendingRunRefs`) stays set.
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
        useAssistantChat({ conversationId, onConversationIdChange }),
      {
        wrapper: TestWrapper,
        initialProps: { conversationId: "A" as string | undefined },
      },
    );

    // Start a chat run on A. The mock keeps it in flight.
    await act(async () => {
      // Fire and forget — the promise never resolves.
      void result.current.handleGenerate("Hello from A");
      await Promise.resolve();
    });

    // Switch to B and start a chat run on B.
    rerender({ conversationId: "B" });
    await act(async () => {
      store.set(setCurrentConversationIdAtom, "B");
      void result.current.handleGenerate("Hello from B");
      await Promise.resolve();
    });

    // Both streams were started.
    expect(wire.chatStream.started).toBe(2);

    // Now reject the chat stream — this simulates a stream error for B.
    // The error should be routed to B's run via the chat pending-failure
    // ref managed by `usePendingRunRefs`.
    expect(wire.onChatError).not.toBeNull();
    await act(async () => {
      wire.onChatError!(new Error("stream blew up"));
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
        useAssistantChat({ conversationId, onConversationIdChange }),
      {
        wrapper: TestWrapper,
        initialProps: { conversationId: "A" as string | undefined },
      },
    );

    let chatPromise!: Promise<void>;
    await act(async () => {
      chatPromise = result.current.handleGenerate("Hello from A") as unknown as Promise<void>;
      // Advance the mocked clock so the chunks fire.
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

  it("save throttler: bumps on A do not trigger saves for B and vice-versa", async () => {
    setupTestHarness();
    const store = createStore();
    store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
    store.set(
      upsertConversationAtom,
      makeConversation("A", {
        messages: [
          { id: "user-r1", role: "user", parts: [{ type: "text", text: "Hello" }] },
        ],
      }),
    );
    store.set(
      upsertConversationAtom,
      makeConversation("B", {
        messages: [
          { id: "user-r1", role: "user", parts: [{ type: "text", text: "Different" }] },
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
    const { result, rerender } = renderHook(
      ({ conversationId }: { conversationId: string | undefined }) =>
        useAssistantChat({ conversationId, onConversationIdChange }),
      {
        wrapper: TestWrapper,
        initialProps: { conversationId: "A" as string | undefined },
      },
    );

    // Bump the save counter for A a few times.
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        result.current.setMode(result.current.profileId ? "cards" : "chat");
      });
    }

    // Switch to B and bump its save counter.
    rerender({ conversationId: "B" });
    await act(async () => {
      result.current.setMode("chat");
    });

    // Allow the idle-save debounce to fire.
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // B's save fired (its counter bumped). A's bumps did not produce a
    // B save, and B's bump did not produce an A save. We assert the
    // call list only contains the most recent save (per-conversation,
    // not double-saved).
    expect(wire.setConversationCalls.length).toBeGreaterThanOrEqual(1);
    for (const call of wire.setConversationCalls) {
      expect(["A", "B"]).toContain(call.id);
    }
    // The last call should be for B (the current conversation at the time
    // of the bump).
    const lastCall = wire.setConversationCalls[wire.setConversationCalls.length - 1]!;
    expect(lastCall.id).toBe("B");
  });

  it("throttled save during a streaming run persists the run as canceled, not streaming", async () => {
    setupTestHarness();
    const store = createStore();
    store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
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
    const { result } = renderHook(
      () => useAssistantChat({ conversationId: "A", onConversationIdChange }),
      { wrapper: TestWrapper },
    );

    // Start a streaming run. This dispatches addUserMessage + startRun +
    // addAssistantMessage, each of which bumps the save counter and
    // schedules the throttled save.
    await act(async () => {
      void result.current.handleGenerate("Hello from A");
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

    // The throttled save's persisted state has the run as "canceled"
    // (not "streaming") so that a later race between this mutation and
    // a pagehide/cleanup mutation cannot resurrect a "streaming"
    // snapshot that would cause normalizeRestoredConversation to drop
    // the user/assistant messages on next mount.
    const persistedRunIds = Object.keys(persisted.state?.runs ?? {});
    expect(persistedRunIds.length).toBe(1);
    expect(persisted.state?.runs[persistedRunIds[0]!]?.status).toBe("canceled");
    expect(persisted.title).toBe("Hello from A");

    // The in-memory state was not touched by the persist transform.
    const afterState = store.get(conversationsAtom)["A"];
    expect(afterState.runs[persistedRunIds[0]!]?.status).toBe("streaming");

    // Cleanup: resolve the in-flight stream so the test exits cleanly.
    await act(async () => {
      wire.chatStream.resolveNext?.();
    });
  });

  it("pagehide during a streaming run persists the run as canceled, not streaming", async () => {
    setupTestHarness();
    const store = createStore();
    store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
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
    // status while we fire pagehide.
    wire.chatStream.keepInFlight = true;

    const onConversationIdChange = vi.fn();
    const { result } = renderHook(
      () => useAssistantChat({ conversationId: "A", onConversationIdChange }),
      { wrapper: TestWrapper },
    );

    // Fire and forget — the stream promise never resolves, so the
    // generation run remains in "streaming" status.
    await act(async () => {
      void result.current.handleGenerate("Hello from A");
      await Promise.resolve();
    });

    // Sanity check: the in-memory run is streaming.
    const beforeState = store.get(conversationsAtom)["A"];
    const beforeRunIds = Object.keys(beforeState.runs);
    expect(beforeRunIds.length).toBe(1);
    expect(beforeState.runs[beforeRunIds[0]!]?.status).toBe("streaming");

    // Simulate the user closing the tab. The save effect's pagehide
    // listener should fire `flushNow` with `cancelStreamingRuns: true`.
    const callsBeforePagehide = wire.setConversationCalls.length;
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });

    // A save was issued.
    expect(wire.setConversationCalls.length).toBe(callsBeforePagehide + 1);
    const persisted = wire.setConversationCalls[wire.setConversationCalls.length - 1]!;
    expect(persisted.id).toBe("A");

    // The persisted state has the run as "canceled" (not "streaming"),
    // and the title is derived from the user message (i.e. the
    // user-message text is visible in the persisted title).
    const persistedRunIds = Object.keys(persisted.state?.runs ?? {});
    expect(persistedRunIds.length).toBe(1);
    expect(persisted.state?.runs[persistedRunIds[0]!]?.status).toBe("canceled");
    expect(persisted.title).toBe("Hello from A");

    // Crucially: the in-memory run is still "streaming" — we only
    // transformed the persist-time snapshot, not the live state. The
    // background stream is still legitimately in flight.
    const afterState = store.get(conversationsAtom)["A"];
    expect(afterState.runs[beforeRunIds[0]!]?.status).toBe("streaming");

    // Cleanup: resolve the in-flight stream so the test exits cleanly.
    await act(async () => {
      wire.chatStream.resolveNext?.();
    });
  });

  it("unmount during a streaming run persists the run as canceled (cleanup does not overwrite pagehide's 'canceled' save with 'streaming')", async () => {
    setupTestHarness();
    const store = createStore();
    store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
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
      () => useAssistantChat({ conversationId: "A", onConversationIdChange }),
      { wrapper: TestWrapper },
    );

    // Start a streaming run.
    await act(async () => {
      void result.current.handleGenerate("Hello from A");
      await Promise.resolve();
    });

    // The run is streaming in memory.
    const beforeState = store.get(conversationsAtom)["A"];
    const beforeRunIds = Object.keys(beforeState.runs);
    expect(beforeRunIds.length).toBe(1);
    expect(beforeState.runs[beforeRunIds[0]!]?.status).toBe("streaming");

    // Simulate a hard close: pagehide fires, then React unmounts the
    // tree. The order matters — pagehide must run before unmount for
    // the bug to manifest, so we dispatch it explicitly.
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });

    // Now unmount. The save effect's cleanup runs `flush({ cancelStreamingRuns: true })`.
    await act(async () => {
      unmount();
    });

    // The cleanup must dispatch its own save with "canceled" — NOT
    // overwrite the pagehide save with "streaming". We assert that the
    // very last persisted state for A has the run as "canceled".
    const lastForA = [...wire.setConversationCalls].reverse().find((c) => c.id === "A");
    expect(lastForA).toBeDefined();
    const lastRunIds = Object.keys(lastForA?.state?.runs ?? {});
    expect(lastRunIds.length).toBe(1);
    expect(lastForA?.state?.runs[lastRunIds[0]!]?.status).toBe("canceled");
    expect(lastForA?.title).toBe("Hello from A");

    // The in-memory state was not touched by the persist transform.
    const afterState = store.get(conversationsAtom)["A"];
    expect(afterState.runs[beforeRunIds[0]!]?.status).toBe("streaming");

    // Cleanup: resolve the in-flight stream so the test exits cleanly.
    await act(async () => {
      wire.chatStream.resolveNext?.();
    });
  });
});
