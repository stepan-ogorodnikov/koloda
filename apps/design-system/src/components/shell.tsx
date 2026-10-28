import { LearnedToday, Lessons } from "@koloda/srs-react";
import { AiIcon, AlgorithmsIcon, DecksIcon, HomeIcon, Layout, SettingsIcon, TemplatesIcon } from "@koloda/ui";
import type { MouseEvent } from "react";
import { LessonModal } from "./lesson-modal";
import { Titlebar } from "./titlebar";

const appMenu = [
  // WHY: "/" is the app's only route, so Home renders as the current item.
  { to: "/", label: { id: "Home" }, icon: HomeIcon },
  { to: "/decks", label: { id: "Decks" }, icon: DecksIcon },
  { to: "/algorithms", label: { id: "Algorithms" }, icon: AlgorithmsIcon },
  { to: "/templates", label: { id: "Templates" }, icon: TemplatesIcon },
  { to: "/ai", label: { id: "AI" }, icon: AiIcon },
];

const secondaryMenu = [{ to: "/settings", label: { id: "Settings" }, icon: SettingsIcon }];

// WHY: nothing sits behind the nav links. Preventing the click in the capture phase stops `Link`
// before it navigates, so the links look and focus as in the product but go nowhere.
function preventNavigation(event: MouseEvent) {
  event.preventDefault();
}

export function Shell() {
  return (
    <Layout titlebar={<Titlebar />}>
      <Layout.Nav>
        <div className="contents" onClickCapture={preventNavigation}>
          {appMenu.map(({ to, label, icon }) => (
            <Layout.NavLink to={to} msg={label} icon={icon} key={to} />
          ))}
          <div className="grow" />
          {secondaryMenu.map(({ to, label, icon }) => (
            <Layout.NavLink to={to} msg={label} icon={icon} key={to} />
          ))}
        </div>
      </Layout.Nav>
      <Layout.Sidebar>
        <LearnedToday />
      </Layout.Sidebar>
      <Layout.Content isAlwaysVisible>
        <Layout.Container>
          <Lessons lesson={<LessonModal />} />
        </Layout.Container>
      </Layout.Content>
    </Layout>
  );
}
