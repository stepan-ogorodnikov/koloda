import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useStreamingRequest } from "./use-streaming-request";

describe("useStreamingRequest", () => {
  describe("initial state", () => {
    it("returns initialData as data with null error and result, isRunning false", () => {
      const { result } = renderHook(() =>
        useStreamingRequest({
          initialData: "starting",
          accumulate: (prev, chunk) => prev + chunk,
          executor: async () => {},
        }),
      );

      expect(result.current.data).toBe("starting");
      expect(result.current.result).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.isRunning).toBe(false);
    });
  });

  describe("successful stream", () => {
    it("accumulates chunks into data and delivers them to external onChunk", async () => {
      let onChunkCaptured: ((chunk: string) => void) | undefined;

      const executor = vi.fn((_request: string, onChunk: (chunk: string) => void) => {
        onChunkCaptured = onChunk;
        return Promise.resolve("usage-result");
      });

      const { result } = renderHook(() =>
        useStreamingRequest<string, string, string, string>({
          initialData: "",
          accumulate: (prev, chunk) => prev + chunk,
          executor,
        }),
      );

      const externalOnChunk = vi.fn<(chunk: string) => void>();

      act(() => {
        result.current.start("request", externalOnChunk);
      });

      expect(result.current.isRunning).toBe(true);

      act(() => {
        onChunkCaptured!("Hello");
      });
      act(() => {
        onChunkCaptured!(" ");
      });
      act(() => {
        onChunkCaptured!("World");
      });

      expect(result.current.data).toBe("Hello World");
      expect(externalOnChunk).toHaveBeenCalledTimes(3);

      await vi.waitFor(() => {
        expect(result.current.isRunning).toBe(false);
      });

      expect(result.current.data).toBe("Hello World");
      expect(result.current.result).toBe("usage-result");
      expect(result.current.error).toBeNull();
    });

    it("returns success streamResult from start()", async () => {
      const executor = vi.fn(() => Promise.resolve("result-value"));

      const { result } = renderHook(() =>
        useStreamingRequest<string, string, string, string>({
          initialData: "",
          accumulate: (prev, chunk) => prev + chunk,
          executor,
        }),
      );

      let outcome: Awaited<ReturnType<typeof result.current.start>> | undefined;

      await act(async () => {
        outcome = await result.current.start("request");
      });

      expect(outcome).toEqual({ streamResult: "success", result: "result-value" });
    });

    it("handles undefined executor result as null", async () => {
      const executor = vi.fn(() => Promise.resolve(undefined));

      const { result } = renderHook(() =>
        useStreamingRequest<string, string, string, string | undefined>({
          initialData: "",
          accumulate: (prev, chunk) => prev + chunk,
          executor,
        }),
      );

      let outcome: Awaited<ReturnType<typeof result.current.start>> | undefined;

      await act(async () => {
        outcome = await result.current.start("request");
      });

      expect(outcome).toEqual({ streamResult: "success", result: null });
      expect(result.current.result).toBeNull();
    });

    it("passes request and signal to executor", async () => {
      const executor = vi.fn(() => Promise.resolve(undefined));

      const { result } = renderHook(() =>
        useStreamingRequest({
          initialData: "",
          accumulate: (prev: string, chunk: string) => prev + chunk,
          executor,
        }),
      );

      await act(async () => {
        await result.current.start("the-request");
      });

      expect(executor).toHaveBeenCalledWith("the-request", expect.any(Function), expect.any(AbortSignal));
      const callArgs = executor.mock.calls[0] as unknown as [string, (chunk: string) => void, AbortSignal] | undefined;
      expect(callArgs?.[2]).toBeInstanceOf(AbortSignal);
      expect(callArgs?.[2].aborted).toBe(false);
    });
  });

  describe("error handling", () => {
    it("sets error state when executor throws", async () => {
      const executor = vi.fn(() => Promise.reject(new Error("Network failure")));

      const { result } = renderHook(() =>
        useStreamingRequest({
          initialData: "",
          accumulate: (prev, chunk) => prev + chunk,
          executor,
        }),
      );

      let outcome: Awaited<ReturnType<typeof result.current.start>> | undefined;

      await act(async () => {
        outcome = await result.current.start("request");
      });

      expect(outcome).toEqual({ streamResult: "error", result: null });
      expect(result.current.isRunning).toBe(false);
      expect(result.current.error).toEqual(new Error("Network failure"));
    });

    it("wraps non-Error thrown values in Error", async () => {
      const executor = vi.fn(() => Promise.reject("string error"));

      const { result } = renderHook(() =>
        useStreamingRequest({
          initialData: "",
          accumulate: (prev, chunk) => prev + chunk,
          executor,
        }),
      );

      let outcome: Awaited<ReturnType<typeof result.current.start>> | undefined;

      await act(async () => {
        outcome = await result.current.start("request");
      });

      expect(outcome).toEqual({ streamResult: "error", result: null });
      expect(result.current.error).toEqual(new Error("string error"));
    });

    it("clears error when a new stream starts", async () => {
      let rejectFirst: ((e: Error) => void) | undefined;

      const executor = vi.fn((_request: string) => {
        return new Promise<string | undefined>((_resolve, reject) => {
          rejectFirst = reject;
        });
      });

      const { result } = renderHook(() =>
        useStreamingRequest<string, string, string, string | undefined>({
          initialData: "",
          accumulate: (prev, chunk) => prev + chunk,
          executor,
        }),
      );

      act(() => {
        result.current.start("first");
      });

      // Reject first stream to produce an error
      await act(async () => {
        rejectFirst!(new Error("first failed"));
      });

      await vi.waitFor(() => {
        expect(result.current.error).toEqual(new Error("first failed"));
      });
      expect(result.current.isRunning).toBe(false);

      // Start a new stream — error should be cleared
      act(() => {
        result.current.start("second");
      });

      expect(result.current.error).toBeNull();
      expect(result.current.isRunning).toBe(true);
    });
  });

  describe("abort handling", () => {
    it("calling cancel() stops the stream and clears running state", async () => {
      const executor = vi.fn((_request: string, _onChunk: (chunk: string) => void, signal: AbortSignal) => {
        return new Promise<string | undefined>((resolve) => {
          signal.addEventListener("abort", () => resolve(undefined));
        });
      });

      const { result } = renderHook(() =>
        useStreamingRequest<string, string, string, string | undefined>({
          initialData: "",
          accumulate: (prev, chunk) => prev + chunk,
          executor,
        }),
      );

      act(() => {
        result.current.start("request");
      });

      expect(result.current.isRunning).toBe(true);

      act(() => {
        result.current.cancel();
      });

      expect(result.current.isRunning).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("returns aborted streamResult when executor checks signal and throws AbortError", async () => {
      const executor = vi.fn((_request: string, _onChunk: (chunk: string) => void, signal: AbortSignal) => {
        return new Promise<string | undefined>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        });
      });

      const { result } = renderHook(() =>
        useStreamingRequest<string, string, string, string | undefined>({
          initialData: "",
          accumulate: (prev, chunk) => prev + chunk,
          executor,
        }),
      );

      let startResult: ReturnType<typeof result.current.start> = undefined!;

      act(() => {
        startResult = result.current.start("request");
      });

      act(() => {
        result.current.cancel();
      });

      await expect(startResult).resolves.toEqual({ streamResult: "aborted", result: null });
    });

    it("returns aborted when executor throws AbortError", async () => {
      const executor = vi.fn((_request: string, _onChunk: (chunk: string) => void) => {
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      });

      const { result } = renderHook(() =>
        useStreamingRequest({
          initialData: "",
          accumulate: (prev, chunk) => prev + chunk,
          executor,
        }),
      );

      let outcome: Awaited<ReturnType<typeof result.current.start>> | undefined;

      await act(async () => {
        outcome = await result.current.start("request");
      });

      expect(outcome).toEqual({ streamResult: "aborted", result: null });
      expect(result.current.isRunning).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("ignores chunks emitted after the signal is aborted", async () => {
      const executor = vi.fn((_request: string, onChunk: (chunk: string) => void, signal: AbortSignal) => {
        signal.addEventListener("abort", () => {
          onChunk("after-abort");
        });
        return new Promise<string | undefined>((resolve) => {
          signal.addEventListener("abort", () => resolve(undefined));
        });
      });

      const { result } = renderHook(() =>
        useStreamingRequest<string, string, string, string | undefined>({
          initialData: "",
          accumulate: (prev, chunk) => prev + chunk,
          executor,
        }),
      );

      const streamPromise = result.current.start("request");

      await vi.waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      act(() => {
        result.current.cancel();
      });

      await streamPromise;

      expect(result.current.data).toBe("");
    });

    it("aborts previous stream when a new one starts", async () => {
      const abortedSignals: AbortSignal[] = [];

      const executor = vi.fn((_request: string, _onChunk: (chunk: string) => void, signal: AbortSignal) => {
        signal.addEventListener("abort", () => {
          abortedSignals.push(signal);
        });
        return new Promise<string | undefined>(() => {});
      });

      const { result } = renderHook(() =>
        useStreamingRequest<string, string, string, string | undefined>({
          initialData: "",
          accumulate: (prev, chunk) => prev + chunk,
          executor,
        }),
      );

      act(() => {
        result.current.start("first");
      });

      expect(result.current.isRunning).toBe(true);

      act(() => {
        result.current.start("second");
      });

      expect(abortedSignals).toHaveLength(1);
      expect(result.current.isRunning).toBe(true);
    });
  });

  describe("reset", () => {
    it("resets data to initialData and clears error", async () => {
      let onChunkCaptured: ((chunk: string) => void) | undefined;
      let rejectCaptured: ((e: Error) => void) | undefined;

      const executor = vi.fn((_request: string, onChunk: (chunk: string) => void) => {
        onChunkCaptured = onChunk;
        return new Promise<string | undefined>((_resolve, reject) => {
          rejectCaptured = reject;
        });
      });

      const { result } = renderHook(() =>
        useStreamingRequest<string, string, string, string | undefined>({
          initialData: "",
          accumulate: (prev, chunk) => prev + chunk,
          executor,
        }),
      );

      act(() => {
        result.current.start("request");
      });

      act(() => {
        onChunkCaptured!("data");
      });

      await act(async () => {
        rejectCaptured!(new Error("fail"));
      });

      await vi.waitFor(() => {
        expect(result.current.data).toBe("data");
      });
      expect(result.current.error).toEqual(new Error("fail"));

      act(() => {
        result.current.reset();
      });

      expect(result.current.data).toBe("");
      expect(result.current.error).toBeNull();
    });
  });

  describe("cleanup on unmount", () => {
    it("aborts the stream when component unmounts", () => {
      const abortedSignals: AbortSignal[] = [];

      const executor = vi.fn((_request: string, _onChunk: (chunk: string) => void, signal: AbortSignal) => {
        signal.addEventListener("abort", () => {
          abortedSignals.push(signal);
        });
        return new Promise<string | undefined>(() => {});
      });

      const { result, unmount } = renderHook(() =>
        useStreamingRequest<string, string, string, string | undefined>({
          initialData: "",
          accumulate: (prev, chunk) => prev + chunk,
          executor,
        }),
      );

      act(() => {
        result.current.start("request");
      });

      expect(result.current.isRunning).toBe(true);
      expect(abortedSignals).toHaveLength(0);

      unmount();

      expect(abortedSignals).toHaveLength(1);
    });
  });

  describe("accumulation via ref", () => {
    it("uses latest accumulate function even when captured at start", async () => {
      let onChunkCaptured: ((chunk: string) => void) | undefined;

      const executor = vi.fn((_request: string, onChunk: (chunk: string) => void) => {
        onChunkCaptured = onChunk;
        return Promise.resolve(undefined);
      });

      const { result } = renderHook(() =>
        useStreamingRequest<string, string, string, string | undefined>({
          initialData: "",
          accumulate: (prev, chunk) => prev + chunk,
          executor,
        }),
      );

      act(() => {
        result.current.start("request");
      });

      act(() => {
        onChunkCaptured!("A");
      });
      act(() => {
        onChunkCaptured!("B");
      });

      expect(result.current.data).toBe("AB");
    });
  });
});
