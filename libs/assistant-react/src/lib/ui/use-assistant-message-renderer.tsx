import { getTextMessageContent } from "@koloda/ai";
import { AIChatMessage, AIChatMessageLayout, AIChatMessageStatus, AIToolActivity } from "@koloda/ai-react";
import type { UIMessage } from "ai";
import { useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { memo, useCallback } from "react";
import { AssistantCardsMessage } from "./assistant-cards-message";
import { renderAssistantMarkdown, renderAssistantReasoningMarkdown } from "./assistant-markdown";
import {
  getAssistantMetadata,
  getMessageRunId,
  getUserMessageCreatedAt,
  makeHistoricalTemplate,
  serializeGeneratedCards,
} from "../state/assistant-messages";
import type { AssistantRun } from "../state/conversation-types";
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

      const chatMetadata = getAssistantMetadata(message);
      if (chatMetadata) {
        const run = runs[chatMetadata.runId];
        if (run) {
          return (
            <AssistantTurn
              message={message}
              run={run}
              runId={chatMetadata.runId}
              isCurrentRun={chatMetadata.runId === activeRunId}
              isTail={isTail}
              handleRetry={handleRetry}
            />
          );
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
};

function renderCardsMessage(options: RenderCardsMessageOptions) {
  const { run, runId, isCurrentRun } = options;
  // WHY: columns always come from the run snapshot. AssistantCardsMessage looks
  // up writeTargetTemplateId for the unavailable marker (ASSISTANT-CARD-GENERATION.md
  // §Card Display).
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
      deckId={addTargetDeckId}
      templateId={addTargetTemplateId}
      canAdd={run.cards.length > 0 && !isCurrentRun && addTargetDeckId !== null && addTargetTemplateId !== undefined}
      isGenerating={isCurrentRun}
    />
  );
}

function hasLiveRunActivity(run: AssistantRun): boolean {
  return run.toolCalls.some((entry) => entry.status === "running");
}

// WHY: pending means "this turn still owes a reply". Hide it when a tool or
// thinking row is still running, or when leftover text is already streaming
// (ASSISTANT-MESSAGES.md §Message States).
function shouldShowStreamingPending(run: AssistantRun, text: string): boolean {
  return run.status === "streaming" && !text && !hasLiveRunActivity(run);
}

// WHY: one terminal-status ladder for every run rendering path — the
// success/canceled/interrupted/failed copies had already drifted subtly.
// Streaming/pending states stay with the callers (the pending condition
// depends on leftover text and live activity, not on whether a table exists).
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
    return (
      <AIChatMessageStatus
        state="success"
        elapsedSeconds={run.elapsedSeconds ?? undefined}
        modelName={run.modelName}
        actions={copyAction}
      />
    );
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
  const status = shouldShowStreamingPending(run, text) ? (
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

type AssistantTurnProps = {
  message: UIMessage;
  run: AssistantRun;
  runId: string;
  isCurrentRun: boolean;
  isTail: boolean;
  handleRetry: (runId: string) => Promise<void>;
};

// WHY: memoized so a keystroke or a chunk streamed into the tail skips finished
// turns; immer keeps their message and run objects stable. The turn renders its
// own text instead of taking `AIChatMessages`' `content`, which is a new element
// on every render and would defeat the memo.
const AssistantTurn = memo(function AssistantTurn({
  message,
  run,
  runId,
  isCurrentRun,
  isTail,
  handleRetry,
}: AssistantTurnProps) {
  const content = <AIChatMessage role="assistant" parts={message.parts} renderText={renderAssistantMarkdown} />;
  const text = getTextMessageContent(message);
  // WHY: copy mirrors the rendered turn — cards first, leftover text second —
  // reusing the history serialization so multi-line card markdown survives.
  const cardsCopy =
    run.cards.length > 0 && run.templateFields
      ? serializeGeneratedCards(run.cards, makeHistoricalTemplate(run.templateFields))
      : null;
  const copyText = [cardsCopy, text].filter(Boolean).join("\n\n");
  const copyAction = copyText ? <CopyMessageButton text={copyText} /> : null;
  // WHY: tool + thinking traffic lives on the run, not message parts — the
  // widget must read `run.toolCalls` so arrival order is preserved.
  // Markdown is injected here so `@koloda/ai-react` stays free of `@koloda/srs`.
  const toolActivity =
    run.toolCalls.length > 0 ? (
      <AIToolActivity calls={run.toolCalls} renderText={renderAssistantReasoningMarkdown} />
    ) : null;
  const cardsBlock = run.cards.length > 0 ? renderCardsMessage({ run, runId, isCurrentRun }) : null;

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
    const pending = shouldShowStreamingPending(run, text) ? (
      <AIChatMessageStatus state="pending" startedAt={run.startedAt} />
    ) : null;
    if (toolActivity || text) {
      return (
        <div className="group flex flex-col gap-2 self-start w-full">
          {toolActivity}
          {text ? content : null}
          {pending}
        </div>
      );
    }
    return <AIChatMessageLayout role="assistant">{pending}</AIChatMessageLayout>;
  }

  return (
    <div className="group flex flex-col gap-2 self-start w-full">
      {toolActivity}
      {content}
      {renderRunStatus({ run, runId, isTail, copyAction, handleRetry })}
    </div>
  );
});
