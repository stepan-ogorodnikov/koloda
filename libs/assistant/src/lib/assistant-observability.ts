/**
 * Structured assistant lifecycle / persistence logs.
 *
 * WHY: Correlate command/event transitions and save retries across
 * conversations without relying on ad-hoc console strings
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

// WHY: transitions and saves log on every run event and are noise in a
// production console. Vite defines `import.meta.env.DEV` in app and test
// builds, so the default logger is silent outside development; hosts and
// tests opt in via `setAssistantStructuredLogger`.
const IS_DEV: boolean = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;

export function defaultLogAssistantStructured(entry: AssistantStructuredLog): void {
  if (!IS_DEV) return;
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
