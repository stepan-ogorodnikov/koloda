import { AiChatElapsedTimer } from "./ai-chat-elapsed-time";

export type AiChatMessageStatusPendingProps = {
  label: string;
  startedAt: Date;
};

export function AiChatMessageStatusPending({ label, startedAt }: AiChatMessageStatusPendingProps) {
  return (
    <div className="self-start flex flex-row flex-wrap items-center gap-4 px-3">
      <p className="animate-shimmer-text--fg-level-4/fg-level-1">{label}</p>
      <AiChatElapsedTimer startedAt={startedAt} />
    </div>
  );
}
