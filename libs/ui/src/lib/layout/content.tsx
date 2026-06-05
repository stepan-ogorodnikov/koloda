import { useMatch, useRouterState } from "@tanstack/react-router";
import { atom, useSetAtom } from "jotai";
import type { ComponentProps, PropsWithChildren } from "react";
import { useLayoutEffect } from "react";
import { tv } from "tailwind-variants";

export const layoutHasContentAtom = atom(false);

const layoutContent = tv({
  base: [
    "grow flex-col h-full min-h-0 min-w-0 overflow-hidden",
    "wd:w-full wd:max-w-main wd:grow-0 wd:basis-full wd:mx-auto",
  ],
  variants: { hasContent: { true: "flex", false: "hidden" } },
});

export function LayoutContent({ children }: PropsWithChildren) {
  const matchId = useMatch({ strict: false, select: (m) => m.id });
  const hasContent = useRouterState({
    select: (s) => {
      const index = s.matches.findIndex((m) => m.id === matchId);
      return !!s.matches[index + 1];
    },
  });
  const setHasContent = useSetAtom(layoutHasContentAtom);

  useLayoutEffect(() => {
    setHasContent(hasContent);
    return () => setHasContent(false);
  }, [hasContent, setHasContent]);

  return <div className={layoutContent({ hasContent })}>{children}</div>;
}

type LayoutContainerProps = ComponentProps<"div">;

export function LayoutContainer(props: LayoutContainerProps) {
  return (
    <div
      className="grow flex flex-col w-full max-w-main mx-auto min-w-0 min-h-0 overflow-y-auto no-focus-ring"
      {...props}
    />
  );
}
