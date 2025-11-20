import type { PropsWithChildren } from "react";
import { tv } from "tailwind-variants";

export function Dashboard({ children }: PropsWithChildren) {
  return children;
}

function DashboardAside({ children }: PropsWithChildren) {
  return (
    <div className="flex flex-col gap-4 min-w-48 py-6 px-4">
      {children}
    </div>
  );
}

function DashboardContent({ children }: PropsWithChildren) {
  return <div className="flex flex-col grow p-2 bg-transparent">{children}</div>;
}

function DashboardNav({ children }: PropsWithChildren) {
  return (
    <nav className="flex flex-col gap-1 grow" role="menu">
      {children}
    </nav>
  );
}

export const dashboardNavItem = tv({
  base: [
    "flex flex-row items-center gap-2 p-2 rounded-lg focus-ring",
    "fg-inactive hover:fg-level-1",
    "aria-[current=page]:fg-level-1 aria-[current=page]:font-medium",
  ],
});

function DashboardControls({ children }: PropsWithChildren) {
  return <div className="flex flex-col">{children}</div>;
}

Dashboard.Aside = DashboardAside;
Dashboard.Content = DashboardContent;
Dashboard.Nav = DashboardNav;
Dashboard.Controls = DashboardControls;
