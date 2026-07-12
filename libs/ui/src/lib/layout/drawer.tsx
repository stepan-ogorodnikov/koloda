import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMediaQuery } from "@react-hook/media-query";
import { useRouterState } from "@tanstack/react-router";
import { atom, useAtom } from "jotai";
import type { Dispatch, MouseEvent, SetStateAction } from "react";
import { useCallback, useEffect } from "react";
import { tv } from "tailwind-variants";
import { getCSSVar } from "../utility";
import { layoutHasContentAtom } from "./content";

export const drawerOpenAtom = atom(false);

const layoutDrawerOverlay = tv({
  base: "max-wd:grow flex flex-row shrink-0",
  variants: {
    hasContent: {
      true: [
        "max-wd:absolute max-wd:inset-0 max-wd:z-50 max-wd:bg-overlay max-wd:animate-opacity",
        "max-wd:opacity-0 max-wd:pointer-events-none",
      ],
      false: "",
    },
    isOpen: { true: "", false: "" },
  },
  compoundVariants: [
    {
      hasContent: true,
      isOpen: true,
      class: "max-wd:opacity-100 max-wd:pointer-events-auto",
    },
  ],
});

const layoutDrawerPanel = tv({
  base: "flex flex-row shrink-0 bg-transparent",
  variants: {
    hasContent: {
      true: "max-wd:bg-level-1 max-wd:transition-transform max-wd:duration-250 max-wd:-translate-x-full",
      false: "max-wd:grow",
    },
    isOpen: { true: "", false: "" },
  },
  compoundVariants: [
    {
      hasContent: true,
      isOpen: true,
      class: "max-wd:translate-x-0",
    },
  ],
});

const layoutDrawerSidebar = tv({
  base: [
    "flex flex-col shrink-0 overflow-hidden border-r-2 border-main empty:hidden",
    "max-wd:w-[clamp(14rem,80vw,20rem)] wd:w-[clamp(14rem,25vw,20rem)]",
  ],
  variants: {
    hasContent: {
      true: "",
      false: "",
    },
  },
});

type LayoutDrawerProps = {
  setNavPortal: Dispatch<SetStateAction<HTMLElement | null>>;
  setSidebarPortal: Dispatch<SetStateAction<HTMLElement | null>>;
};

export function LayoutDrawer({ setNavPortal, setSidebarPortal }: LayoutDrawerProps) {
  const { _ } = useLingui();
  const { isOpen, close } = useLayoutDrawer();
  const isNarrow = useMediaQuery(`(width < ${getCSSVar("--breakpoint-wd")})`);
  const location = useRouterState({ select: (s) => s.location.pathname });
  const [hasContent] = useAtom(layoutHasContentAtom);
  const drawerLabel = isNarrow && hasContent ? _(msg`layout.drawer.label`) : undefined;
  const isInert = isNarrow && hasContent && !isOpen;

  useEffect(() => {
    if (!isOpen || !hasContent) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, hasContent, isOpen]);

  useEffect(() => {
    if (isNarrow) close();
  }, [close, isNarrow, location]);

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) close();
  };

  return (
    <div
      className={layoutDrawerOverlay({ isOpen, hasContent })}
      onMouseDown={isNarrow && hasContent ? handleMouseDown : undefined}
    >
      <div
        className={layoutDrawerPanel({ isOpen, hasContent })}
        aria-label={drawerLabel}
        role={isNarrow && hasContent ? "dialog" : undefined}
        onMouseDown={isNarrow && hasContent ? (e) => e.stopPropagation() : undefined}
        {...(isInert ? { inert: true } : {})}
      >
        <div
          className="flex flex-col shrink-0 gap-2 h-full p-2 border-r-2 border-main empty:hidden overflow-y-auto"
          ref={setNavPortal}
        />
        <div className={layoutDrawerSidebar({ hasContent })} ref={setSidebarPortal} />
      </div>
    </div>
  );
}

export function useLayoutDrawer() {
  const [isOpen, setIsOpen] = useAtom(drawerOpenAtom);

  const open = useCallback(() => {
    setIsOpen(true);
  }, [setIsOpen]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, [setIsOpen]);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, [setIsOpen]);

  return { isOpen, open, close, toggle };
}
