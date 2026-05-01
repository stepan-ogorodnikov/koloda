import { AiChatElapsedTimer } from "./ai-chat-elapsed-time";

export function AiChatMessageStatusPending({ label }: { label: string }) {
  return (
    <div className="self-start flex flex-row flex-wrap items-center gap-4">
      <p className="animate-shimmer-text--fg-level-4/fg-level-1">{label}</p>
      <AiChatElapsedTimer />
    </div>
  );
}
