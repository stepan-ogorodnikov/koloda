import { AIChatMessageLayout, AIChatMessageStatus } from "@koloda/ai-react";
import type { UIMessage } from "ai";
import type { ReactNode } from "react";
import { useCallback } from "react";
import { AIChatCardsMessage } from "./ai-chat-cards-message";
import type { AIChatCardsMessageProps } from "./ai-chat-cards-message";
import { getTextMessageContent } from "./ai-chat-utility";

export type UseAIChatMessageRendererProps = {
  getGeneratedCardsProps: (message: UIMessage) => AIChatCardsMessageProps | null;
  getChatMessageProps: (message: UIMessage) =>
    | { isStreaming: true }
    | { isSuccess: true; elapsedSeconds: number }
    | { isCanceled: true; elapsedSeconds: number }
    | { isFailed: true; canRetry: boolean; onRetry: () => void }
    | null;
};

export function useAIChatMessageRenderer({
  getGeneratedCardsProps,
  getChatMessageProps,
}: UseAIChatMessageRendererProps) {
  return useCallback(
    (message: UIMessage, content: ReactNode) => {
      const props = getGeneratedCardsProps(message);
      if (props && props.template) return <AIChatCardsMessage {...props} />;

      const chatProps = getChatMessageProps(message);

      if (chatProps) {
        if ("isStreaming" in chatProps) {
          if (getTextMessageContent(message)) return content;

          return (
            <AIChatMessageLayout role="assistant">
              <AIChatMessageStatus state="pending" />
            </AIChatMessageLayout>
          );
        }

        if ("isSuccess" in chatProps) {
          return (
            <div className="flex flex-col gap-2 self-start w-full">
              {content}
              <AIChatMessageStatus state="success" elapsedSeconds={chatProps.elapsedSeconds} />
            </div>
          );
        }

        if ("isCanceled" in chatProps) {
          return (
            <div className="flex flex-col gap-2 self-start w-full">
              {content}
              <AIChatMessageStatus state="canceled" elapsedSeconds={chatProps.elapsedSeconds} />
            </div>
          );
        }

        return (
          <div className="flex flex-col gap-2 self-start w-full">
            {content}
            <AIChatMessageStatus
              state="failed"
              canRetry={chatProps.canRetry}
              onRetry={chatProps.onRetry}
            />
          </div>
        );
      }

      return content;
    },
    [getGeneratedCardsProps, getChatMessageProps],
  );
}
