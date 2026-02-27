import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { UIMessage, UIMessagePart } from "ai";
import type { PropsWithChildren, ReactNode } from "react";
import { tv } from "tailwind-variants";

export const AI_ROLE_LABELS: Record<UIMessage["role"], MessageDescriptor> = {
  user: msg`ai.chat.roles.user`,
  assistant: msg`ai.chat.roles.assistant`,
  system: msg`ai.chat.roles.system`,
};

export type AIChatMessageProps = {
  role: UIMessage["role"];
  modelName?: string;
  parts: UIMessagePart<any, any>[];
};

export function AIChatMessage({ role, modelName, parts }: AIChatMessageProps) {
  const { _ } = useLingui();
  const filteredParts = getMessageParts(parts);
  const label = (role === "assistant") && modelName ? modelName : _(AI_ROLE_LABELS[role]);

  return (
    <AIChatMessageLayout role={role} label={label}>
      {filteredParts.map((part, index) => <MessagePart key={index} part={part} />)}
    </AIChatMessageLayout>
  );
}

const aiChatMessage = tv({
  base: "flex flex-col gap-4 p-3 rounded-xl bg-chat-message border-2 border-chat-message",
  variants: { isUser: { true: "self-end max-w-5/6", false: "self-start w-full" } },
});

type AIChatMessageLayoutProps = PropsWithChildren & {
  role: UIMessage["role"];
  label: ReactNode;
};

export function AIChatMessageLayout({ role, label, children }: AIChatMessageLayoutProps) {
  return (
    <div className={aiChatMessage({ isUser: role === "user" })}>
      <div className="fg-level-3 font-bold">{label}</div>
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
