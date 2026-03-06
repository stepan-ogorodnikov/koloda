import { Button, Link, useMotionSetting } from "@koloda/ui";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { LucideProps } from "lucide-react";
import type { ForwardRefExoticComponent, PropsWithChildren, RefAttributes } from "react";
import { tv } from "tailwind-variants";

const dashboard = "grow flex flex-row h-full w-full min-w-80 max-w-360 dt:h-screen dt:overflow-hidden";

export function Dashboard({ children }: PropsWithChildren) {
  return <div className={dashboard}>{children}</div>;
}

const dashboardContent = [
  "grow flex flex-col h-full min-h-0 min-w-0 max-w-screen dt:overflow-hidden",
  "p-1 tb:px-2 tb:pt-2 max-dt:pb-16 dt:pb-2 bg-transparent",
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
  "fixed z-1 flex flex-col max-dt:items-center justify-center gap-4",
  "dt:static dt:h-full dt:justify-between dt:overflow-y-auto bottom-0 inset-x-0 dt:min-w-48 dt:py-6 dt:pl-2",
].join(" ");

function DashboardAside({ children }: PropsWithChildren) {
  return (
    <div className={dashboardAside}>
      {children}
    </div>
  );
}

const dashboardNav = [
  "flex grow dt:flex-col dt:overflow-y-auto gap-1",
  "p-2 max-dt:rounded-t-xl max-dt:border-2 max-dt:border-b-0 max-dt:border-main max-dt:bg-level-1",
].join(" ");

function DashboardNav({ children }: PropsWithChildren) {
  return (
    <nav className={dashboardNav}>
      {children}
    </nav>
  );
}

const dashboardNavLink = tv({
  base: [
    "flex flex-row items-center gap-2 p-2 rounded-lg focus-ring",
    "fg-inactive hover:fg-level-1 current:fg-level-1 current:font-medium",
  ],
});

const dashboardNavLinkIcon = "size-6 dt:size-5 stroke-1.5";
const dashboardNavLinkText = "max-dt:hidden";

type DashboardNavLinkProps = {
  cn?: string;
  to: string;
  msg: MessageDescriptor;
  Icon: ForwardRefExoticComponent<Omit<LucideProps, "ref">> & RefAttributes<SVGSVGElement>;
};

function DashboardNavLink({ cn, to, msg, Icon }: DashboardNavLinkProps) {
  const { _ } = useLingui();
  const isMotionOn = useMotionSetting();

  return (
    <Link className={dashboardNavLink({ class: cn })} to={to} viewTransition={isMotionOn} key={to}>
      <Icon className={dashboardNavLinkIcon} />
      <span className={dashboardNavLinkText}>{_(msg)}</span>
    </Link>
  );
}

function DashboardControls({ children }: PropsWithChildren) {
  return <div className="hidden dt:flex flex-col">{children}</div>;
}

Dashboard.Aside = DashboardAside;
Dashboard.Content = DashboardContent;
Dashboard.SkipLink = DashboardSkipLink;
Dashboard.Nav = DashboardNav;
Dashboard.NavLink = DashboardNavLink;
Dashboard.Controls = DashboardControls;
