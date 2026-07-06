import { ArrowDown02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, Fade, Tooltip, useLayoutHeaderScrollShadow } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { UIMessage } from "ai";
import { AnimatePresence } from "motion/react";
import type { ReactNode } from "react";
import { Fragment } from "react";
import { AIChatMessage } from "./ai-chat-message";
import type { UseAutoScrollReturn } from "./use-auto-scroll";

export type AIChatMessagesProps = {
  messages: UIMessage[];
  renderMessage?: (message: UIMessage, content: ReactNode) => ReactNode;
  modelName?: string;
  emptyState?: ReactNode;
  scroll: UseAutoScrollReturn;
};

export function AIChatMessages({ messages, modelName, emptyState = null, renderMessage, scroll }: AIChatMessagesProps) {
  const { _ } = useLingui();
  useLayoutHeaderScrollShadow(scroll.scrollViewportRef);

  return (
    <div className="relative flex-1 min-h-0 -mx-4 px-4">
      <div
        className="absolute inset-0 flex flex-col items-center overflow-y-auto no-focus-ring [scrollbar-gutter:stable_both-edges]"
        ref={scroll.scrollViewportRef}
        onScroll={scroll.handleScroll}
        tabIndex={0}
      >
        <div
          className="flex flex-col gap-4 min-h-full w-full max-w-3xl py-2"
          aria-label={_(msg`ai.chat.messages.label`)}
          aria-live="polite"
          role="log"
          ref={scroll.messagesRef}
        >
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
          <div className="min-h-2 w-full" />
        </div>
      </div>
      <AnimatePresence>
        {scroll.showJumpToLatest && (
          <Fade className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center w-full max-w-3xl">
            <Tooltip content={_(msg`ai.chat.scroll-to-latest.label`)}>
              <Button
                variants={{ style: "primary", size: "icon", class: "rounded-full" }}
                aria-label={_(msg`ai.chat.scroll-to-latest.label`)}
                onPress={scroll.handleScrollToLatest}
              >
                <HugeiconsIcon
                  className="size-5 min-w-5"
                  strokeWidth={1.75}
                  icon={ArrowDown02Icon}
                  aria-hidden="true"
                />
              </Button>
            </Tooltip>
          </Fade>
        )}
      </AnimatePresence>
    </div>
  );
}
