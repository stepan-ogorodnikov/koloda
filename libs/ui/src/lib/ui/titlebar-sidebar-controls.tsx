import { PanelLeftIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useAppHotkey, useHotkeysSettings } from "@koloda/core-react";
import {
  Button,
  getCSSVar,
  layoutHasContentAtom,
  layoutHasNavAtom,
  layoutHasSidebarAtom,
  useLayoutDrawer,
  useNavCollapsed,
} from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMediaQuery } from "@react-hook/media-query";
import { useAtomValue } from "jotai";
import { useCallback } from "react";

export function TitlebarSidebarControls() {
  const { _ } = useLingui();
  const { ui } = useHotkeysSettings();
  const { close, isOpen, open } = useLayoutDrawer();
  const { isNavCollapsed, toggle: toggleNavCollapsed } = useNavCollapsed();
  const isWide = useMediaQuery(`(width >= ${getCSSVar("--breakpoint-wd")})`);
  const hasNav = useAtomValue(layoutHasNavAtom);
  const hasSidebar = useAtomValue(layoutHasSidebarAtom);
  const hasContent = useAtomValue(layoutHasContentAtom);
  const isDisabled = isWide ? !hasNav : (!hasContent || (!hasNav && !hasSidebar));

  const handleAction = useCallback(() => {
    if (isWide) {
      toggleNavCollapsed();
      return;
    }
    if (isOpen) {
      close();
      return;
    }
    open();
  }, [close, isWide, isOpen, open, toggleNavCollapsed]);

  useAppHotkey(ui.toggleSidebarControls, handleAction, "", { ignoreInputs: false });

  return (
    <div className="relative z-100 [-webkit-app-region:no-drag]">
      <Button
        variants={{ style: "ghost", size: "smallIcon" }}
        aria-label={_(msg`titlebar.sidebar-controls.label`)}
        aria-pressed={isWide ? isNavCollapsed : isOpen}
        isDisabled={isDisabled}
        onPress={handleAction}
      >
        <HugeiconsIcon className="size-5 min-w-5" strokeWidth={2} icon={PanelLeftIcon} aria-hidden="true" />
      </Button>
    </div>
  );
}
