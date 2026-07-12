import {
  AiChat01Icon,
  AlignBoxMiddleCenterIcon,
  FolderLibraryIcon,
  Home07Icon,
  Settings01Icon,
  Settings05Icon,
} from "@hugeicons/core-free-icons";
import { useHotkeysStatus } from "@koloda/core-react";
import { Layout } from "@koloda/ui";
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
  { to: "/ai", t: msg`nav.ai`, icon: AiChat01Icon },
];

export const secondaryMenu = [{ to: "/settings", t: msg`nav.settings`, icon: Settings01Icon }];

export function App({ children }: PropsWithChildren) {
  useGlobalSync();
  useAppHotkeys();
  const { enableScope } = useHotkeysStatus();

  useEffect(() => {
    enableScope("nav");
  }, [enableScope]);

  return (
    <>
      <Layout.Nav>
        {appMenu.map(({ to, t, icon }) => (
          <Layout.NavLink to={to} msg={t} icon={icon} key={to} />
        ))}
        <div className="grow" />
        {secondaryMenu.map(({ to, t, icon }) => (
          <Layout.NavLink to={to} msg={t} icon={icon} key={to} />
        ))}
      </Layout.Nav>
      {children}
    </>
  );
}
