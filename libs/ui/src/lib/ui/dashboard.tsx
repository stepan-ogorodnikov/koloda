import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Button, Link, useMotionSetting } from "@koloda/ui";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { PropsWithChildren } from "react";
import { tv } from "tailwind-variants";

export function Dashboard({ children }: PropsWithChildren) {
  return (
    <div className="grow flex flex-row h-full w-full min-w-80 overflow-hidden">
      {children}
    </div>
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
  return (
    <nav className="flex flex-col shrink-0 gap-2 p-2 border-r-2 border-main overflow-y-auto">
      {children}
    </nav>
  );
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

  return (
    <Link className={dashboardNavLink({ class: cn })} to={to} viewTransition={isMotionOn} key={to}>
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

Dashboard.Content = DashboardContent;
Dashboard.SkipLink = DashboardSkipLink;
Dashboard.Nav = DashboardNav;
Dashboard.NavLink = DashboardNavLink;
