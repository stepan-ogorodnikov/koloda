import type { StreamResult } from "@koloda/ai-react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createGeneratedCard } from "../../../test/test-helpers";
import type { GenerateCardsRequest } from "./use-generate-cards";
import { useGenerateCards } from "./use-generate-cards";

function createRequest(overrides: Partial<GenerateCardsRequest> = {}): GenerateCardsRequest {
  return {
    input: {
      modelId: "openrouter/gpt-5-mini",
      prompt: "Generate cards",
      temperature: 0.2,
      deckId: 1,
      templateId: 1,
    },
    messages: [],
    ...overrides,
  };
}

describe("useGenerateCards", () => {
  it("streams cards and reports a successful generation", async () => {
    const streamGenerator = vi.fn(async (_request, onCard) => {
      onCard(createGeneratedCard({ content: { "1": { text: "One" }, "2": { text: "Back one" } } }));
      onCard(createGeneratedCard({ content: { "1": { text: "Two" }, "2": { text: "Back two" } } }));
    });
    const { result } = renderHook(() => useGenerateCards(streamGenerator));

    let isSuccess: StreamResult = "success";
    await act(async () => {
      isSuccess = await result.current.generate(createRequest());
    });

    expect(isSuccess).toBe("success");
    expect(result.current.cards).toEqual([
      createGeneratedCard({ content: { "1": { text: "One" }, "2": { text: "Back one" } } }),
      createGeneratedCard({ content: { "1": { text: "Two" }, "2": { text: "Back two" } } }),
    ]);
    expect(result.current.error).toBeNull();
    expect(result.current.isGenerating).toBe(false);
  });

  it("stores non-abort errors and clears them on the next successful run", async () => {
    const streamGenerator = vi.fn()
      .mockImplementationOnce(async () => {
        throw new Error("boom");
      })
      .mockImplementationOnce(async (_request, onCard) => {
        onCard(createGeneratedCard());
      });
    const { result } = renderHook(() => useGenerateCards(streamGenerator));

    await act(async () => {
      await result.current.generate(createRequest());
    });

    expect(result.current.error?.message).toBe("boom");

    await act(async () => {
      await result.current.generate(createRequest({ input: { ...createRequest().input, prompt: "Retry" } }));
    });

    expect(result.current.error).toBeNull();
    expect(result.current.cards).toEqual([createGeneratedCard()]);
  });

  it("cancels an in-flight request without surfacing an error", async () => {
    let generationPromise!: Promise<StreamResult>;
    let signalRef: AbortSignal | undefined;
    const streamGenerator = vi.fn((_request, _onCard, signal: AbortSignal) => {
      signalRef = signal;

      return new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      });
    });
    const { result } = renderHook(() => useGenerateCards(streamGenerator));

    act(() => {
      generationPromise = result.current.generate(createRequest());
    });

    await waitFor(() => expect(result.current.isGenerating).toBe(true));
    act(() => {
      result.current.cancel();
    });

    await expect(generationPromise).resolves.toBe("aborted");
    await waitFor(() => expect(result.current.isGenerating).toBe(false));
    expect(signalRef?.aborted).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("aborts the previous run when a new generation starts and stays loading for the active request", async () => {
    let firstPromise!: Promise<StreamResult>;
    let secondPromise!: Promise<StreamResult>;
    const signals: AbortSignal[] = [];
    let resolveSecond!: () => void;
    const streamGenerator = vi.fn()
      .mockImplementationOnce((_request, _onCard, signal: AbortSignal) => {
        signals.push(signal);

        return new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          }, { once: true });
        });
      })
      .mockImplementationOnce(async (_request, onCard, signal: AbortSignal) => {
        signals.push(signal);

        await new Promise<void>((resolve) => {
          resolveSecond = resolve;
        });

        if (!signal.aborted) onCard(createGeneratedCard());
      });
    const { result } = renderHook(() => useGenerateCards(streamGenerator));

    act(() => {
      firstPromise = result.current.generate(createRequest());
    });

    await waitFor(() => expect(result.current.isGenerating).toBe(true));

    act(() => {
      secondPromise = result.current.generate(createRequest({
        input: { ...createRequest().input, prompt: "Second prompt" },
      }));
    });

    await waitFor(() => expect(streamGenerator).toHaveBeenCalledTimes(2));
    expect(signals[0]?.aborted).toBe(true);
    expect(result.current.isGenerating).toBe(true);

    act(() => {
      resolveSecond();
    });

    await expect(firstPromise).resolves.toBe("aborted");
    await expect(secondPromise).resolves.toBe("success");
    await waitFor(() => expect(result.current.isGenerating).toBe(false));
    expect(result.current.cards).toEqual([createGeneratedCard()]);
  });
});
