import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Button, getCSSVar, Link, useMotionSetting } from "@koloda/ui";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMediaQuery } from "@react-hook/media-query";
import type { Dispatch, PropsWithChildren, SetStateAction } from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { tv } from "tailwind-variants";

type DashboardDrawerContextValue = {
  isOpen: boolean;
  isToggleDisabled: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  setIsToggleDisabled: Dispatch<SetStateAction<boolean>>;
  navPortal: HTMLElement | null;
  sidebarPortal: HTMLElement | null;
};

type DashboardDrawerState = {
  isOpen: boolean;
  isToggleDisabled: boolean;
};

const defaultDashboardDrawerState = {
  isOpen: false,
  isToggleDisabled: false,
};

const DashboardDrawerContext = createContext<DashboardDrawerContextValue | null>(null);
const dashboardDrawerOpenEvent = "koloda:dashboard-drawer-open";
const dashboardDrawerCloseEvent = "koloda:dashboard-drawer-close";
const dashboardDrawerToggleEvent = "koloda:dashboard-drawer-toggle";
const dashboardDrawerRequestStateEvent = "koloda:dashboard-drawer-request-state";
const dashboardDrawerStateEvent = "koloda:dashboard-drawer-state";

export function useDashboardDrawer() {
  const context = useContext(DashboardDrawerContext);
  const contextSetIsOpen = context?.setIsOpen;
  const contextSetIsToggleDisabled = context?.setIsToggleDisabled;
  const [externalState, setExternalState] = useState<DashboardDrawerState>(defaultDashboardDrawerState);
  const isToggleDisabled = context?.isToggleDisabled ?? externalState.isToggleDisabled;

  useEffect(() => {
    if (context) return;

    const handleState = (event: Event) => {
      const { detail } = event as CustomEvent<DashboardDrawerState>;
      if (!detail) return;
      setExternalState(detail);
    };

    window.addEventListener(dashboardDrawerStateEvent, handleState);
    window.dispatchEvent(new Event(dashboardDrawerRequestStateEvent));

    return () => window.removeEventListener(dashboardDrawerStateEvent, handleState);
  }, [context]);

  const open = useCallback(() => {
    if (contextSetIsOpen) {
      if (!isToggleDisabled) contextSetIsOpen(true);
      return;
    }
    if (isToggleDisabled) return;
    setExternalState((state) => ({ ...state, isOpen: true }));
    window.dispatchEvent(new Event(dashboardDrawerOpenEvent));
  }, [contextSetIsOpen, isToggleDisabled]);

  const close = useCallback(() => {
    if (contextSetIsOpen) {
      contextSetIsOpen(false);
      return;
    }
    setExternalState((state) => ({ ...state, isOpen: false }));
    window.dispatchEvent(new Event(dashboardDrawerCloseEvent));
  }, [contextSetIsOpen]);

  const toggle = useCallback(() => {
    if (contextSetIsOpen) {
      if (!isToggleDisabled) contextSetIsOpen((isOpen) => !isOpen);
      return;
    }
    if (isToggleDisabled) return;
    setExternalState((state) => ({ ...state, isOpen: !state.isOpen }));
    window.dispatchEvent(new Event(dashboardDrawerToggleEvent));
  }, [contextSetIsOpen, isToggleDisabled]);

  const setToggleDisabled = useCallback((isDisabled: boolean) => {
    contextSetIsToggleDisabled?.(isDisabled);
  }, [contextSetIsToggleDisabled]);

  return {
    isOpen: context?.isOpen ?? externalState.isOpen,
    isToggleDisabled,
    open,
    close,
    toggle,
    setToggleDisabled,
    sidebarPortal: context?.sidebarPortal ?? null,
  };
}

export function Dashboard({ children }: PropsWithChildren) {
  const [isOpen, setIsOpen] = useState(false);
  const [isToggleDisabled, setIsToggleDisabled] = useState(false);
  const [navPortal, setNavPortal] = useState<HTMLElement | null>(null);
  const [sidebarPortal, setSidebarPortal] = useState<HTMLElement | null>(null);
  const broadcastState = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent<DashboardDrawerState>(dashboardDrawerStateEvent, { detail: { isOpen, isToggleDisabled } }),
    );
  }, [isOpen, isToggleDisabled]);

  useEffect(() => {
    broadcastState();
  }, [broadcastState]);

  useEffect(() => {
    if (isToggleDisabled) setIsOpen(false);
  }, [isToggleDisabled]);

  useEffect(() => {
    const open = () => {
      if (!isToggleDisabled) setIsOpen(true);
    };
    const close = () => setIsOpen(false);
    const toggle = () => {
      if (!isToggleDisabled) setIsOpen((isOpen) => !isOpen);
    };

    window.addEventListener(dashboardDrawerOpenEvent, open);
    window.addEventListener(dashboardDrawerCloseEvent, close);
    window.addEventListener(dashboardDrawerToggleEvent, toggle);
    window.addEventListener(dashboardDrawerRequestStateEvent, broadcastState);

    return () => {
      window.removeEventListener(dashboardDrawerOpenEvent, open);
      window.removeEventListener(dashboardDrawerCloseEvent, close);
      window.removeEventListener(dashboardDrawerToggleEvent, toggle);
      window.removeEventListener(dashboardDrawerRequestStateEvent, broadcastState);
    };
  }, [broadcastState, isToggleDisabled]);

  return (
    <DashboardDrawerContext.Provider
      value={{ isOpen, isToggleDisabled, setIsOpen, setIsToggleDisabled, navPortal, sidebarPortal }}
    >
      <div className="grow flex flex-row h-full w-full min-w-80 overflow-hidden">
        {children}
        <DashboardDrawer setNavPortal={setNavPortal} setSidebarPortal={setSidebarPortal} />
      </div>
    </DashboardDrawerContext.Provider>
  );
}

function DashboardContent({ children }: PropsWithChildren) {
  return (
    <div className="grow flex flex-col h-full min-h-0 min-w-0 overflow-hidden bg-transparent">
      {children}
    </div>
  );
}

const dashboardSkipLink =
  "sr-only focus:not-sr-only focus:fixed focus:z-100 focus:top-4 focus:left-4 focus:px-4 focus:py-2";

function DashboardSkipLink() {
  const { _ } = useLingui();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById("main")?.focus();
  };

  return (
    <Button
      variants={{ style: "primary", class: dashboardSkipLink }}
      onClick={handleClick}
    >
      {_(msg`dashboard.skip-link`)}
    </Button>
  );
}

function DashboardNav({ children }: PropsWithChildren) {
  const context = useContext(DashboardDrawerContext);
  const isDrawerLayout = useMediaQuery(`(width < ${getCSSVar("--breakpoint-tb")})`);
  const content = (
    <nav className="flex h-full flex-col shrink-0 gap-2 p-2 border-r-2 border-main overflow-y-auto">
      {children}
    </nav>
  );

  if (isDrawerLayout) return context?.navPortal ? createPortal(content, context.navPortal) : null;

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
  const { close } = useDashboardDrawer();

  return (
    <Link className={dashboardNavLink({ class: cn })} to={to} viewTransition={isMotionOn} onClick={close} key={to}>
      <HugeiconsIcon
        className="size-5 min-w-5"
        strokeWidth={1.75}
        icon={icon}
        aria-hidden="true"
      />
      <span className="max-dt:hidden pr-2">{_(msg)}</span>
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
Dashboard.SkipLink = DashboardSkipLink;
Dashboard.Nav = DashboardNav;
Dashboard.NavLink = DashboardNavLink;
