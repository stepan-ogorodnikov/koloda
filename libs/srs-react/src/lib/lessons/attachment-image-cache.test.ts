import type { AttachmentContent } from "@koloda/srs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAttachmentImageCache } from "./attachment-image-cache";

type Deferred = {
  promise: Promise<AttachmentContent | null>;
  resolve: (value: AttachmentContent | null) => void;
};

function deferred(): Deferred {
  let resolve!: Deferred["resolve"];
  const promise = new Promise<AttachmentContent | null>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function content(id: string): AttachmentContent {
  return {
    id,
    mime: "image/png",
    size: 1,
    width: 4,
    height: 3,
    createdAt: new Date(0),
    bytes: new Uint8Array([1]),
  };
}

describe("createAttachmentImageCache", () => {
  let loads: Map<string, Deferred[]>;
  let created: string[];
  let revoked: string[];

  const load = (id: string) => {
    const gate = deferred();
    loads.set(id, [...(loads.get(id) ?? []), gate]);
    return gate.promise;
  };

  const settle = (id: string, value: AttachmentContent | null) => {
    loads.get(id)?.at(-1)?.resolve(value);
  };

  beforeEach(() => {
    loads = new Map();
    created = [];
    revoked = [];
    let seq = 0;
    // WHY: jsdom implements neither object URL function.
    Object.assign(URL, {
      createObjectURL: vi.fn(() => {
        const url = `blob:test-${++seq}`;
        created.push(url);
        return url;
      }),
      revokeObjectURL: vi.fn((url: string) => revoked.push(url)),
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  it("makes no URL for a load that resolves after its only lease was released and evicted", async () => {
    const cache = createAttachmentImageCache(load, 0);

    const lease = cache.acquire("a");
    lease.release();
    settle("a", content("a"));

    expect(await lease.image).toBeNull();
    expect(created).toEqual([]);

    cache.acquire("a");
    expect(loads.get("a")).toHaveLength(2);
  });

  it("keeps a URL released before its load resolves for the next acquire", async () => {
    const cache = createAttachmentImageCache(load, 1);

    const first = cache.acquire("a");
    first.release();
    settle("a", content("a"));
    const firstImage = await first.image;

    const second = cache.acquire("a");

    expect(await second.image).toEqual(firstImage);
    expect(firstImage).toEqual({ url: "blob:test-1", width: 4, height: 3 });
    expect(loads.get("a")).toHaveLength(1);
    expect(revoked).toEqual([]);
  });

  it("re-acquires a released URL from the LRU without loading again", async () => {
    const cache = createAttachmentImageCache(load, 1);

    const first = cache.acquire("a");
    settle("a", content("a"));
    const { url } = (await first.image) ?? {};
    first.release();

    const second = cache.acquire("a");

    expect((await second.image)?.url).toBe(url);
    expect(loads.get("a")).toHaveLength(1);
    expect(revoked).toEqual([]);
  });

  it("revokes the least recently released URL when the LRU overflows, and only that one", async () => {
    const cache = createAttachmentImageCache(load, 1);

    const a = cache.acquire("a");
    settle("a", content("a"));
    const aUrl = (await a.image)?.url;
    const b = cache.acquire("b");
    settle("b", content("b"));
    await b.image;
    const c = cache.acquire("c");
    settle("c", content("c"));
    await c.image;

    a.release();
    b.release();
    expect(revoked).toEqual([aUrl]);

    // A held URL is never revoked, however full the LRU gets.
    c.release();
    expect(revoked).toHaveLength(2);
    expect(revoked).not.toContain((await c.image)?.url);
  });

  it("does not revoke a URL while another lease still holds it", async () => {
    const cache = createAttachmentImageCache(load, 0);

    const first = cache.acquire("a");
    const second = cache.acquire("a");
    settle("a", content("a"));
    await first.image;

    first.release();
    first.release();
    expect(revoked).toEqual([]);

    second.release();
    expect(revoked).toEqual(["blob:test-1"]);
  });

  it("does not cache a missing attachment", async () => {
    const cache = createAttachmentImageCache(load, 4);

    const lease = cache.acquire("a");
    settle("a", null);

    expect(await lease.image).toBeNull();
    cache.acquire("a");
    expect(loads.get("a")).toHaveLength(2);
  });
});
