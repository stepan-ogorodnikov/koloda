import { Button } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useCanGoBack, useRouter } from "@tanstack/react-router";

export function NotFound() {
  const { _ } = useLingui();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  return (
    <div className="grow flex items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <h1 className="fg-level-4">{_(msg`not-found.title`)}</h1>
        <p className="fg-level-4">{_(msg`not-found.message`)}</p>
        {canGoBack && (
          <Button variants={{ style: "ghost" }} onClick={() => router.history.back()}>{_(msg`not-found.back`)}</Button>
        )}
      </div>
    </div>
  );
}
