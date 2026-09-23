import { useCanGoBack, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

export function useRouterHistoryNavigation() {
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

  const goBack = useCallback(() => {
    forwardStackRef.current.push(router.state.location.href);
    setCanGoForward(true);
    // WHY: router.history.back/forward emit popstate. Treating that as a user
    // navigation would clear the forward stack and disable Forward immediately.
    isProgrammaticRef.current = true;
    router.history.back();
  }, [router]);

  const goForward = useCallback(() => {
    forwardStackRef.current.pop();
    setCanGoForward(forwardStackRef.current.length > 0);
    isProgrammaticRef.current = true;
    router.history.forward();
  }, [router]);

  return { canGoBack, canGoForward, goBack, goForward };
}
