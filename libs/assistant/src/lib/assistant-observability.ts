/**
 * Structured assistant lifecycle / persistence logs.
 *
 * WHY: Tests correlate command/event transitions and save retries via
 * `setAssistantStructuredLogger`. The default sink is a no-op so the
 * app console stays quiet.
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

export function defaultLogAssistantStructured(_entry: AssistantStructuredLog): void {}

let logImpl: LogAssistantStructured = defaultLogAssistantStructured;

export function setAssistantStructuredLogger(logger: LogAssistantStructured): void {
  logImpl = logger;
}

export function resetAssistantStructuredLogger(): void {
  logImpl = defaultLogAssistantStructured;
}

export function logAssistantStructured(entry: AssistantStructuredLog): void {
  logImpl(entry);
}
