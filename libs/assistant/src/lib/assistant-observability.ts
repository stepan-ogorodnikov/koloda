/**
 * Structured assistant lifecycle / persistence logs.
 *
 * WHY: Correlate command/event transitions and save retries across
 * conversations without relying on ad-hoc console strings
 * (ASSISTANT-ARCHITECTURE-REWORK §Documentation and observability).
 */
export type AssistantStructuredLog = {
  conversationId: string;
  runId?: string;
  /** Host IPC / transport correlation id (Electron stream id). Optional when the host has no transport. */
  requestId?: string;
  commandOrEvent: string;
  priorStatus?: string;
  nextStatus?: string;
  terminationReason?: string;
  saveGeneration?: number;
  retryAttempt?: number;
  errorCategory?: string;
};

export type LogAssistantStructured = (entry: AssistantStructuredLog) => void;

export function defaultLogAssistantStructured(entry: AssistantStructuredLog): void {
  console.info("[assistant.transition]", entry);
}

let logImpl: LogAssistantStructured = defaultLogAssistantStructured;

/** Override the structured logger (tests). */
export function setAssistantStructuredLogger(logger: LogAssistantStructured): void {
  logImpl = logger;
}

export function resetAssistantStructuredLogger(): void {
  logImpl = defaultLogAssistantStructured;
}

export function logAssistantStructured(entry: AssistantStructuredLog): void {
  logImpl(entry);
}
