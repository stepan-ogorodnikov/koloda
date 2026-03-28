import type { UIMessage, UIMessagePart } from "ai";
import type { PropsWithChildren } from "react";
import { tv } from "tailwind-variants";

export type AIChatMessageProps = {
  role: UIMessage["role"];
  modelName?: string;
  parts: UIMessagePart<any, any>[];
};

export function AIChatMessage({ role, parts }: AIChatMessageProps) {
  const filteredParts = getMessageParts(parts);

  return (
    <AIChatMessageLayout role={role}>
      {filteredParts.map((part, index) => <MessagePart key={index} part={part} />)}
    </AIChatMessageLayout>
  );
}

const aiChatMessage = tv({
  base: "flex flex-col gap-4 py-2",
  variants: {
    isUser: {
      true: "self-end max-w-5/6 px-3 border-2 rounded-xl bg-chat-message border-chat-message",
      false: "self-start w-full",
    },
  },
});

type AIChatMessageLayoutProps = PropsWithChildren & {
  role: UIMessage["role"];
};

export function AIChatMessageLayout({ role, children }: AIChatMessageLayoutProps) {
  return (
    <div className={aiChatMessage({ isUser: role === "user" })}>
      <div className="flex flex-col gap-2">
        {children}
      </div>
    </div>
  );
}

function MessagePart({ part }: { part: UIMessagePart<any, any> }) {
  switch (part.type) {
    case "text":
      return <p className="whitespace-pre-wrap leading-6">{part.text}</p>;
    case "reasoning":
      return <p className="whitespace-pre-wrap leading-6 fg-level-3">{part.text}</p>;
    case "source-url":
      return <p className="fg-level-3">{part.title || part.url}</p>;
    case "source-document":
      return <p className="fg-level-3">{part.title}</p>;
    case "file":
      return <p className="fg-level-3">{part.filename || part.mediaType}</p>;
    case "dynamic-tool":
      return <p className="fg-level-3">{part.toolName}</p>;
    default:
      if (part.type.startsWith("tool-")) return <p className="fg-level-3">{part.type}</p>;
      if (part.type.startsWith("data-")) return <p className="fg-level-3">{part.type}</p>;
      return null;
  }
}

function getMessageParts(parts: UIMessagePart<any, any>[]) {
  return parts.filter((part) => part.type !== "step-start");
}
