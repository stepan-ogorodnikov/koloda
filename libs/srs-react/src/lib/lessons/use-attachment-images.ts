import { fetchedAttachmentsAtom, queriesAtom } from "@koloda/core-react";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useAtomValue, useStore } from "jotai";
import { useEffect } from "react";
import type { RefObject } from "react";
import { createAttachmentImageCache } from "./attachment-image-cache";
import type { AttachmentImageCache, AttachmentImageLease } from "./attachment-image-cache";

const RELEASED_IMAGES_LIMIT = 8;

const caches = new WeakMap<QueryClient, AttachmentImageCache>();

function useAttachmentImageCache() {
  const queryClient = useQueryClient();
  const { getAttachmentQuery } = useAtomValue(queriesAtom);
  let cache = caches.get(queryClient);
  if (!cache) {
    // WHY: gcTime 0 drops the bytes from the query cache once fetched; the Blob is the only copy.
    cache = createAttachmentImageCache(
      (id) => queryClient.fetchQuery({ ...getAttachmentQuery(id), gcTime: 0 }),
      RELEASED_IMAGES_LIMIT,
    );
    caches.set(queryClient, cache);
  }
  return cache;
}

export function useAttachmentImages(containerRef: RefObject<HTMLElement | null>, html: string) {
  const cache = useAttachmentImageCache();
  const store = useStore();

  useEffect(() => {
    const images = containerRef.current?.querySelectorAll<HTMLImageElement>("img[data-attachment-id]") ?? [];
    let isCurrent = true;
    const leases: AttachmentImageLease[] = [];
    const missing = new Map<HTMLImageElement, Text>();

    const show = (img: HTMLImageElement) => {
      const lease = cache.acquire(img.dataset.attachmentId ?? "");
      leases.push(lease);
      // WHY: browsers draw a broken-image icon for an image without a source or with unreadable bytes.
      // Its place stays empty while it loads; a missing or unreadable attachment becomes its alt text.
      img.classList.add("invisible");
      img.addEventListener("error", () => img.replaceWith(img.alt), { once: true });
      void lease.image.then((image) => {
        if (!isCurrent) return;
        if (!image) {
          const altText = document.createTextNode(img.alt);
          img.replaceWith(altText);
          missing.set(img, altText);
          return;
        }
        img.src = image.url;
        if (image.width) img.width = image.width;
        if (image.height) img.height = image.height;
        img.classList.remove("invisible");
      });
    };

    images.forEach(show);

    // WHY: sync may download a missing image while it is shown (`SYNC.md` §Status). The field's HTML does not change,
    // so this effect does not re-run; the `<img>` it replaced comes back and loads again.
    const unsubscribe = store.sub(fetchedAttachmentsAtom, () => {
      const ids = store.get(fetchedAttachmentsAtom);
      for (const [img, altText] of missing) {
        if (!ids.includes(img.dataset.attachmentId ?? "")) continue;
        missing.delete(img);
        altText.replaceWith(img);
        show(img);
      }
    });

    return () => {
      isCurrent = false;
      unsubscribe();
      for (const lease of leases) lease.release();
    };
  }, [cache, containerRef, html, store]);
}
