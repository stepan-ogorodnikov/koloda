import { Link } from "@koloda/ui";
import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react";
import type { LucideProps } from "lucide-react";
import type { ForwardRefExoticComponent, PropsWithChildren, RefAttributes } from "react";
import { tv } from "tailwind-variants";

const dashboard = "grow flex flex-row w-full min-w-80 max-w-360";

export function Dashboard({ children }: PropsWithChildren) {
  return <div className={dashboard}>{children}</div>;
}

const dashboardContent =
  "grow flex flex-col min-w-0 max-w-screen p-1 tb:px-2 tb:pt-2 max-dt:pb-16 dt:pb-2 bg-transparent";

function DashboardContent({ children }: PropsWithChildren) {
  return <div className={dashboardContent}>{children}</div>;
}

const dashboardAside = [
  "fixed z-1 flex flex-col max-dt:items-center justify-center gap-4",
  "dt:static dt:justify-between bottom-0 inset-x-0 dt:min-w-48 dt:py-6 dt:px-2",
].join(" ");

function DashboardAside({ children }: PropsWithChildren) {
  return (
    <div className={dashboardAside}>
      {children}
    </div>
  );
}

const dashboardNav = [
  "flex dt:flex-col gap-1",
  "max-dt:p-2 max-dt:rounded-t-xl max-dt:border-2 max-dt:border-b-0 max-dt:border-main max-dt:bg-level-1",
].join(" ");

function DashboardNav({ children }: PropsWithChildren) {
  return (
    <nav className={dashboardNav} role="menu">
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

  return (
    <Link className={dashboardNavLink({ class: cn })} to={to} key={to}>
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
Dashboard.Nav = DashboardNav;
Dashboard.NavLink = DashboardNavLink;
Dashboard.Controls = DashboardControls;
