import { getTextMessageContent } from "@koloda/ai";
import { AIChatMessageLayout, AIChatMessageStatus, AIToolActivity } from "@koloda/ai-react";
import type { Template } from "@koloda/srs";
import type { UIMessage } from "ai";
import { useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { useCallback } from "react";
import { AssistantCardsMessage } from "./assistant-cards-message";
import {
  getChatTextMetadata,
  getErrorMetadata,
  getGeneratedCardsMetadata,
  getMessageRunId,
  getUserMessageCreatedAt,
  makeHistoricalTemplate,
} from "../state/assistant-messages";
import type { GenerationRun } from "../state/conversation-reducer";
import {
  assistantActiveRunIdAtom,
  assistantDeckIdAtom,
  assistantMessagesAtom,
  assistantRunsAtom,
} from "../state/conversation-selectors";
import { CopyMessageButton } from "./copy-message-button";
import { MessageTimestamp } from "./message-timestamp";
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
      if (message.role === "user") {
        const runId = getMessageRunId(message);
        const timestamp = getUserMessageCreatedAt(message) ?? (runId ? runs[runId]?.startedAt : undefined) ?? null;
        return renderUserMessage(message, content, handleRevert, timestamp);
      }

      const isTail = message.id === tailMessageId;

      const generatedCardsMetadata = getGeneratedCardsMetadata(message);
      if (generatedCardsMetadata) {
        const run = runs[generatedCardsMetadata.runId];
        // INVARIANT: Historical generated-cards rows keep the table after mode
        // is no longer "cards" (retry overwrites mode; mixed restore). The
        // table is the metadata, not `run.mode === "cards"`.
        if (run) {
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
        if (run) {
          return renderChatMessage({
            message,
            content,
            run,
            runId: chatMetadata.runId,
            isCurrentRun: chatMetadata.runId === activeRunId,
            isTail,
            templateId,
            handleRetry,
          });
        }
      }

      return content;
    },
    [tailMessageId, runs, activeRunId, templateId, deckId, handleRetry, handleRevert],
  );
}

