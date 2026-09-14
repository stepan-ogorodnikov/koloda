import { useCallback, useEffect, useRef, useState } from "react";

type CreatedEntity<TId> = { id: TId } | null | undefined;

export function useEntityCreatedLink<TId>(isSuccess: boolean) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [newId, setNewId] = useState<TId | null>(null);

  useEffect(() => {
    if (newId) linkRef.current?.focus();
  }, [newId]);

  const clearNewId = useCallback(() => {
    setNewId(null);
  }, []);

  const handleCreated = useCallback((returning: CreatedEntity<TId>) => {
    // WHY: reset() fires the form onChange listener, which clears newId; the
    // microtask sets it after that so the success link survives the reset.
    queueMicrotask(() => {
      if (returning) setNewId(returning.id);
    });
  }, []);

  const isLinkVisible = !!(isSuccess && newId);

  return { linkRef, newId, clearNewId, handleCreated, isLinkVisible };
}
