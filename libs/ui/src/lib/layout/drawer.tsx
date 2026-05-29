import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { atom, useAtom } from "jotai";
import type { Dispatch, SetStateAction } from "react";
import { createContext, useCallback, useContext, useEffect } from "react";
import { createPortal } from "react-dom";

const drawerOpenAtom = atom(false);
const drawerToggleDisabledAtom = atom(false);
const navCollapsedAtom = atom(false);

type LayoutPortalContextValue = {
  navPortal: HTMLElement | null;
  sidebarPortal: HTMLElement | null;
};

export const LayoutPortalContext = createContext<LayoutPortalContextValue | null>(null);

export function useLayoutDrawer() {
  const [isOpen, setIsOpen] = useAtom(drawerOpenAtom);
  const [isToggleDisabled, setIsToggleDisabled] = useAtom(drawerToggleDisabledAtom);
  const [isNavCollapsed, setIsNavCollapsed] = useAtom(navCollapsedAtom);
  const portals = useContext(LayoutPortalContext);

  useEffect(() => {
    if (isToggleDisabled) setIsOpen(false);
  }, [isToggleDisabled, setIsOpen]);

  const open = useCallback(() => {
    if (!isToggleDisabled) setIsOpen(true);
  }, [isToggleDisabled, setIsOpen]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, [setIsOpen]);

  const toggle = useCallback(() => {
    if (!isToggleDisabled) setIsOpen((prev) => !prev);
  }, [isToggleDisabled, setIsOpen]);

  return {
    isOpen,
    isToggleDisabled,
    open,
    close,
    toggle,
    setToggleDisabled: setIsToggleDisabled,
    navPortal: portals?.navPortal ?? null,
    sidebarPortal: portals?.sidebarPortal ?? null,
    isNavCollapsed,
    setIsNavCollapsed,
  };
}

type LayoutDrawerProps = {
  setNavPortal: Dispatch<SetStateAction<HTMLElement | null>>;
  setSidebarPortal: Dispatch<SetStateAction<HTMLElement | null>>;
};

export function LayoutDrawer({ setNavPortal, setSidebarPortal }: LayoutDrawerProps) {
  const { _ } = useLingui();
  const { isOpen, close } = useLayoutDrawer();

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, isOpen]);

  if (typeof document === "undefined") return null;
  if (!isOpen) return null;

  return createPortal(
    <div
      className="wd:hidden fixed inset-x-0 bottom-0 top-[calc(var(--titlebar-height)+2px)] z-50 bg-overlay animate-in fade-in-0"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className="flex flex-col h-full w-80 border-r-2 border-main bg-level-1 focus-ring animate-in slide-in-from-left"
        aria-label={_(msg`layout.drawer.label`)}
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="grow flex flex-row min-h-0 overflow-hidden">
          <div className="flex flex-col shrink-0 h-full overflow-hidden" ref={setNavPortal} />
          <div className="grow flex flex-col min-w-0 overflow-hidden" ref={setSidebarPortal} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