function renderUserMessage(
  message: UIMessage,
  content: ReactNode,
  handleRevert: (id: string) => void,
  timestamp: Date | null,
) {
  return (
    <div className="group self-end flex flex-col items-end gap-1 w-full">
      {content}
      <div className="flex flex-row items-center justify-end gap-2 mx-3">
        <div className="flex flex-row items-center justify-end gap-1">
          <CopyMessageButton text={getTextMessageContent(message)} />
          <RevertMessageButton onPress={() => handleRevert(message.id)} />
        </div>
        {timestamp ? <MessageTimestamp timestamp={timestamp} /> : null}
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
  showStatus?: boolean;
}) {
  const { run, runId, isCurrentRun, isTail, deckId, templateId, handleRetry, showStatus } = options;
  const templateFieldsMissing = run.templateFields === null;
  const cardsTemplate = run.templateFields ? makeHistoricalTemplate(run.templateFields) : null;

  if (!cardsTemplate && !templateFieldsMissing) return null;

  // INVARIANT: Chat proposals add to writeTargetDeckId / writeTargetTemplateId,
  // not the picker deck. Cards-mode keeps the picker as the write target
  // (no writeTarget* on the run).
  const addTargetDeckId = run.writeTargetDeckId ?? (run.mode === "cards" ? deckId : null);
  const addTargetTemplateId = run.writeTargetTemplateId ?? (run.mode === "cards" ? templateId : undefined);

  return (
    <AssistantCardsMessage
      runId={runId}
      cards={run.cards}
      cardStatuses={run.cardStatuses}
      template={cardsTemplate}
      templateUnavailable={templateFieldsMissing}
      deckId={addTargetDeckId}
      templateId={addTargetTemplateId}
      canAdd={run.cards.length > 0 && !isCurrentRun && addTargetDeckId !== null && addTargetTemplateId !== undefined}
      isGenerating={isCurrentRun}
      showStatus={showStatus}
      isCanceled={run.status === "canceled"}
      isInterrupted={run.status === "interrupted"}
      isFailed={run.status === "failed"}
      canRetry={isTail && !!run}
      onRetry={() => handleRetry(runId)}
      elapsedSeconds={run.elapsedSeconds ?? undefined}
      startedAt={run.startedAt}
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

function renderChatProposal(options: {
  toolActivity: ReactNode;
  cardsBlock: ReactNode;
  text: string;
  content: ReactNode;
  copyAction: ReactNode;
  run: GenerationRun;
  runId: string;
  isTail: boolean;
  handleRetry: (runId: string) => Promise<void>;
}) {
  const { toolActivity, cardsBlock, text, content, copyAction, run, runId, isTail, handleRetry } = options;
  const status =
    run.status === "streaming" && !text ? (
      <AIChatMessageStatus state="pending" startedAt={run.startedAt} />
    ) : run.status === "success" && run.elapsedSeconds !== null ? (
      <AIChatMessageStatus
        state="success"
        elapsedSeconds={run.elapsedSeconds}
        modelName={run.modelName}
        actions={copyAction}
      />
    ) : run.status === "canceled" ? (
      <AIChatMessageStatus
        state="canceled"
        elapsedSeconds={run.elapsedSeconds ?? undefined}
        canRetry={isTail}
        onRetry={() => handleRetry(runId)}
        actions={copyAction}
      />
    ) : run.status === "interrupted" ? (
      <AIChatMessageStatus
        state="interrupted"
        elapsedSeconds={run.elapsedSeconds ?? undefined}
        canRetry={isTail}
        onRetry={() => handleRetry(runId)}
        actions={copyAction}
      />
    ) : run.status === "failed" ? (
      <AIChatMessageStatus state="failed" canRetry={isTail} onRetry={() => handleRetry(runId)} actions={copyAction} />
    ) : null;

  return (
    <div className="group flex flex-col gap-2 self-start w-full">
      {toolActivity}
      {cardsBlock}
      {text ? content : null}
      {status}
    </div>
  );
}

function renderChatMessage(options: {
  message: UIMessage;
  content: ReactNode;
  run: GenerationRun;
  runId: string;
  isCurrentRun: boolean;
  isTail: boolean;
  templateId: Template["id"] | undefined;
  handleRetry: (runId: string) => Promise<void>;
}) {
  const { message, content, run, runId, isCurrentRun, isTail, templateId, handleRetry } = options;
  const text = getTextMessageContent(message);
  const copyAction = text ? <CopyMessageButton text={text} /> : null;
  // WHY: tool traffic lives on the run, not message parts — updateAssistantText
  // replaces parts wholesale, so the widget must read `run.toolCalls`.
  const toolActivity = run.toolCalls && run.toolCalls.length > 0 ? <AIToolActivity calls={run.toolCalls} /> : null;
  const cardsBlock =
    run.cards.length > 0
      ? renderCardsMessage({
          run,
          runId,
          isCurrentRun,
          isTail,
          deckId: null,
          templateId,
          handleRetry,
          // WHY: table is done once cards exist. Run status belongs under any
          // leftover note, not on the table as a second "Working".
          showStatus: false,
        })
      : null;

  // WHY: table first, leftover text second. The dump is still possible; putting
  // it below keeps the table as the card UI without dropping useful notes.
  if (cardsBlock) {
    return renderChatProposal({
      toolActivity,
      cardsBlock,
      text,
      content,
      copyAction,
      run,
      runId,
      isTail,
      handleRetry,
    });
  }

  if (run.status === "streaming") {
    if (toolActivity) {
      return (
        <div className="group flex flex-col gap-2 self-start w-full">
          {toolActivity}
          {text ? content : null}
        </div>
      );
    }
    if (text) return content;
    return (
      <AIChatMessageLayout role="assistant">
        <AIChatMessageStatus state="pending" startedAt={run.startedAt} />
      </AIChatMessageLayout>
    );
  }

  if (run.status === "success" && run.elapsedSeconds !== null) {
    return (
      <div className="group flex flex-col gap-2 self-start w-full">
        {toolActivity}
        {content}
        <AIChatMessageStatus
          state="success"
          elapsedSeconds={run.elapsedSeconds}
          modelName={run.modelName}
          actions={copyAction}
        />
      </div>
    );
  }

  if (run.status === "canceled") {
    return (
      <div className="group flex flex-col gap-2 self-start w-full">
        {toolActivity}
        {content}
        <AIChatMessageStatus
          state="canceled"
          elapsedSeconds={run.elapsedSeconds ?? undefined}
          canRetry={isTail}
          onRetry={() => handleRetry(runId)}
          actions={copyAction}
        />
      </div>
    );
  }

  if (run.status === "interrupted") {
    return (
      <div className="group flex flex-col gap-2 self-start w-full">
        {toolActivity}
        {content}
        <AIChatMessageStatus
          state="interrupted"
          elapsedSeconds={run.elapsedSeconds ?? undefined}
          canRetry={isTail}
          onRetry={() => handleRetry(runId)}
          actions={copyAction}
        />
      </div>
    );
  }

  if (run.status === "failed") {
    return (
      <div className="group flex flex-col gap-2 self-start w-full">
        {toolActivity}
        {content}
        <AIChatMessageStatus state="failed" canRetry={isTail} onRetry={() => handleRetry(runId)} actions={copyAction} />
      </div>
    );
  }

  return content;
}
