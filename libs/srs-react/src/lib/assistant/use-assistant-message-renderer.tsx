import { getTextMessageContent } from "@koloda/ai";
import { AIChatMessageLayout, AIChatMessageStatus } from "@koloda/ai-react";
import type { Template, TemplateFields } from "@koloda/srs";
import type { UIMessage } from "ai";
import { useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { useCallback } from "react";
import { AssistantCardsMessage } from "./assistant-cards-message";
import {
  assistantActiveRunIdAtom,
  assistantDeckIdAtom,
  assistantMessagesAtom,
  assistantRunsAtom,
} from "./assistant-conversation-atoms";
import { getChatTextMetadata, getErrorMetadata, getGeneratedCardsMetadata } from "./assistant-messages";
import type { GenerationRun } from "./conversation-reducer";
import { RevertMessageButton } from "./revert-message-button";

export type UseAssistantMessageRendererProps = {
  templateId: Template["id"] | undefined;
  handleRetry: (runId: string) => Promise<void>;
  handleRevert: (userMessageId: string) => void;
};

export function useAssistantMessageRenderer({
  templateId,
  handleRetry,
  handleRevert,
}: UseAssistantMessageRendererProps) {
  const runs = useAtomValue(assistantRunsAtom);
  const messages = useAtomValue(assistantMessagesAtom);
  const activeRunId = useAtomValue(assistantActiveRunIdAtom);
  const deckId = useAtomValue(assistantDeckIdAtom);
  const tailMessageId = messages.at(-1)?.id;

  return useCallback(
    (message: UIMessage, content: ReactNode) => {
      if (message.role === "user") return renderUserMessage(message, content, handleRevert);

      const isTail = message.id === tailMessageId;

      const generatedCardsMetadata = getGeneratedCardsMetadata(message);
      if (generatedCardsMetadata) {
        const run = runs[generatedCardsMetadata.runId];
        if (run?.mode === "cards") {
          const rendered = renderCardsMessage({
            run,
            runId: generatedCardsMetadata.runId,
            isCurrentRun: generatedCardsMetadata.runId === activeRunId,
            isTail,
            deckId,
            templateId,
            handleRetry,
          });
          if (rendered) return rendered;
        }
      }

      const errorMetadata = getErrorMetadata(message);
      if (errorMetadata) return renderErrorMessage(errorMetadata.runId, isTail, handleRetry);

      const chatMetadata = getChatTextMetadata(message);
      if (chatMetadata) {
        const run = runs[chatMetadata.runId];
        if (run) return renderChatMessage({ message, content, run, runId: chatMetadata.runId, isTail, handleRetry });
      }

      return content;
    },
    [tailMessageId, runs, activeRunId, templateId, deckId, handleRetry, handleRevert],
  );
}

function renderUserMessage(message: UIMessage, content: ReactNode, handleRevert: (id: string) => void) {
  return (
    <div className="group self-end flex flex-col items-end gap-1 w-full">
      {content}
      <div className="flex flex-row items-center justify-end gap-1 mx-2">
        <RevertMessageButton onPress={() => handleRevert(message.id)} />
      </div>
    </div>
  );
}

function renderCardsMessage(options: {
  run: GenerationRun;
  runId: string;
  isCurrentRun: boolean;
  isTail: boolean;
  deckId: number | null;
  templateId: Template["id"] | undefined;
  handleRetry: (runId: string) => Promise<void>;
}) {
  const { run, runId, isCurrentRun, isTail, deckId, templateId, handleRetry } = options;
  const templateFieldsMissing = run.templateFields === null;
  const cardsTemplate = run.templateFields ? makeHistoricalTemplate(run.templateFields) : null;

  if (!cardsTemplate && !templateFieldsMissing) return null;

  return (
    <AssistantCardsMessage
      runId={runId}
      cards={run.cards}
      cardStatuses={run.cardStatuses}
      template={cardsTemplate}
      templateUnavailable={templateFieldsMissing}
      deckId={deckId}
      templateId={templateId}
      canAdd={run.cards.length > 0 && !isCurrentRun && deckId !== null}
      isGenerating={isCurrentRun}
      isCanceled={run.status === "canceled"}
      isFailed={run.status === "failed"}
      canRetry={isTail && !!run}
      onRetry={() => handleRetry(runId)}
      elapsedSeconds={run.elapsedSeconds ?? undefined}
      modelName={run.modelName}
    />
  );
}

function renderErrorMessage(runId: string, isTail: boolean, handleRetry: (runId: string) => Promise<void>) {
  return (
    <AIChatMessageLayout role="assistant">
      <AIChatMessageStatus state="failed" canRetry={isTail} onRetry={() => handleRetry(runId)} />
    </AIChatMessageLayout>
  );
}

function renderChatMessage(options: {
  message: UIMessage;
  content: ReactNode;
  run: GenerationRun;
  runId: string;
  isTail: boolean;
  handleRetry: (runId: string) => Promise<void>;
}) {
  const { message, content, run, runId, isTail, handleRetry } = options;

  if (run.status === "streaming") {
    if (getTextMessageContent(message)) return content;

    return (
      <AIChatMessageLayout role="assistant">
        <AIChatMessageStatus state="pending" />
      </AIChatMessageLayout>
    );
  }

  if (run.status === "success" && run.elapsedSeconds !== null) {
    return (
      <div className="flex flex-col gap-2 self-start w-full">
        {content}
        <AIChatMessageStatus state="success" elapsedSeconds={run.elapsedSeconds} modelName={run.modelName} />
      </div>
    );
  }

  if (run.status === "canceled" && run.elapsedSeconds !== null) {
    return (
      <div className="flex flex-col gap-2 self-start w-full">
        {content}
        <AIChatMessageStatus state="canceled" elapsedSeconds={run.elapsedSeconds} />
      </div>
    );
  }

  if (run.status === "failed") {
    return (
      <div className="flex flex-col gap-2 self-start w-full">
        {content}
        <AIChatMessageStatus state="failed" canRetry={isTail} onRetry={() => handleRetry(runId)} />
      </div>
    );
  }

  return content;
}

function makeHistoricalTemplate(fields: TemplateFields): Template {
  return {
    id: 0,
    title: "",
    content: {
      fields,
      layout: fields.map((field) => ({ field: field.id, operation: "display" as const })),
    },
    createdAt: new Date(0),
    updatedAt: new Date(0),
    isLocked: true,
  };
}
