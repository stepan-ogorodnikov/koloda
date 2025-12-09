import { LanguageSelect, ThemeSelect, useGlobalSync } from "@koloda/react";
import { Dashboard, Main } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { AlignVerticalJustifyCenter, FileSliders, House, Layers, Settings } from "lucide-react";
import type { PropsWithChildren } from "react";

export const appMenu = [
  { to: "/dashboard", t: msg`nav.home`, Icon: House, cn: "max-dt:order-2" },
  { to: "/decks", t: msg`nav.decks`, Icon: Layers, cn: "max-dt:order-0" },
  { to: "/algorithms", t: msg`nav.algorithms`, Icon: FileSliders, cn: "max-dt:order-1" },
  { to: "/templates", t: msg`nav.templates`, Icon: AlignVerticalJustifyCenter, cn: "max-dt:order-3" },
  { to: "/settings", t: msg`nav.settings`, Icon: Settings, cn: "max-dt:order-4" },
];

export function App({ children }: PropsWithChildren) {
  useGlobalSync();

  return (
    <Dashboard>
      <Dashboard.Aside>
        <Dashboard.Nav>
          {appMenu.map(({ cn, to, t, Icon }) => <Dashboard.NavLink cn={cn} to={to} msg={t} Icon={Icon} key={to} />)}
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
