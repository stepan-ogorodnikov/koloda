import { ArrowLeft01Icon, ArrowRight01Icon, PanelLeftIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, useDashboardDrawer } from "@koloda/ui";
import { useCanGoBack, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

export function Titlebar() {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const { close, isOpen, isToggleDisabled, open } = useDashboardDrawer();
  const [canGoForward, setCanGoForward] = useState(false);
  const forwardStackRef = useRef<string[]>([]);
  const isProgrammaticRef = useRef(false);

  useEffect(() => {
    const handler = () => {
      if (isProgrammaticRef.current) {
        isProgrammaticRef.current = false;
        return;
      }
      forwardStackRef.current = [];
      setCanGoForward(false);
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  const handleBack = useCallback(() => {
    forwardStackRef.current.push(router.state.location.href);
    setCanGoForward(true);
    isProgrammaticRef.current = true;
    router.history.back();
  }, [router]);

  const handleForward = useCallback(() => {
    forwardStackRef.current.pop();
    setCanGoForward(forwardStackRef.current.length > 0);
    isProgrammaticRef.current = true;
    router.history.forward();
  }, [router]);

  const handleDrawerToggle = useCallback(() => {
    if (isOpen) {
      close();
      return;
    }
    open();
  }, [close, isOpen, open]);

  return (
    <div className="grow flex flex-row items-center h-full shrink-0 gap-2 px-2">
      <div className="relative z-100 flex flex-row gap-2 [-webkit-app-region:no-drag]">
        <Button
          variants={{ style: "ghost", size: "smallIcon", class: "tb:hidden" }}
          aria-label="Toggle navigation"
          aria-pressed={isOpen}
          isDisabled={isToggleDisabled}
          onPress={handleDrawerToggle}
        >
          <HugeiconsIcon className="size-5 min-w-5" strokeWidth={2} icon={PanelLeftIcon} aria-hidden="true" />
        </Button>
        <Button
          variants={{ style: "ghost", size: "smallIcon" }}
          aria-label="Go back"
          isDisabled={!canGoBack}
          onPress={handleBack}
        >
          <HugeiconsIcon className="size-5 min-w-5" strokeWidth={2} icon={ArrowLeft01Icon} aria-hidden="true" />
        </Button>
        <Button
          variants={{ style: "ghost", size: "smallIcon" }}
          aria-label="Go forward"
          isDisabled={!canGoForward}
          onPress={handleForward}
        >
          <HugeiconsIcon className="size-5 min-w-5" strokeWidth={2} icon={ArrowRight01Icon} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
