import { PanelLeftIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, getCSSVar, useDashboardDrawer } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMediaQuery } from "@react-hook/media-query";
import { useCallback } from "react";

export function TitlebarSidebarControls() {
  const { _ } = useLingui();
  const { close, isNavCollapsed, isOpen, isToggleDisabled, open, setIsNavCollapsed } = useDashboardDrawer();
  const isLargerBreakpoint = useMediaQuery(`(width >= ${getCSSVar("--breakpoint-tb")})`);

  const handleAction = useCallback(() => {
    if (isLargerBreakpoint) {
      setIsNavCollapsed((prev) => !prev);
      return;
    }
    if (isOpen) {
      close();
      return;
    }
    open();
  }, [close, isLargerBreakpoint, isOpen, open, setIsNavCollapsed]);

  return (
    <Button
      variants={{ style: "ghost", size: "smallIcon" }}
      aria-label={_(msg`titlebar.sidebar-controls.label`)}
      aria-pressed={isLargerBreakpoint ? isNavCollapsed : isOpen}
      isDisabled={isLargerBreakpoint ? false : isToggleDisabled}
      onPress={handleAction}
    >
      <HugeiconsIcon className="size-5 min-w-5" strokeWidth={2} icon={PanelLeftIcon} aria-hidden="true" />
    </Button>
  );
}
