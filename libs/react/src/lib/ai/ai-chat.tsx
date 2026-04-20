import { ArrowDown02Icon, Undo02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useHotkeysSettings } from "@koloda/react-base";
import { useAppHotkey } from "@koloda/react-base";
import { Button, Fade } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { UIMessage } from "ai";
import { AnimatePresence } from "motion/react";
import type { FormEvent, ReactNode } from "react";
import { Fragment, useEffect, useEffectEvent, useRef, useState } from "react";
import { AIChatMessage } from "./ai-chat-message";
import { AIChatPromptInput } from "./ai-chat-prompt-input";
import { AIChatSubmit } from "./ai-chat-submit";
import { AIModelPicker } from "./ai-model-picker";
import { AIProfilePicker } from "./ai-profile-picker";
import { useAIProfiles } from "./use-ai-profiles";

const AUTO_SCROLL_THRESHOLD = 80;

const aiChatPanel = [
  "flex flex-col gap-2 w-full max-w-3xl mx-auto p-2",
  "rounded-2xl border-2 border-input bg-input shadow-input",
].join(" ");

export type AIChatProps = {
  messages: UIMessage[];
  profileId: string;
  modelId: string;
  modelName?: string;
  onProfileChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onSubmit: (value: string) => void | Promise<void>;
  onCancel?: () => void;
  onReset?: () => void;
  isLoading?: boolean;
  error?: string | null;
  autoSelectDefaultProfile?: boolean;
  emptyState?: ReactNode;
  renderMessage?: (message: UIMessage, content: ReactNode) => ReactNode;
};

export function AIChat({
  messages,
  profileId,
  modelId,
  modelName,
  onProfileChange,
  onModelChange,
  onSubmit,
  onCancel,
  onReset,
  isLoading = false,
  error,
  autoSelectDefaultProfile = true,
  emptyState = null,
  renderMessage,
}: AIChatProps) {
  const { _ } = useLingui();
  const { ai } = useHotkeysSettings();
  const { defaultProfileId } = useAIProfiles();
  const [inputValue, setInputValue] = useState("");
  const [isNearBottom, setIsNearBottom] = useState(true);
  const messagesRef = useRef<HTMLDivElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScrollRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);
  const prompt = inputValue.trim();

  const getIsNearBottom = useEffectEvent(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return true;

    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    return distanceFromBottom <= AUTO_SCROLL_THRESHOLD;
  });

  const syncScrollState = useEffectEvent(() => {
    const nextIsNearBottom = getIsNearBottom();
    shouldAutoScrollRef.current = nextIsNearBottom;
    setIsNearBottom((current) => current === nextIsNearBottom ? current : nextIsNearBottom);
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
    if (autoSelectDefaultProfile && defaultProfileId && !profileId) {
      onProfileChange(defaultProfileId);
    }
  }, [autoSelectDefaultProfile, defaultProfileId, profileId, onProfileChange]);

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

  const submit = () => {
    if (profileId && modelId && prompt && !isLoading) {
      const shouldFollow = getIsNearBottom();
      shouldAutoScrollRef.current = shouldFollow;
      onSubmit(prompt);
      setInputValue("");
      if (shouldFollow) {
        startFollowingLatest("smooth");
      }
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const handleScroll = () => {
    if (isProgrammaticScrollRef.current) {
      if (getIsNearBottom()) {
        isProgrammaticScrollRef.current = false;
        shouldAutoScrollRef.current = true;
        setIsNearBottom(true);
      }
      return;
    }

    syncScrollState();
  };

  const handleScrollToLatest = () => {
    startFollowingLatest("smooth");
  };

  const handleReset = () => {
    setInputValue("");
    shouldAutoScrollRef.current = true;
    isProgrammaticScrollRef.current = false;
    setIsNearBottom(true);
    onReset?.();
  };

  const canSubmit = !!(profileId && modelId && !!prompt && !isLoading);
  const canCancel = isLoading && !!onCancel;
  const canReset = messages.length > 0 || isLoading;
  const showJumpToLatest = messages.length > 0 && !isNearBottom;

  useAppHotkey(ai.cancel, () => onCancel?.(), "", { enabled: canCancel, ignoreInputs: false });

  return (
    <section className="relative flex flex-col h-full min-h-0 px-4">
      <div className="relative grow min-h-0 -mx-4 px-4">
        <div
          className="flex flex-col items-center h-full overflow-y-auto [scrollbar-gutter:stable_both-edges]"
          ref={scrollViewportRef}
          onScroll={handleScroll}
        >
          <div className="flex flex-col gap-4 min-h-full w-full max-w-3xl py-2" ref={messagesRef}>
            {messages.length === 0
              ? emptyState
              : (
                <>
                  {messages.map((message) => {
                    const content = (
                      <AIChatMessage
                        role={message.role}
                        modelName={modelName}
                        parts={message.parts}
                        key={message.id}
                      />
                    );
                    return (
                      <Fragment key={message.id}>
                        {renderMessage ? renderMessage(message, content) : content}
                      </Fragment>
                    );
                  })}
                </>
              )}
          </div>
          <AnimatePresence>
            {showJumpToLatest && (
              <Fade className="absolute bottom-2 z-10 flex flex-col items-center w-full max-w-3xl">
                <Button
                  variants={{ style: "primary", size: "icon", class: "rounded-full" }}
                  aria-label={_(msg`ai.chat.scroll-to-latest.label`)}
                  onPress={handleScrollToLatest}
                >
                  <HugeiconsIcon
                    className="size-5 min-w-5"
                    strokeWidth={1.75}
                    icon={ArrowDown02Icon}
                    aria-hidden="true"
                  />
                </Button>
              </Fade>
            )}
          </AnimatePresence>
        </div>
      </div>
      <AnimatePresence>
        {error && (
          <Fade className="self-center w-full max-w-3xl mb-2 px-4 py-2 rounded-xl border-2 border-main bg-level-1">
            <em className="fg-error not-italic">
              {error}
            </em>
          </Fade>
        )}
      </AnimatePresence>
      <form className={aiChatPanel} onSubmit={handleSubmit}>
        <AIChatPromptInput value={inputValue} onChange={setInputValue} onSubmit={submit} />
        <div className="flex flex-row items-center min-w-0">
          <AIModelPicker profileId={profileId} value={modelId} onChange={onModelChange} />
          <div className="grow min-w-3" />
          <div className="shrink-0 flex flex-row items-center gap-2">
            <AIChatSubmit canSubmit={canSubmit} canCancel={canCancel} onCancel={onCancel} />
          </div>
        </div>
      </form>
      <div className="self-center flex flex-row items-center w-full max-w-3xl my-2 px-2">
        <AIProfilePicker value={profileId} onChange={onProfileChange} />
        <div className="grow min-w-3" />
        <Button
          variants={{ style: "ghost", size: "icon" }}
          aria-label={_(msg`ai.chat.reset.label`)}
          isDisabled={!canReset}
          onPress={handleReset}
        >
          <HugeiconsIcon
            className="size-5 min-w-5"
            strokeWidth={1.75}
            icon={Undo02Icon}
            aria-hidden="true"
          />
        </Button>
      </div>
    </section>
  );
}
