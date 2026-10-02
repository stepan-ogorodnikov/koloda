import { describe, expect, it, vi } from "vitest";
import { fetchImageBytes } from "./media-ipc";

// WHY: media-ipc registers an IPC handler and reads `app.isPackaged` on import; only the fetch helper is under test.
vi.mock("electron", () => ({ app: { isPackaged: false }, ipcMain: { handle: vi.fn() } }));

const CAP = 5_242_880;

function streamOf(chunks: Uint8Array[], onCancel: () => void) {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel: onCancel,
  });
}

const signal = new AbortController().signal;

describe("fetchImageBytes", () => {
  it("returns the body of a 2xx response", async () => {
    const fetch = vi.fn(async () => new Response(streamOf([new Uint8Array([1, 2]), new Uint8Array([3])], vi.fn())));

    await expect(fetchImageBytes("https://example.test/a.png", fetch, signal)).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(fetch).toHaveBeenCalledWith("https://example.test/a.png", expect.objectContaining({ credentials: "omit" }));
  });

  it("aborts a body that grows past the cap with the too-large code", async () => {
    const onCancel = vi.fn();
    const chunks = [new Uint8Array(CAP), new Uint8Array(1), new Uint8Array(1024)];
    const fetch = vi.fn(async () => new Response(streamOf(chunks, onCancel)));

    await expect(fetchImageBytes("https://example.test/big.png", fetch, signal)).rejects.toThrow(
      '"code":"validation.attachments.too-large"',
    );
    expect(onCancel).toHaveBeenCalled();
  });

  it("accepts a body exactly at the cap", async () => {
    const fetch = vi.fn(async () => new Response(streamOf([new Uint8Array(CAP)], vi.fn())));

    await expect(fetchImageBytes("https://example.test/cap.png", fetch, signal)).resolves.toHaveLength(CAP);
  });

  it("fails a non-2xx status with the fetch code", async () => {
    const fetch = vi.fn(async () => new Response("missing", { status: 404 }));

    await expect(fetchImageBytes("https://example.test/a.png", fetch, signal)).rejects.toThrow(
      '"code":"attachments.fetch"',
    );
  });

  it("rejects a file: URL without fetching it", async () => {
    const fetch = vi.fn();

    await expect(fetchImageBytes("file:///etc/passwd", fetch, signal)).rejects.toThrow('"code":"attachments.fetch"');
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a redirect to a file: URL without following it", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 302, headers: { location: "file:///etc/passwd" } }));

    await expect(fetchImageBytes("https://example.test/a.png", fetch, signal)).rejects.toThrow(
      '"code":"attachments.fetch"',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("maps a network failure to the fetch code", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(fetchImageBytes("https://example.test/a.png", fetch, signal)).rejects.toThrow(
      '"code":"attachments.fetch"',
    );
  });
});
