import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Button } from "../primitives/form/button";
import { useNavigationHistoryHotkeys } from "./navigation-history-hotkeys";
import { useRouterHistoryNavigation } from "./use-router-history-navigation";

export function TitlebarNavigation() {
  const { _ } = useLingui();
  const navigation = useRouterHistoryNavigation();
  useNavigationHistoryHotkeys(navigation);
  const { canGoBack, canGoForward, goBack, goForward } = navigation;

  return (
    <div className="relative z-100 flex flex-row gap-2 [-webkit-app-region:no-drag]">
      <Button
        variants={{ style: "ghost", size: "smallIcon" }}
        aria-label={_(msg`titlebar.navigation.back`)}
        isDisabled={!canGoBack}
        onPress={goBack}
      >
        <HugeiconsIcon className="size-5 min-w-5" strokeWidth={2} icon={ArrowLeft01Icon} aria-hidden="true" />
      </Button>
      <Button
        variants={{ style: "ghost", size: "smallIcon" }}
        aria-label={_(msg`titlebar.navigation.forward`)}
        isDisabled={!canGoForward}
        onPress={goForward}
      >
        <HugeiconsIcon className="size-5 min-w-5" strokeWidth={2} icon={ArrowRight01Icon} aria-hidden="true" />
      </Button>
    </div>
  );
}
