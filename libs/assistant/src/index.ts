export { AssistantDuplicateRunError, AssistantEngineClosedError, createAssistantEngine } from "./lib/assistant-engine";
export type { AssistantEngine } from "./lib/assistant-engine";
export type { AssistantExecutionIdentity, AssistantExecutionPort } from "./lib/assistant-execution-port";
export {
  logAssistantStructured,
  resetAssistantStructuredLogger,
  setAssistantStructuredLogger,
} from "./lib/assistant-observability";
export type { AssistantStructuredLog } from "./lib/assistant-observability";
export { boundRunErrorDetails } from "./lib/assistant-protocol";
export type { AssistantCommand, AssistantEvent, AssistantRunError } from "./lib/assistant-protocol";
export { SHUTDOWN_FLUSH_TIMEOUT_MS, createConversationPersistenceHost } from "./lib/conversation-persistence-host";
export type { ConversationPersistenceHost } from "./lib/conversation-persistence-host";
export { IDLE_SAVE_DEBOUNCE_MS } from "./lib/create-save-scheduler";
