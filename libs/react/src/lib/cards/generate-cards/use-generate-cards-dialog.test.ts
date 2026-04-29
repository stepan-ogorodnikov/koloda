import type { GeneratedCard } from "@koloda/srs";
import { act, renderHook, waitFor } from "@testing-library/react";
import type * as JotaiModule from "jotai";
import { describe, expect, it, vi } from "vitest";
import {
  createAIModel,
  createAIProfile,
  createGeneratedCard,
  createQueryClient,
  createQueryClientWrapper,
  createTemplate,
} from "../../../test/test-helpers";
import { serializeGeneratedCards } from "./generate-cards-utility";
import { useGenerateCardsDialog } from "./use-generate-cards-dialog";

const {
  useAIProfilesMock,
  useAIModelsMock,
  useGenerateCardsMock,
  useAtomValueMock,
} = vi.hoisted(() => ({
  useAIProfilesMock: vi.fn(),
  useAIModelsMock: vi.fn(),
  useGenerateCardsMock: vi.fn(),
  useAtomValueMock: vi.fn(),
}));

vi.mock("@koloda/react", () => ({
  useAIProfiles: useAIProfilesMock,
  useAIModels: useAIModelsMock,
}));

vi.mock("./use-generate-cards", () => ({
  useGenerateCards: useGenerateCardsMock,
}));

vi.mock("@lingui/react", () => ({
  useLingui: () => ({ _: (value: string) => value }),
}));

vi.mock("jotai", async () => {
  const actual = await vi.importActual<typeof JotaiModule>("jotai");

  return {
    ...actual,
    useAtomValue: useAtomValueMock,
  };
});

describe("useGenerateCardsDialog", () => {
  it("resets dialog state and cancels the current conversation when closed", async () => {
    const {
      result,
      cancelMock,
      profile,
      template,
    } = renderGenerateCardsDialog();

    await waitFor(() => expect(result.current.template?.id).toBe(template.id));

    act(() => {
      result.current.handleOpenChange(true);
      result.current.handleProfileChange(profile.id);
    });

    await waitFor(() => expect(result.current.modelId).toBe(profile.lastUsedModel));

    await act(async () => {
      await result.current.handleGenerate("First prompt");
    });

    expect(result.current.messages).toHaveLength(2);

    act(() => {
      result.current.handleOpenChange(false);
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.profileId).toBe("");
    expect(result.current.modelId).toBe("");
    expect(result.current.messages).toEqual([]);
    expect(cancelMock).toHaveBeenCalled();
  });

  it("appends user and assistant messages and touches the selected AI profile on generate", async () => {
    const {
      result,
      generateMock,
      touchProfileMutationFn,
      profile,
      template,
      setIsGenerating,
    } = renderGenerateCardsDialog();

    await waitFor(() => expect(result.current.template?.id).toBe(template.id));

    act(() => {
      result.current.handleOpenChange(true);
      result.current.handleProfileChange(profile.id);
    });

    await waitFor(() => expect(result.current.modelId).toBe(profile.lastUsedModel));

    act(() => {
      result.current.setMode("generate");
      setIsGenerating(true);
    });

    await act(async () => {
      await result.current.handleGenerate("  Explain noun genders  ");
    });

    await waitFor(() =>
      expect(touchProfileMutationFn).toHaveBeenCalledWith(
        {
          id: profile.id,
          modelId: profile.lastUsedModel,
        },
        expect.any(Object),
      )
    );
    expect(generateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          modelId: profile.lastUsedModel,
          prompt: "Explain noun genders",
          temperature: 0.2,
          reasoningEffort: "",
          deckId: 1,
          templateId: template.id,
        },
        messages: [],
      }),
      expect.any(Function),
    );
    expect(result.current.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(result.current.messages[1]?.metadata).toMatchObject({
      kind: "generated-cards",
    });
  });

  it("includes the last successful assistant output in the next request context", async () => {
    const {
      result,
      generateMock,
      setCards,
      setIsGenerating,
      profile,
      template,
    } = renderGenerateCardsDialog();
    const firstRunCards = [
      createGeneratedCard({
        content: {
          "1": { text: "First front" },
          "2": { text: "First back" },
        },
      }),
    ];

    await waitFor(() => expect(result.current.template?.id).toBe(template.id));

    act(() => {
      result.current.handleProfileChange(profile.id);
    });

    await waitFor(() => expect(result.current.modelId).toBe(profile.lastUsedModel));

    act(() => {
      result.current.setMode("generate");
      setIsGenerating(true);
    });

    setCards(firstRunCards);

    await act(async () => {
      await result.current.handleGenerate("First prompt");
    });

    expect(result.current.getGeneratedCardsProps(result.current.messages[1]!)?.cards).toEqual(firstRunCards);

    act(() => {
      result.current.setMode("generate");
      setIsGenerating(true);
    });

    await act(async () => {
      await result.current.handleGenerate("Second prompt");
    });

    expect(generateMock.mock.calls[1]?.[0]?.messages).toEqual([
      { role: "user", content: "First prompt" },
      { role: "assistant", content: serializeGeneratedCards(firstRunCards, template) },
    ]);
  });

  it("skips canceled assistant runs when building the next assistant context", async () => {
    const {
      result,
      generateMock,
      profile,
      template,
      setIsGenerating,
    } = renderGenerateCardsDialog();

    await waitFor(() => expect(result.current.template?.id).toBe(template.id));

    act(() => {
      result.current.handleProfileChange(profile.id);
    });

    await waitFor(() => expect(result.current.modelId).toBe(profile.lastUsedModel));

    act(() => {
      result.current.setMode("generate");
      setIsGenerating(true);
    });

    generateMock.mockImplementationOnce(async (
      _request: { messages?: unknown[] },
      _onCard?: (card: GeneratedCard) => void,
    ) => "aborted" as const);

    await act(async () => {
      await result.current.handleGenerate("First prompt");
    });

    expect(result.current.getGeneratedCardsProps(result.current.messages[1]!)?.isCanceled).toBe(true);

    act(() => {
      result.current.setMode("generate");
      setIsGenerating(true);
    });

    await act(async () => {
      await result.current.handleGenerate("Second prompt");
    });

    expect(generateMock.mock.calls[1]?.[0]?.messages).toEqual([
      { role: "user", content: "First prompt" },
    ]);
    expect(generateMock.mock.calls[1]?.[0]?.messages).not.toContainEqual({
      role: "assistant",
      content: expect.any(String),
    });
  });

  it("passes custom generation prompt template to the generate request", async () => {
    const {
      result,
      generateMock,
      profile,
      template,
      setIsGenerating,
    } = renderGenerateCardsDialog();

    await waitFor(() => expect(result.current.template?.id).toBe(template.id));

    act(() => {
      result.current.handleOpenChange(true);
      result.current.handleProfileChange(profile.id);
    });

    await waitFor(() => expect(result.current.modelId).toBe(profile.lastUsedModel));

    act(() => {
      result.current.setMode("generate");
      setIsGenerating(true);
      result.current.handleGenerationPromptChange("Custom generation template with {{fields}} and {{rules}}");
    });

    await act(async () => {
      await result.current.handleGenerate("Generate cards");
    });

    expect(generateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPromptTemplate: "Custom generation template with {{fields}} and {{rules}}",
      }),
      expect.any(Function),
    );
  });

});

