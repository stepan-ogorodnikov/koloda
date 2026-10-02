import type { Attachment, AttachmentContent } from "@koloda/srs";

export type AttachmentImage = Pick<Attachment, "width" | "height"> & { url: string };

export type AttachmentImageLease = {
  image: Promise<AttachmentImage | null>;
  release: () => void;
};

export type AttachmentImageCache = {
  acquire: (id: Attachment["id"]) => AttachmentImageLease;
};

type LoadAttachment = (id: Attachment["id"]) => Promise<AttachmentContent | null>;

type Entry = {
  refs: number;
  image: Promise<AttachmentImage | null>;
  url: string | null;
  isEvicted: boolean;
};

export function createAttachmentImageCache(load: LoadAttachment, releasedLimit: number): AttachmentImageCache {
  const entries = new Map<Attachment["id"], Entry>();
  // INVARIANT: iteration order is release order, least recently released first.
  const released = new Set<Attachment["id"]>();

  const drop = (id: Attachment["id"], entry: Entry) => {
    if (entries.get(id) !== entry) return;
    entries.delete(id);
    released.delete(id);
  };

  const evict = (id: Attachment["id"], entry: Entry) => {
    drop(id, entry);
    entry.isEvicted = true;
    if (entry.url) URL.revokeObjectURL(entry.url);
  };

  const open = (id: Attachment["id"]) => {
    const entry: Entry = { refs: 0, image: Promise.resolve(null), url: null, isEvicted: false };
    entry.image = load(id).then(
      (content) => {
        // WHY: a missing attachment is not cached, so the next acquire asks the database again.
        if (!content) {
          drop(id, entry);
          return null;
        }
        // WHY: evicted while loading means nothing holds it; a URL made now would never be revoked.
        if (entry.isEvicted) return null;
        entry.url = URL.createObjectURL(new Blob([content.bytes], { type: content.mime }));
        return { url: entry.url, width: content.width, height: content.height };
      },
      () => {
        drop(id, entry);
        return null;
      },
    );
    entries.set(id, entry);
    return entry;
  };

  const release = (id: Attachment["id"], entry: Entry) => {
    entry.refs -= 1;
    if (entry.refs > 0 || entries.get(id) !== entry) return;
    released.add(id);
    for (const oldest of released) {
      if (released.size <= releasedLimit) break;
      const oldestEntry = entries.get(oldest);
      if (oldestEntry) evict(oldest, oldestEntry);
    }
  };

  return {
    acquire(id) {
      const entry = entries.get(id) ?? open(id);
      entry.refs += 1;
      released.delete(id);
      let isReleased = false;
      return {
        image: entry.image,
        release: () => {
          if (isReleased) return;
          isReleased = true;
          release(id, entry);
        },
      };
    },
  };
}
