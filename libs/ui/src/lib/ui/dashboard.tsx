import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Button, Link, useMotionSetting } from "@koloda/ui";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { PropsWithChildren } from "react";
import { tv } from "tailwind-variants";

const dashboard = "grow flex flex-col dt:flex-row h-full w-full min-w-80 max-w-360 dt:overflow-hidden";

export function Dashboard({ children }: PropsWithChildren) {
  return <div className={dashboard}>{children}</div>;
}

const dashboardContent = [
  "grow flex flex-col h-full min-h-0 min-w-0 max-w-screen dt:overflow-hidden",
  "p-1 tb:px-2 tb:pt-2 max-dt:pb-15 dt:pb-2 bg-transparent",
].join(" ");

function DashboardContent({ children }: PropsWithChildren) {
  return <div className={dashboardContent}>{children}</div>;
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
const dashboardAside = [
  "flex flex-col justify-center gap-4",
  "fixed z-1 bottom-0 inset-x-0 max-dt:items-center",
  "dt:static dt:justify-between dt:h-full dt:min-w-48 dt:py-6 dt:pl-2 dt:overflow-y-auto",
].join(" ");

function DashboardAside({ children }: PropsWithChildren) {
  return (
    <div className={dashboardAside}>
      {children}
    </div>
  );
}

const dashboardNav = "flex grow dt:flex-col dt:overflow-y-auto gap-2 p-2";

function DashboardNav({ children }: PropsWithChildren) {
  return (
    <nav className={dashboardNav}>
      {children}
    </nav>
  );
}

const dashboardNavLink = tv({
  base: [
    "flex flex-row items-center gap-2 p-2 rounded-xl focus-ring animate-colors",
    "current:bg-nav-active border-2 border-transparent current:border-nav-active current:shadow-nav-active",
    "fg-nav-item hover:fg-nav-active current:fg-nav-active font-medium tracking-wide",
  ],
});

const dashboardNavLinkIcon = "size-6 dt:size-5 min-w-6 dt:min-w-5";
const dashboardNavLinkText = "max-dt:hidden";

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
      <HugeiconsIcon className={dashboardNavLinkIcon} strokeWidth={1.75} icon={icon} aria-hidden="true" />
      <span className={dashboardNavLinkText}>{_(msg)}</span>
    </Link>
  );
}

function DashboardControls({ children }: PropsWithChildren) {
  return <div className="hidden dt:flex flex-col px-2">{children}</div>;
}

Dashboard.Aside = DashboardAside;
Dashboard.Content = DashboardContent;
Dashboard.SkipLink = DashboardSkipLink;
Dashboard.Nav = DashboardNav;
Dashboard.NavLink = DashboardNavLink;
Dashboard.Controls = DashboardControls;
