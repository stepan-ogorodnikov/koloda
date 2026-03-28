import {
  AlignBoxMiddleCenterIcon,
  FolderLibraryIcon,
  Home07Icon,
  Settings01Icon,
  Settings05Icon,
} from "@hugeicons/core-free-icons";
import { LanguageSelect, ThemeSelect, useAppHotkeys, useGlobalSync } from "@koloda/react";
import { useHotkeysStatus } from "@koloda/react-base";
import { Dashboard, Main } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import type { PropsWithChildren } from "react";
import { useEffect } from "react";

export const appMenu = [
  { to: "/dashboard", t: msg`nav.home`, icon: Home07Icon, cn: "max-dt:order-2" },
  { to: "/decks", t: msg`nav.decks`, icon: FolderLibraryIcon, cn: "max-dt:order-0" },
  { to: "/algorithms", t: msg`nav.algorithms`, icon: Settings05Icon, cn: "max-dt:order-1" },
  { to: "/templates", t: msg`nav.templates`, icon: AlignBoxMiddleCenterIcon, cn: "max-dt:order-3" },
  { to: "/settings", t: msg`nav.settings`, icon: Settings01Icon, cn: "max-dt:order-4" },
];

export function App({ children }: PropsWithChildren) {
  useGlobalSync();
  useAppHotkeys();
  const { enableScope } = useHotkeysStatus();

  useEffect(() => {
    enableScope("nav");
  }, [enableScope]);

  return (
    <Dashboard>
      <Dashboard.SkipLink />
      <Dashboard.Aside>
        <Dashboard.Nav>
          {appMenu.map(({ cn, to, t, icon }) => <Dashboard.NavLink cn={cn} to={to} msg={t} icon={icon} key={to} />)}
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
