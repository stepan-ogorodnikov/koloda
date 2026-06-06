import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { getCSSVar, Link, Tooltip, useMotionSetting } from "@koloda/ui";
import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react";
import { useMediaQuery } from "@react-hook/media-query";
import { atom, useAtom, useSetAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { AnimatePresence, motion } from "motion/react";
import type { PropsWithChildren } from "react";
import { useCallback, useContext, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { tv } from "tailwind-variants";
import { useLayoutDrawer } from "./drawer";
import { LayoutPortalContext } from "./layout";

const navCollapsedAtom = atomWithStorage("nav-collapsed", false);
export const layoutHasNavAtom = atom(false);

export function useNavCollapsed() {
  const [isNavCollapsed, setIsNavCollapsed] = useAtom(navCollapsedAtom);
  const toggle = useCallback(() => setIsNavCollapsed((prev) => !prev), [setIsNavCollapsed]);

  return { isNavCollapsed, setIsNavCollapsed, toggle };
}

export function LayoutNav({ children }: PropsWithChildren) {
  const { navPortal } = useContext(LayoutPortalContext) ?? {};
  const setHasNav = useSetAtom(layoutHasNavAtom);

  useLayoutEffect(() => {
    setHasNav(true);
    return () => setHasNav(false);
  }, [setHasNav]);

  return navPortal ? createPortal(children, navPortal) : null;
}

const layoutNavLink = tv({
  base: [
    "flex flex-row items-center shrink-0 gap-2 min-w-10 min-h-10 px-2 rounded-xl focus-ring animate-colors",
    "current:bg-nav-active border-2 border-transparent current:border-nav-active current:shadow-nav-active",
    "fg-nav-item hover:fg-nav-active current:fg-nav-active font-medium tracking-wide",
  ],
});

type LayoutNavLinkProps = {
  to: string;
  msg: MessageDescriptor;
  icon: IconSvgElement;
};

export function LayoutNavLink({ to, msg, icon }: LayoutNavLinkProps) {
  const { _ } = useLingui();
  const isMotionOn = useMotionSetting();
  const { close } = useLayoutDrawer();
  const { isNavCollapsed } = useNavCollapsed();
  const isWide = useMediaQuery(`(width >= ${getCSSVar("--breakpoint-wd")})`);
  const isTextVisible = isWide ? !isNavCollapsed : false;

  return (
    <Tooltip
      content={<div className="fg-level-1 font-medium">{_(msg)}</div>}
      isDisabled={isTextVisible}
      placement="right"
    >
      <Link
        className={layoutNavLink()}
        to={to}
        viewTransition={isMotionOn}
        onClick={close}
        key={to}
      >
        <HugeiconsIcon
          className="size-5 min-w-5"
          strokeWidth={1.75}
          icon={icon}
          aria-hidden="true"
        />
        <AnimatePresence initial={false}>
          {isTextVisible && (
            <motion.span
              className="overflow-hidden"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={isMotionOn ? { duration: 0.25, ease: "easeOut" } : { duration: 0 }}
              key="label"
            >
              <span className="pr-4 truncate whitespace-nowrap">{_(msg)}</span>
            </motion.span>
          )}
        </AnimatePresence>
      </Link>
    </Tooltip>
  );
}
