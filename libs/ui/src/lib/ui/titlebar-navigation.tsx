import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useCanGoBack, useRouter } from "@tanstack/react-router";
import type { RouterHistory } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeftIcon } from "../icons/arrow-left-icon";
import { ArrowRightIcon } from "../icons/arrow-right-icon";
import { Button } from "../primitives/form/button";

export function TitlebarNavigation() {
  const { _ } = useLingui();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const history: RouterHistory = router.history;
  const [entries, setEntries] = useState(() => {
    const index = history.location.state.__TSR_index;
    return { index, lastIndex: index };
  });

  // WHY: Back and forward can come from outside these buttons (mouse buttons, desktop keys),
  // so forward is derived from history indexes rather than from clicks.
  // A push drops every later entry, which makes its index the last one.
  useEffect(
    () =>
      history.subscribe(({ location, action }) => {
        const index = location.state.__TSR_index;
        setEntries((prev) => ({ index, lastIndex: action.type === "PUSH" ? index : prev.lastIndex }));
      }),
    [history],
  );

  const handleBack = useCallback(() => history.back(), [history]);
  const handleForward = useCallback(() => history.forward(), [history]);

  return (
    <div className="relative z-100 flex flex-row gap-2 [-webkit-app-region:no-drag]">
      <Button
        variants={{ style: "ghost", size: "smallIcon" }}
        aria-label={_(msg`titlebar.navigation.back`)}
        isDisabled={!canGoBack}
        onPress={handleBack}
      >
        <ArrowLeftIcon className="size-5 min-w-5" strokeWidth={2} aria-hidden="true" />
      </Button>
      <Button
        variants={{ style: "ghost", size: "smallIcon" }}
        aria-label={_(msg`titlebar.navigation.forward`)}
        isDisabled={entries.index >= entries.lastIndex}
        onPress={handleForward}
      >
        <ArrowRightIcon className="size-5 min-w-5" strokeWidth={2} aria-hidden="true" />
      </Button>
    </div>
  );
}
