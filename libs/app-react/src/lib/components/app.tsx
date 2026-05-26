import {
  AlignBoxMiddleCenterIcon,
  FolderLibraryIcon,
  Home07Icon,
  Settings01Icon,
  Settings05Icon,
} from "@hugeicons/core-free-icons";
import { useHotkeysStatus } from "@koloda/core-react";
import { Dashboard, Main } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import { useAppHotkeys } from "../hooks/use-app-hotkeys";
import { useGlobalSync } from "../hooks/use-global-sync";

export const appMenu = [
  { to: "/dashboard", t: msg`nav.home`, icon: Home07Icon },
  { to: "/decks", t: msg`nav.decks`, icon: FolderLibraryIcon },
  { to: "/algorithms", t: msg`nav.algorithms`, icon: Settings05Icon },
  { to: "/templates", t: msg`nav.templates`, icon: AlignBoxMiddleCenterIcon },
  { to: "/settings", t: msg`nav.settings`, icon: Settings01Icon },
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
      <Dashboard.Nav>
        {appMenu.map(({ to, t, icon }) => <Dashboard.NavLink to={to} msg={t} icon={icon} key={to} />)}
      </Dashboard.Nav>
      <Dashboard.Content>
        <Main>
          {children}
        </Main>
      </Dashboard.Content>
    </Dashboard>
  );
}
