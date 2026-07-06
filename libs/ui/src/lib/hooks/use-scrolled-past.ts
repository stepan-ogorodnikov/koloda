import type { RefObject } from "react";
import { useEffect, useState } from "react";

export function useScrolledPast<T extends HTMLElement>(ref: RefObject<T | null>, threshold = 0) {
  const [isScrolledPast, setIsScrolledPast] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
      setIsScrolledPast(element.scrollTop > threshold);
    };

    update();
    element.addEventListener("scroll", update, { passive: true });

    return () => element.removeEventListener("scroll", update);
  }, [ref, threshold]);

  return isScrolledPast;
}
