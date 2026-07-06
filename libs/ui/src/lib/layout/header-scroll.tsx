import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { useScrolledPast } from "../hooks/use-scrolled-past";

type LayoutHeaderScrollContextValue = {
  isScrolled: boolean;
  reportScroll: (id: string, value: boolean) => void;
  unregister: (id: string) => void;
};

const LayoutHeaderScrollContext = createContext<LayoutHeaderScrollContextValue | null>(null);

export function LayoutHeaderScrollProvider({ children }: { children: ReactNode }) {
  const [reporters, setReporters] = useState<ReadonlyMap<string, boolean>>(() => new Map());

  const reportScroll = useCallback((id: string, value: boolean) => {
    setReporters((prev) => {
      if (prev.get(id) === value) return prev;
      const next = new Map(prev);
      next.set(id, value);
      return next;
    });
  }, []);

  const unregister = useCallback((id: string) => {
    setReporters((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const isScrolled = useMemo(() => {
    for (const value of reporters.values()) {
      if (value) return true;
    }
    return false;
  }, [reporters]);

  const value = useMemo(() => (
    { isScrolled, reportScroll, unregister }
  ), [isScrolled, reportScroll, unregister]);

  return (
    <LayoutHeaderScrollContext.Provider value={value}>
      {children}
    </LayoutHeaderScrollContext.Provider>
  );
}

export function useLayoutHeaderScroll(): LayoutHeaderScrollContextValue | null {
  return useContext(LayoutHeaderScrollContext);
}

export function useReportLayoutHeaderScroll(isScrolled: boolean) {
  const ctx = useContext(LayoutHeaderScrollContext);
  const id = useId();
  const reportScroll = ctx?.reportScroll;
  const unregister = ctx?.unregister;

  useEffect(() => {
    if (!reportScroll || !unregister) return;
    reportScroll(id, isScrolled);
    return () => unregister(id);
  }, [reportScroll, unregister, id, isScrolled]);
}

export function useLayoutHeaderScrollShadow<T extends HTMLElement>(ref: RefObject<T | null>, threshold = 0) {
  const isScrolled = useScrolledPast(ref, threshold);
  useReportLayoutHeaderScroll(isScrolled);

  return isScrolled;
}
