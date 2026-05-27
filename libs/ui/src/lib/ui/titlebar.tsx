import { TitlebarNavigation } from "./titlebar-navigation";
import { TitlebarSidebarControls } from "./titlebar-sidebar-controls";

export function Titlebar() {
  return (
    <div className="grow flex flex-row items-center h-full shrink-0 gap-2 px-2">
      <TitlebarSidebarControls />
      <TitlebarNavigation />
    </div>
  );
}
