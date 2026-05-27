import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { getCSSVar, Link, useMotionSetting } from "@koloda/ui";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMediaQuery } from "@react-hook/media-query";
import { atom, useAtom } from "jotai";
import type { Dispatch, PropsWithChildren, SetStateAction } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { tv } from "tailwind-variants";

const drawerOpenAtom = atom(false);
const drawerToggleDisabledAtom = atom(false);
const navCollapsedAtom = atom(false);

type DashboardPortalContextValue = {
  navPortal: HTMLElement | null;
  sidebarPortal: HTMLElement | null;
};

const DashboardPortalContext = createContext<DashboardPortalContextValue | null>(null);

export function useDashboardDrawer() {
  const [isOpen, setIsOpen] = useAtom(drawerOpenAtom);
  const [isToggleDisabled, setIsToggleDisabled] = useAtom(drawerToggleDisabledAtom);
  const [isNavCollapsed, setIsNavCollapsed] = useAtom(navCollapsedAtom);
  const portals = useContext(DashboardPortalContext);

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

export function Dashboard({ children }: PropsWithChildren) {
  const [navPortal, setNavPortal] = useState<HTMLElement | null>(null);
  const [sidebarPortal, setSidebarPortal] = useState<HTMLElement | null>(null);
  const portalValue = useMemo(() => ({ navPortal, sidebarPortal }), [navPortal, sidebarPortal]);

  return (
    <DashboardPortalContext.Provider value={portalValue}>
      <div className="grow flex flex-row h-full w-full min-w-80 overflow-hidden">
        {children}
        <DashboardDrawer setNavPortal={setNavPortal} setSidebarPortal={setSidebarPortal} />
      </div>
    </DashboardPortalContext.Provider>
  );
}

function DashboardContent({ children }: PropsWithChildren) {
  return (
    <div className="grow flex flex-col h-full min-h-0 min-w-0 overflow-hidden bg-transparent">
      {children}
    </div>
  );
}

const dashboardNav = tv({
  base: "flex flex-col gap-2 h-full p-2 border-r-2 border-main overflow-y-auto",
  variants: {
    isCollapsed: { true: "w-auto", false: "w-52" },
  },
});

function DashboardNav({ children }: PropsWithChildren) {
  const { navPortal, isNavCollapsed } = useDashboardDrawer();
  const isDrawerLayout = useMediaQuery(`(width < ${getCSSVar("--breakpoint-tb")})`);

  const content = (
    <nav className={dashboardNav({ isCollapsed: !isDrawerLayout && isNavCollapsed })}>
      {children}
    </nav>
  );

  if (isDrawerLayout) return navPortal ? createPortal(content, navPortal) : null;

  return content;
}

const dashboardNavLink = tv({
  base: [
    "flex flex-row items-center gap-2 min-w-10 p-2 rounded-xl focus-ring animate-colors",
    "current:bg-nav-active border-2 border-transparent current:border-nav-active current:shadow-nav-active",
    "fg-nav-item hover:fg-nav-active current:fg-nav-active font-medium tracking-wide",
  ],
});

type DashboardNavLinkProps = {
  cn?: string;
  to: string;
  msg: MessageDescriptor;
  icon: IconSvgElement;
};

function DashboardNavLink({ cn, to, msg, icon }: DashboardNavLinkProps) {
  const { _ } = useLingui();
  const isMotionOn = useMotionSetting();
  const { close, isNavCollapsed } = useDashboardDrawer();
  const isLargerBreakpoint = useMediaQuery(`(width >= ${getCSSVar("--breakpoint-tb")})`);
  const isTextVisible = isLargerBreakpoint ? !isNavCollapsed : true;

  return (
    <Link className={dashboardNavLink({ class: cn })} to={to} viewTransition={isMotionOn} onClick={close} key={to}>
      <HugeiconsIcon
        className="size-5 min-w-5"
        strokeWidth={1.75}
        icon={icon}
        aria-hidden="true"
      />
      {isTextVisible && <span className="pr-2 leading-none truncate whitespace-nowrap">{_(msg)}</span>}
    </Link>
  );
}

type DashboardDrawerProps = {
  setNavPortal: Dispatch<SetStateAction<HTMLElement | null>>;
  setSidebarPortal: Dispatch<SetStateAction<HTMLElement | null>>;
};

function DashboardDrawer({ setNavPortal, setSidebarPortal }: DashboardDrawerProps) {
  const { _ } = useLingui();
  const { isOpen, close } = useDashboardDrawer();

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
      className="tb:hidden fixed inset-x-0 bottom-0 top-[calc(var(--titlebar-height)+2px)] z-50 bg-overlay animate-in fade-in-0"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className="flex flex-col h-full w-full max-w-80 border-r-2 border-main bg-level-1 focus-ring animate-in slide-in-from-left"
        aria-label={_(msg`dashboard.drawer.label`)}
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div
          className="grow flex flex-row min-h-0 overflow-hidden"
          onClickCapture={(event) => {
            if (event.target instanceof HTMLElement && event.target.closest("a")) close();
          }}
        >
          <div className="flex flex-col shrink-0 h-full overflow-hidden" ref={setNavPortal} />
          <div className="grow flex flex-col min-w-0 overflow-hidden" ref={setSidebarPortal} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

Dashboard.Content = DashboardContent;
Dashboard.Nav = DashboardNav;
Dashboard.NavLink = DashboardNavLink;
