import { queriesAtom } from "@koloda/core-react";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import type { RefObject } from "react";
import { createAttachmentImageCache } from "./attachment-image-cache";
import type { AttachmentImageCache } from "./attachment-image-cache";

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

  useEffect(() => {
    const images = containerRef.current?.querySelectorAll<HTMLImageElement>("img[data-attachment-id]") ?? [];
    let isCurrent = true;
    const leases = Array.from(images, (img) => {
      const lease = cache.acquire(img.dataset.attachmentId ?? "");
      // WHY: browsers draw a broken-image icon for an image without a source or with unreadable bytes.
      // Its place stays empty while it loads; a missing or unreadable attachment becomes its alt text.
      img.classList.add("invisible");
      img.addEventListener("error", () => img.replaceWith(img.alt), { once: true });
      void lease.image.then((image) => {
        if (!isCurrent) return;
        if (!image) {
          img.replaceWith(img.alt);
          return;
        }
        img.src = image.url;
        if (image.width) img.width = image.width;
        if (image.height) img.height = image.height;
        img.classList.remove("invisible");
      });
      return lease;
    });

    return () => {
      isCurrent = false;
      for (const lease of leases) lease.release();
    };
  }, [cache, containerRef, html]);
}
