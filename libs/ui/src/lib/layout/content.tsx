import { useMediaQuery } from "@react-hook/media-query";
import { useMatch, useRouterState } from "@tanstack/react-router";
import { atom, useAtom, useSetAtom } from "jotai";
import type { ComponentProps, PropsWithChildren } from "react";
import { useLayoutEffect } from "react";
import { tv } from "tailwind-variants";
import { getCSSVar } from "../utility";
import { drawerOpenAtom } from "./drawer";

export const layoutHasContentAtom = atom(false);

const layoutContent = tv({
  base: [
    "grow flex-col h-full min-h-0 min-w-0 overflow-hidden",
    "wd:w-full wd:grow-0 wd:basis-full wd:mx-auto",
  ],
  variants: { hasContent: { true: "flex", false: "hidden" } },
});

type LayoutContentProps = PropsWithChildren & {
  isAlwaysVisible?: boolean;
};

export function LayoutContent({ children, isAlwaysVisible }: LayoutContentProps) {
  const matchId = useMatch({ strict: false, select: (m) => m.id });
  const hasChildRoute = useRouterState({
    select: (s) => {
      const index = s.matches.findIndex((m) => m.id === matchId);
      return !!s.matches[index + 1];
    },
  });
  const hasContent = hasChildRoute || !!isAlwaysVisible;
  const setHasContent = useSetAtom(layoutHasContentAtom);
  const [isDrawerOpen] = useAtom(drawerOpenAtom);
  const isNarrow = useMediaQuery(`(width < ${getCSSVar("--breakpoint-wd")})`);
  const isInert = isNarrow && hasContent && isDrawerOpen;

  useLayoutEffect(() => {
    setHasContent(hasContent);
    return () => setHasContent(false);
  }, [hasContent, setHasContent]);

  return (
    <div className={layoutContent({ hasContent })} {...(isInert ? { inert: true } : {})}>
      {children}
    </div>
  );
}

type LayoutContainerProps = ComponentProps<"div">;

export function LayoutContainer(props: LayoutContainerProps) {
  return (
    <div
      className="grow flex flex-col w-full min-w-0 min-h-0 overflow-y-auto no-focus-ring"
      {...props}
    />
  );
}
