import { getTextMessageContent } from "@koloda/ai";
import { AIChatMessageLayout, AIChatMessageStatus, AIToolActivity } from "@koloda/ai-react";
import type { UIMessage } from "ai";
import { useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { useCallback } from "react";
import { AssistantCardsMessage } from "./assistant-cards-message";
import { renderAssistantReasoningMarkdown } from "./assistant-markdown";
import {
  getChatTextMetadata,
  getErrorMetadata,
  getMessageRunId,
  getUserMessageCreatedAt,
  makeHistoricalTemplate,
} from "../state/assistant-messages";
import type { AssistantRun } from "../state/conversation-reducer";
import { assistantActiveRunIdAtom, assistantMessagesAtom, assistantRunsAtom } from "../state/conversation-selectors";
import { CopyMessageButton } from "./copy-message-button";
import { MessageTimestamp } from "./message-timestamp";
import { RevertMessageButton } from "./revert-message-button";

export type UseAssistantMessageRendererProps = {
  handleRetry: (runId: string) => Promise<void>;
  handleRevert: (userMessageId: string) => void;
};

export function useAssistantMessageRenderer({ handleRetry, handleRevert }: UseAssistantMessageRendererProps) {
  const runs = useAtomValue(assistantRunsAtom);
  const messages = useAtomValue(assistantMessagesAtom);
  const activeRunId = useAtomValue(assistantActiveRunIdAtom);
  const tailMessageId = messages.at(-1)?.id;

  return useCallback(
    (message: UIMessage, content: ReactNode) => {
      if (message.role === "user") {
        const runId = getMessageRunId(message);
        const timestamp = getUserMessageCreatedAt(message) ?? (runId ? runs[runId]?.startedAt : undefined) ?? null;
        return renderUserMessage(message, content, handleRevert, timestamp);
      }

      const isTail = message.id === tailMessageId;

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
            handleRetry,
          });
        }
      }

      return content;
    },
    [tailMessageId, runs, activeRunId, handleRetry, handleRevert],
  );
}

function renderUserMessage(
  message: UIMessage,
  content: ReactNode,
  handleRevert: (id: string) => void,
  timestamp: Date | null,
) {
  return (
    <div className="group self-end flex flex-col items-end gap-1 w-full not-first:mt-4">
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

type RenderCardsMessageOptions = {
  run: AssistantRun;
  runId: string;
  isCurrentRun: boolean;
  isTail: boolean;
  handleRetry: (runId: string) => Promise<void>;
  showStatus?: boolean;
};

function renderCardsMessage(options: RenderCardsMessageOptions) {
  const { run, runId, isCurrentRun, isTail, handleRetry, showStatus } = options;
  const templateFieldsMissing = run.templateFields === null;
  const cardsTemplate = run.templateFields ? makeHistoricalTemplate(run.templateFields) : null;

  // INVARIANT: Add uses writeTargetDeckId / writeTargetTemplateId only.
  // Missing either disables add.
  const addTargetDeckId = run.writeTargetDeckId ?? null;
  const addTargetTemplateId = run.writeTargetTemplateId;

  return (
    <AssistantCardsMessage
      runId={runId}
      cards={run.cards}
      cardStatuses={run.cardStatuses}
      template={cardsTemplate}
      isTemplateUnavailable={templateFieldsMissing}
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

// WHY: one terminal-status ladder for every run rendering path — the
// success/canceled/interrupted/failed copies had already drifted subtly.
// Streaming/pending states stay with the callers (the pending condition
// depends on whether leftover text or a cards table is present).
type RenderRunStatusOptions = {
  run: AssistantRun;
  runId: string;
  isTail: boolean;
  copyAction: ReactNode;
  handleRetry: (runId: string) => Promise<void>;
};

function renderRunStatus(options: RenderRunStatusOptions): ReactNode {
  const { run, runId, isTail, copyAction, handleRetry } = options;
  if (run.status === "success") {
    return run.elapsedSeconds !== null ? (
      <AIChatMessageStatus
        state="success"
        elapsedSeconds={run.elapsedSeconds}
        modelName={run.modelName}
        actions={copyAction}
      />
    ) : null;
  }
  if (run.status === "canceled" || run.status === "interrupted" || run.status === "failed") {
    return (
      <AIChatMessageStatus
        state={run.status}
        elapsedSeconds={run.elapsedSeconds ?? undefined}
        canRetry={isTail}
        onRetry={() => handleRetry(runId)}
        actions={copyAction}
      />
    );
  }
  return null;
}

type RenderChatProposalOptions = {
  toolActivity: ReactNode;
  cardsBlock: ReactNode;
  text: string;
  content: ReactNode;
  copyAction: ReactNode;
  run: AssistantRun;
  runId: string;
  isTail: boolean;
  handleRetry: (runId: string) => Promise<void>;
};

function renderChatProposal(options: RenderChatProposalOptions) {
  const { toolActivity, cardsBlock, text, content, copyAction, run, runId, isTail, handleRetry } = options;
  const status =
    run.status === "streaming" && !text ? (
      <AIChatMessageStatus state="pending" startedAt={run.startedAt} />
    ) : (
      renderRunStatus({ run, runId, isTail, copyAction, handleRetry })
    );

  return (
    <div className="group flex flex-col gap-2 self-start w-full">
      {toolActivity}
      {cardsBlock}
      {text ? content : null}
      {status}
    </div>
  );
}

type RenderChatMessageOptions = {
  message: UIMessage;
  content: ReactNode;
  run: AssistantRun;
  runId: string;
  isCurrentRun: boolean;
  isTail: boolean;
  handleRetry: (runId: string) => Promise<void>;
};

function renderChatMessage(options: RenderChatMessageOptions) {
  const { message, content, run, runId, isCurrentRun, isTail, handleRetry } = options;
  const text = getTextMessageContent(message);
  const copyAction = text ? <CopyMessageButton text={text} /> : null;
  // WHY: tool + thinking traffic lives on the run, not message parts — the
  // widget must read `run.toolCalls` so arrival order is preserved.
  // Markdown is injected here so `@koloda/ai-react` stays free of `@koloda/srs`.
  const toolActivity =
    run.toolCalls && run.toolCalls.length > 0 ? (
      <AIToolActivity calls={run.toolCalls} renderText={renderAssistantReasoningMarkdown} />
    ) : null;
  const cardsBlock =
    run.cards.length > 0
      ? renderCardsMessage({
          run,
          runId,
          isCurrentRun,
          isTail,
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

  const terminalStatus = renderRunStatus({ run, runId, isTail, copyAction, handleRetry });
  if (terminalStatus) {
    return (
      <div className="group flex flex-col gap-2 self-start w-full">
        {toolActivity}
        {content}
        {terminalStatus}
      </div>
    );
  }

  return content;
}
