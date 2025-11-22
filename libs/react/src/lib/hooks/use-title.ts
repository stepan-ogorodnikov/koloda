import { useLingui } from "@lingui/react";
import { useMatches } from "@tanstack/react-router";
import { useEffect } from "react";

export function useTitle() {
  const { _ } = useLingui();
  const matches = useMatches();
  const items = matches.map((x) => x.loaderData?.title).filter(Boolean).reverse();

  useEffect(() => {
    document.title = items.map(_).join(" · ");
  }, [items, _]);

  return null;
}
