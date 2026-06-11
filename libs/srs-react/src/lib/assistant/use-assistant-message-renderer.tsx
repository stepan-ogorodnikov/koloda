import { AIChatMessageLayout, AIChatMessageStatus } from "@koloda/ai-react";
import type { UIMessage } from "ai";
import type { ReactNode } from "react";
import { useCallback } from "react";
import { AssistantCardsMessage } from "./assistant-cards-message";
import type { AssistantCardsMessageProps } from "./assistant-cards-message";
import { getTextMessageContent } from "./assistant-messages";

export type UseAssistantMessageRendererProps = {
  getGeneratedCardsProps: (message: UIMessage) => AssistantCardsMessageProps | null;
  getChatMessageProps: (message: UIMessage) =>
    | { isStreaming: true }
    | { isSuccess: true; elapsedSeconds: number }
    | { isCanceled: true; elapsedSeconds: number }
    | { isFailed: true; canRetry: boolean; onRetry: () => void }
    | null;
};

export function useAssistantMessageRenderer({
  getGeneratedCardsProps,
  getChatMessageProps,
}: UseAssistantMessageRendererProps) {
  return useCallback(
    (message: UIMessage, content: ReactNode) => {
      const props = getGeneratedCardsProps(message);
      if (props && props.template) return <AssistantCardsMessage {...props} />;

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
