import type { AISecrets } from "@koloda/ai";

export type AddAIProfileFormProps = {
  onSubmit: (data: { title?: string; secrets: AISecrets }) => void;
  isPending: boolean;
  error?: Error | null;
};

export type EditAIProfileFormProps = {
  profile: { id: string; title?: string; secrets?: AISecrets };
  onSubmit: (data: { title?: string; secrets?: AISecrets }) => void;
  isPending: boolean;
  error?: Error | null;
};
