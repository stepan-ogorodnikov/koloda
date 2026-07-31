import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const AUTO_SCROLL_THRESHOLD = 80;

interface UseAutoScrollOptions {
  messages: unknown[];
  isLoading: boolean;
}

export interface UseAutoScrollReturn {
  messagesRef: React.RefObject<HTMLDivElement | null>;
  scrollViewportRef: React.RefObject<HTMLDivElement | null>;
  showJumpToLatest: boolean;
  handleScroll: () => void;
  handleScrollToLatest: () => void;
  handleScrollUp: () => void;
  handleScrollDown: () => void;
  handleScrollToTop: () => void;
  handleScrollToBottom: () => void;
  prepareSubmit: () => boolean;
  startFollowingLatest: (behavior?: ScrollBehavior) => void;
  resetScroll: () => void;
}

export function useAutoScroll({ messages, isLoading }: UseAutoScrollOptions): UseAutoScrollReturn {
  const [isNearBottom, setIsNearBottom] = useState(true);
  const messagesRef = useRef<HTMLDivElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScrollRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);

  // WHY: Returned handlers are used as DOM/event callbacks. useEffectEvent may only be
  // called from Effects / Effect Events (react/rules-of-hooks in oxlint ≥1.75), so these
  // stay as stable useCallbacks over refs instead.
  const getIsNearBottom = useCallback(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return true;

    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    return distanceFromBottom <= AUTO_SCROLL_THRESHOLD;
  }, []);

  const syncScrollState = useCallback(() => {
    const nextIsNearBottom = getIsNearBottom();
    shouldAutoScrollRef.current = nextIsNearBottom;
    setIsNearBottom((current) => (current === nextIsNearBottom ? current : nextIsNearBottom));
  }, [getIsNearBottom]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return;

    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
  }, []);

  const startFollowingLatest = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      shouldAutoScrollRef.current = true;
      isProgrammaticScrollRef.current = behavior === "smooth";
      setIsNearBottom(true);
      scrollToBottom(behavior);
    },
    [scrollToBottom],
  );

  useEffect(() => {
    syncScrollState();
  }, [syncScrollState]);

  useEffect(() => {
    const messagesElement = messagesRef.current;
    if (!messagesElement) return;

    const handleMessagesResize = () => {
      if (shouldAutoScrollRef.current) {
        startFollowingLatest("auto");
        return;
      }

      syncScrollState();
    };

    const resizeObserver = new ResizeObserver(handleMessagesResize);
    resizeObserver.observe(messagesElement);
    handleMessagesResize();

    return () => {
      resizeObserver.disconnect();
    };
  }, [startFollowingLatest, syncScrollState]);

  useLayoutEffect(() => {
    if (shouldAutoScrollRef.current) {
      startFollowingLatest("auto");
      return;
    }

    syncScrollState();
  }, [messages, isLoading, startFollowingLatest, syncScrollState]);

  const handleScroll = useCallback(() => {
    if (isProgrammaticScrollRef.current) {
      if (getIsNearBottom()) {
        isProgrammaticScrollRef.current = false;
        shouldAutoScrollRef.current = true;
        setIsNearBottom(true);
      }
      return;
    }

    syncScrollState();
  }, [getIsNearBottom, syncScrollState]);

  const handleScrollToLatest = useCallback(() => {
    startFollowingLatest("smooth");
  }, [startFollowingLatest]);

  const handleScrollUp = useCallback(() => {
    scrollViewportRef.current?.scrollBy({ top: -300, behavior: "smooth" });
  }, []);

  const handleScrollDown = useCallback(() => {
    scrollViewportRef.current?.scrollBy({ top: 300, behavior: "smooth" });
  }, []);

  const handleScrollToTop = useCallback(() => {
    scrollViewportRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleScrollToBottom = useCallback(() => {
    startFollowingLatest("smooth");
  }, [startFollowingLatest]);

  const prepareSubmit = useCallback(() => {
    const shouldFollow = getIsNearBottom();
    shouldAutoScrollRef.current = shouldFollow;
    return shouldFollow;
  }, [getIsNearBottom]);

  const resetScroll = useCallback(() => {
    shouldAutoScrollRef.current = true;
    isProgrammaticScrollRef.current = false;
    setIsNearBottom(true);
  }, []);

  const showJumpToLatest = messages.length > 0 && !isNearBottom;

  return {
    messagesRef,
    scrollViewportRef,
    showJumpToLatest,
    handleScroll,
    handleScrollToLatest,
    handleScrollUp,
    handleScrollDown,
    handleScrollToTop,
    handleScrollToBottom,
    prepareSubmit,
    startFollowingLatest,
    resetScroll,
  };
}
