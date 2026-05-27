import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useCanGoBack, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

export function TitlebarNavigation() {
  const { _ } = useLingui();
  const router = useRouter();
  const canGoBack = useCanGoBack();
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

  return (
    <div className="relative z-100 flex flex-row gap-2 [-webkit-app-region:no-drag]">
      <Button
        variants={{ style: "ghost", size: "smallIcon" }}
        aria-label={_(msg`titlebar.navigation.back`)}
        isDisabled={!canGoBack}
        onPress={handleBack}
      >
        <HugeiconsIcon className="size-5 min-w-5" strokeWidth={2} icon={ArrowLeft01Icon} aria-hidden="true" />
      </Button>
      <Button
        variants={{ style: "ghost", size: "smallIcon" }}
        aria-label={_(msg`titlebar.navigation.forward`)}
        isDisabled={!canGoForward}
        onPress={handleForward}
      >
        <HugeiconsIcon className="size-5 min-w-5" strokeWidth={2} icon={ArrowRight01Icon} aria-hidden="true" />
      </Button>
    </div>
  );
}
