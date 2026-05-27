import { PanelLeftIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, useDashboardDrawer } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useCallback } from "react";

export function TitlebarSidebarControls() {
  const { _ } = useLingui();
  const { close, isOpen, isToggleDisabled, open } = useDashboardDrawer();

  const handleDrawerToggle = useCallback(() => {
    if (isOpen) {
      close();
      return;
    }
    open();
  }, [close, isOpen, open]);

  return (
    <Button
      variants={{ style: "ghost", size: "smallIcon", class: "tb:hidden" }}
      aria-label={_(msg`titlebar.sidebar-controls.label`)}
      aria-pressed={isOpen}
      isDisabled={isToggleDisabled}
      onPress={handleDrawerToggle}
    >
      <HugeiconsIcon className="size-5 min-w-5" strokeWidth={2} icon={PanelLeftIcon} aria-hidden="true" />
    </Button>
  );
}
