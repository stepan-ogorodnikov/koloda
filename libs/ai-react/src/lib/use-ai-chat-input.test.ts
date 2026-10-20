import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UseAutoScrollReturn } from "./use-auto-scroll";
import { useAIChatInput } from "./use-ai-chat-input";

function makeScroll(): UseAutoScrollReturn {
  return {
    messagesRef: { current: null },
    scrollViewportRef: { current: null },
    showJumpToLatest: false,
    handleScroll: vi.fn(),
    handleScrollToLatest: vi.fn(),
    handleScrollUp: vi.fn(),
    handleScrollDown: vi.fn(),
    handleScrollToTop: vi.fn(),
    handleScrollToBottom: vi.fn(),
    prepareSubmit: vi.fn(() => false),
    startFollowingLatest: vi.fn(),
    resetScroll: vi.fn(),
  };
}

describe("useAIChatInput submit", () => {
  it("keeps the composer text and sends nothing when submit is blocked", () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    const { result } = renderHook(() =>
      useAIChatInput({ value: "draft", onChange, onSubmit, canSubmit: false, scroll: makeScroll() }),
    );

    result.current.submit();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("sends the trimmed prompt and clears the composer when submit is allowed", () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    const { result } = renderHook(() =>
      useAIChatInput({ value: "  hello  ", onChange, onSubmit, canSubmit: true, scroll: makeScroll() }),
    );

    result.current.submit();

    expect(onSubmit).toHaveBeenCalledWith("hello");
    expect(onChange).toHaveBeenCalledWith("");
  });
});
