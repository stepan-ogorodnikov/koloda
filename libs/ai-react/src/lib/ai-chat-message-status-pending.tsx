import { AIChatElapsedTimer } from "./ai-chat-elapsed-time";

export type AIChatMessageStatusPendingProps = {
  label: string;
  startedAt: Date;
};

export function AIChatMessageStatusPending({ label, startedAt }: AIChatMessageStatusPendingProps) {
  return (
    <div className="self-start flex flex-row flex-wrap items-center gap-4 px-3">
      <p className="animate-shimmer-text--fg-level-4/fg-level-1">{label}</p>
      <AIChatElapsedTimer startedAt={startedAt} />
    </div>
  );
}
