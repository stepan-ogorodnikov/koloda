import { useAssistantEngineHost, useConversationSaveHost } from "@koloda/assistant-react";
import { AiIcon, AlgorithmsIcon, DecksIcon, HomeIcon, Layout, SettingsIcon, TemplatesIcon } from "@koloda/ui";
import type { IconComponent } from "@koloda/ui";
import type { MessageDescriptor } from "@lingui/core";
import { Outlet } from "@tanstack/react-router";
import type { MouseEvent } from "react";
import { Titlebar } from "./titlebar";

type NavItemProps = {
  to: string;
  label: MessageDescriptor;
  icon: IconComponent;
  hasPage: boolean;
};

const appMenu: NavItemProps[] = [
  { to: "/", label: { id: "Home" }, icon: HomeIcon, hasPage: true },
  { to: "/decks", label: { id: "Decks" }, icon: DecksIcon, hasPage: false },
  { to: "/algorithms", label: { id: "Algorithms" }, icon: AlgorithmsIcon, hasPage: false },
  { to: "/templates", label: { id: "Templates" }, icon: TemplatesIcon, hasPage: true },
  { to: "/ai", label: { id: "AI" }, icon: AiIcon, hasPage: true },
];

const secondaryMenu: NavItemProps[] = [
  { to: "/settings", label: { id: "Settings" }, icon: SettingsIcon, hasPage: false },
];

// WHY: nothing sits behind a link without a page. Preventing the click in the capture phase stops `Link`
// before it navigates, so those links look and focus as in the product but go nowhere.
function preventNavigation(event: MouseEvent) {
  event.preventDefault();
}

function NavItem({ to, label, icon, hasPage }: NavItemProps) {
  const link = <Layout.NavLink to={to} msg={label} icon={icon} />;
  if (hasPage) return link;

  return (
    <div className="contents" onClickCapture={preventNavigation}>
      {link}
    </div>
  );
}

export function Shell() {
  // WHY: application-shell hosts, as `App` in `@koloda/app-react` mounts them.
  // `AssistantChat` throws without the engine, and saves need the save host.
  useAssistantEngineHost();
  useConversationSaveHost();

  return (
    <Layout titlebar={<Titlebar />}>
      <Layout.Nav>
        {appMenu.map((item) => (
          <NavItem {...item} key={item.to} />
        ))}
        <div className="grow" />
        {secondaryMenu.map((item) => (
          <NavItem {...item} key={item.to} />
        ))}
      </Layout.Nav>
      <Outlet />
    </Layout>
  );
}
