import type { AssistantEvent } from "@koloda/assistant";
import type { ConversationReducerAction } from "../state/conversation-reducer";
import type { DataAccessSnapshot } from "./data-access";

/** Translate engine events into conversation-reducer actions for the Jotai store. */
export function assistantEventToReducerAction(event: AssistantEvent): ConversationReducerAction {
  switch (event.type) {
    case "runStarted":
      return [
        "restartRun",
        {
          runId: event.run.runId,
          templateFields: event.run.templateFields,
          mode: event.run.mode,
          modelName: event.run.modelName,
          // WHY: the engine carries the snapshot opaquely (`manifest: unknown`);
          // this adapter is the boundary that restores the store's typed shape.
          dataAccess: event.run.dataAccess as DataAccessSnapshot | undefined,
        },
      ];
    case "runChunk": {
      const { chunk, runId } = event;
      if (chunk.kind === "assistantText") return ["updateAssistantText", { runId, text: chunk.text }];
      if (chunk.kind === "card") return ["addCard", { runId, card: chunk.card }];
      if (chunk.kind === "toolCall") return ["addToolCall", { runId, call: chunk.call }];
      if (chunk.kind === "toolResult") {
        return ["setToolCallResult", { runId, callId: chunk.callId, output: chunk.output, error: chunk.error }];
      }
      return ["setUsage", { runId, usage: chunk.usage }];
    }
    case "runTerminated": {
      const { outcome, runId } = event;
      if (outcome.status === "success") return ["completeRun", { runId }];
      if (outcome.status === "failed") return ["runFailed", { runId, error: outcome.error }];
      if (outcome.status === "canceled") return ["cancelRun", { runId }];
      return ["interruptRun", { runId, reason: outcome.reason }];
    }
  }
}
