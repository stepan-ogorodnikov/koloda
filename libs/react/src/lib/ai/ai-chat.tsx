import type { UIMessage } from "ai";
import type { FormEvent, ReactNode } from "react";
import { Fragment, useState } from "react";
import { useEffect } from "react";
import { AIChatMessage } from "./ai-chat-message";
import { AIChatPromptInput } from "./ai-chat-prompt-input";
import { AIChatSubmit } from "./ai-chat-submit";
import { AIModelPicker } from "./ai-model-picker";
import { AIProfilePicker } from "./ai-profile-picker";
import { useAIProfiles } from "./use-ai-profiles";

const aiChatPanel = [
  "flex flex-col gap-2 w-full max-w-3xl mx-auto p-2",
  "rounded-t-xl border-2 border-b-0 border-input bg-input shadow-input",
].join(" ");

export type AIChatProps = {
  messages: UIMessage[];
  profileId: string;
  modelId: string;
  modelName?: string;
  onProfileChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onSubmit: (value: string) => void | Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
  error?: string | null;
  autoSelectDefaultProfile?: boolean;
  emptyState?: ReactNode;
  renderMessage?: (message: UIMessage, content: ReactNode) => ReactNode;
};

export function AIChat({
  messages,
  profileId,
  modelId,
  modelName,
  onProfileChange,
  onModelChange,
  onSubmit,
  onCancel,
  isLoading = false,
  error,
  autoSelectDefaultProfile = true,
  emptyState = null,
  renderMessage,
}: AIChatProps) {
  const { defaultProfileId } = useAIProfiles();
  const [inputValue, setInputValue] = useState("");
  const prompt = inputValue.trim();

  useEffect(() => {
    if (autoSelectDefaultProfile && defaultProfileId && !profileId) {
      onProfileChange(defaultProfileId);
    }
  }, [autoSelectDefaultProfile, defaultProfileId, profileId, onProfileChange]);

  const submit = () => {
    if (profileId && modelId && prompt && !isLoading) {
      onSubmit(prompt);
      setInputValue("");
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const canSubmit = !!(profileId && modelId && !!prompt && !isLoading);
  const canCancel = isLoading && !!onCancel;

  return (
    <section className="flex flex-col h-full min-h-0">
      <div className="min-h-0 grow overflow-y-auto p-4">
        {messages.length === 0
          ? emptyState
          : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
              {messages.map((message) => {
                const content = (
                  <AIChatMessage
                    role={message.role}
                    modelName={modelName}
                    parts={message.parts}
                    key={message.id}
                  />
                );
                return (
                  <Fragment key={message.id}>
                    {renderMessage ? renderMessage(message, content) : content}
                  </Fragment>
                );
              })}
            </div>
          )}
      </div>
      {error && <p className="fg-error">{error}</p>}
      <form className={aiChatPanel} onSubmit={handleSubmit}>
        <AIChatPromptInput value={inputValue} onChange={setInputValue} onSubmit={submit} />
        <div className="flex items-center gap-3">
          <AIProfilePicker value={profileId} onChange={onProfileChange} />
          <AIModelPicker profileId={profileId} value={modelId} onChange={onModelChange} />
          <div className="grow" />
          <AIChatSubmit canSubmit={canSubmit} canCancel={canCancel} onCancel={onCancel} />
        </div>
      </form>
    </section>
  );
}