function renderGenerateCardsDialog() {
  const profile = createAIProfile();
  const template = createTemplate();
  const model = createAIModel({ id: profile.lastUsedModel!, name: "GPT-5 Mini" });
  const touchProfileMutationFn = vi.fn(async () => undefined);
  const cancelMock = vi.fn();
  const generateMock = vi.fn(
    async (_request: { messages?: unknown[] }, onCard?: (card: GeneratedCard) => void): Promise<string> => {
      cards.forEach((c) => onCard?.(c));
      return "success";
    },
  );
  let cards: GeneratedCard[] = [];
  let isGenerating = false;
  let error: Error | null = null;

  useAtomValueMock.mockReturnValue({
    getTemplateQuery: () => ({
      queryFn: async () => template,
    }),
    touchAIProfileMutation: () => ({
      mutationFn: touchProfileMutationFn,
    }),
  });
  useAIProfilesMock.mockImplementation((profileId?: string | null) => ({
    profiles: [profile],
    selectedProfile: profileId ? profile : null,
  }));
  useAIModelsMock.mockReturnValue({
    models: [model, createAIModel({ id: "openrouter/other", name: "Other" })],
  });
  useGenerateCardsMock.mockImplementation(() => ({
    cards,
    isGenerating,
    error,
    generate: generateMock,
    cancel: cancelMock,
  }));

  const queryClient = createQueryClient();
  const wrapper = createQueryClientWrapper(queryClient);
  const rendered = renderHook(() => useGenerateCardsDialog(1, template.id), { wrapper });

  return {
    ...rendered,
    profile,
    template,
    generateMock,
    cancelMock,
    touchProfileMutationFn,
    setCards(nextCards: GeneratedCard[]) {
      cards = nextCards;
    },
    setIsGenerating(nextValue: boolean) {
      isGenerating = nextValue;
    },
    setError(nextValue: Error | null) {
      error = nextValue;
    },
  };
}
