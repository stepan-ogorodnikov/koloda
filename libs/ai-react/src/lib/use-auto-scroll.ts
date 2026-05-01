import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";

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

  const getIsNearBottom = useEffectEvent(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return true;

    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    return distanceFromBottom <= AUTO_SCROLL_THRESHOLD;
  });

  const syncScrollState = useEffectEvent(() => {
    const nextIsNearBottom = getIsNearBottom();
    shouldAutoScrollRef.current = nextIsNearBottom;
    setIsNearBottom((current) => (current === nextIsNearBottom ? current : nextIsNearBottom));
  });

  const scrollToBottom = useEffectEvent((behavior: ScrollBehavior = "auto") => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return;

    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
  });

  const startFollowingLatest = useEffectEvent((behavior: ScrollBehavior = "smooth") => {
    shouldAutoScrollRef.current = true;
    isProgrammaticScrollRef.current = behavior === "smooth";
    setIsNearBottom(true);
    scrollToBottom(behavior);
  });

  useEffect(() => {
    syncScrollState();
  }, []);

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
  }, []);

  useLayoutEffect(() => {
    if (shouldAutoScrollRef.current) {
      startFollowingLatest("auto");
      return;
    }

    syncScrollState();
  }, [messages, isLoading]);

  const handleScroll = useEffectEvent(() => {
    if (isProgrammaticScrollRef.current) {
      if (getIsNearBottom()) {
        isProgrammaticScrollRef.current = false;
        shouldAutoScrollRef.current = true;
        setIsNearBottom(true);
      }
      return;
    }

    syncScrollState();
  });

  const handleScrollToLatest = useEffectEvent(() => {
    startFollowingLatest("smooth");
  });

  const handleScrollUp = useEffectEvent(() => {
    scrollViewportRef.current?.scrollBy({ top: -300, behavior: "smooth" });
  });

  const handleScrollDown = useEffectEvent(() => {
    scrollViewportRef.current?.scrollBy({ top: 300, behavior: "smooth" });
  });

  const handleScrollToTop = useEffectEvent(() => {
    scrollViewportRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  });

  const handleScrollToBottom = useEffectEvent(() => {
    startFollowingLatest("smooth");
  });

  const prepareSubmit = useEffectEvent(() => {
    const shouldFollow = getIsNearBottom();
    shouldAutoScrollRef.current = shouldFollow;
    return shouldFollow;
  });

  const resetScroll = useEffectEvent(() => {
    shouldAutoScrollRef.current = true;
    isProgrammaticScrollRef.current = false;
    setIsNearBottom(true);
  });

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
