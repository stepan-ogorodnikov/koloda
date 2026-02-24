import { LanguageSelect, ThemeSelect, useGlobalSync, useHotkeysSettings } from "@koloda/react";
import { Dashboard, Main, useHotkeysStatus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useNavigate } from "@tanstack/react-router";
import { AlignVerticalJustifyCenter, FileSliders, House, Layers, Settings } from "lucide-react";
import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";

export const appMenu = [
  { to: "/dashboard", t: msg`nav.home`, Icon: House, cn: "max-dt:order-2" },
  { to: "/decks", t: msg`nav.decks`, Icon: Layers, cn: "max-dt:order-0" },
  { to: "/algorithms", t: msg`nav.algorithms`, Icon: FileSliders, cn: "max-dt:order-1" },
  { to: "/templates", t: msg`nav.templates`, Icon: AlignVerticalJustifyCenter, cn: "max-dt:order-3" },
  { to: "/settings", t: msg`nav.settings`, Icon: Settings, cn: "max-dt:order-4" },
];

export function App({ children }: PropsWithChildren) {
  useGlobalSync();
  const { navigation } = useHotkeysSettings();
  const { scopes, enableScope } = useHotkeysStatus();
  const navigate = useNavigate();
  useHotkeys(navigation.dashboard, () => navigate({ to: "/dashboard" }), { enabled: !!scopes.nav });
  useHotkeys(navigation.decks, () => navigate({ to: "/decks" }), { enabled: !!scopes.nav });
  useHotkeys(navigation.algorithms, () => navigate({ to: "/algorithms" }), { enabled: !!scopes.nav });
  useHotkeys(navigation.templates, () => navigate({ to: "/templates" }), { enabled: !!scopes.nav });
  useHotkeys(navigation.settings, () => navigate({ to: "/settings" }), { enabled: !!scopes.nav });

  useEffect(() => {
    enableScope("nav");
  }, [enableScope]);

  return (
    <Dashboard>
      <Dashboard.SkipLink />
      <Dashboard.Aside>
        <Dashboard.Nav>
          {appMenu.map(({ cn, to, t, Icon }) => <Dashboard.NavLink cn={cn} to={to} msg={t} Icon={Icon} key={to} />)}
        </Dashboard.Nav>
        <Dashboard.Controls>
          <ThemeSelect buttonVariants={{ style: "ghost" }} withChevron={false} />
          <LanguageSelect buttonVariants={{ style: "ghost" }} withChevron={false} />
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
