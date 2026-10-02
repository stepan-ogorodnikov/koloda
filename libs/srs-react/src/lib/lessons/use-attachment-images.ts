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
      // WHY: an image without a source shows its alt text; keep its place empty until the load settles.
      // A missing or unreadable attachment keeps no source, so its alt text shows after that.
      img.classList.add("invisible");
      void lease.image.then((image) => {
        if (!isCurrent) return;
        if (image) {
          img.src = image.url;
          if (image.width) img.width = image.width;
          if (image.height) img.height = image.height;
        }
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
