import { useLayoutEffect, useRef } from "react";

export function useRouteFocus(id?: string) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    ref.current?.focus();
  }, [id]);

  return ref;
}
