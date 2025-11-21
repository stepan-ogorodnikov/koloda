import { LanguageSelect, ThemeSelect, useGlobalSync } from "@koloda/react";
import { Dashboard, dashboardNavItem, Link, Main } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react";
import { AlignVerticalJustifyCenter, FileSliders, House, Layers, Settings } from "lucide-react";
import type { PropsWithChildren } from "react";

export const appMenu = [
  { to: "/dashboard", t: msg`nav.home`, Icon: House },
  { to: "/decks", t: msg`nav.decks`, Icon: Layers },
  { to: "/templates", t: msg`nav.templates`, Icon: AlignVerticalJustifyCenter },
  { to: "/algorithms", t: msg`nav.algorithms`, Icon: FileSliders },
  { to: "/settings", t: msg`nav.settings`, Icon: Settings },
];

export function App({ children }: PropsWithChildren) {
  useGlobalSync();

  return (
    <Dashboard>
      <Dashboard.Aside>
        <Dashboard.Nav>
          {appMenu.map(({ to, t, Icon }) => (
            <Link className={dashboardNavItem()} to={to} key={to}>
              <Icon className="size-5 stroke-1.5" />
              <Trans id={t.id} message={t.message} />
            </Link>
          ))}
        </Dashboard.Nav>
        <Dashboard.Controls>
          <ThemeSelect variants={{ style: "ghost" }} withChevron={false} />
          <LanguageSelect variants={{ style: "ghost" }} withChevron={false} />
        </Dashboard.Controls>
      </Dashboard.Aside>
      <Dashboard.Content>
        <Main>
          {children}
        </Main>
      </Dashboard.Content>
    </Dashboard>
  );
}
