import { Button, TextField } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { UIMessage } from "ai";
import { Forward } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { Fragment } from "react";
import { useEffect } from "react";
import { AIChatMessage } from "./ai-chat-message";
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
  input: string;
  onProfileChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onInputChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
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
  input,
  onProfileChange,
  onModelChange,
  onInputChange,
  onSubmit,
  isLoading = false,
  error,
  autoSelectDefaultProfile = true,
  emptyState = null,
  renderMessage,
}: AIChatProps) {
  const { _ } = useLingui();
  const { defaultProfileId } = useAIProfiles();

  useEffect(() => {
    if (autoSelectDefaultProfile && defaultProfileId && !profileId) {
      onProfileChange(defaultProfileId);
    }
  }, [autoSelectDefaultProfile, defaultProfileId, profileId, onProfileChange]);

  const canSubmit = !!(profileId && modelId && input.trim() && !isLoading);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit();
  };

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
        <TextField
          aria-label={_(msg`ai.chat.input.label`)}
          value={input}
          onChange={onInputChange}
        >
          <TextField.TextArea
            variants={{ style: "inline", class: "resize-none" }}
            rows={4}
            placeholder={_(msg`ai.chat.input.placeholder`)}
          />
        </TextField>
        <div className="flex items-center gap-3">
          <AIProfilePicker value={profileId} onChange={onProfileChange} />
          <AIModelPicker profileId={profileId} value={modelId} onChange={onModelChange} />
          <div className="grow" />
          <Button variants={{ style: "primary", size: "icon" }} type="submit" isDisabled={!canSubmit}>
            <Forward className="size-5 min-w-5 mb-1 stroke-2" />
          </Button>
        </div>
      </form>
    </section>
  );
}
