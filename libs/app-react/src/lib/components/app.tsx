import { useHotkeysStatus } from "@koloda/core-react";
import { useAssistantEngineHost, useConversationSaveHost } from "@koloda/assistant-react";
import { AiIcon, AlgorithmsIcon, DecksIcon, HomeIcon, Layout, SettingsIcon, TemplatesIcon } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import { useAppHotkeys } from "../hooks/use-app-hotkeys";
import { useGlobalSync } from "../hooks/use-global-sync";

export const appMenu = [
  { to: "/dashboard", t: msg`nav.home`, icon: HomeIcon },
  { to: "/decks", t: msg`nav.decks`, icon: DecksIcon },
  { to: "/algorithms", t: msg`nav.algorithms`, icon: AlgorithmsIcon },
  { to: "/templates", t: msg`nav.templates`, icon: TemplatesIcon },
  { to: "/ai", t: msg`nav.ai`, icon: AiIcon },
];

export const secondaryMenu = [{ to: "/settings", t: msg`nav.settings`, icon: SettingsIcon }];

export function App({ children }: PropsWithChildren) {
  useGlobalSync();
  useAppHotkeys();
  // WHY: Engine + persistence + shutdown listeners must outlive the AI route so
  // closing the app from another route still records `app_shutdown` / flush.
  useConversationSaveHost();
  useAssistantEngineHost();
  const { enableScope } = useHotkeysStatus();

  useEffect(() => {
    enableScope("navigation");
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
