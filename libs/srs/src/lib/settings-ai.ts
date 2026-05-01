import type { AISecrets } from "@koloda/ai";
import type { AppError } from "./error";

export type AddAIProfileFormProps = {
  onSubmit: (data: { title?: string; secrets: AISecrets }) => void;
  isPending: boolean;
  error?: AppError | null;
};

export type EditAIProfileFormProps = {
  profile: { id: string; title?: string; secrets?: AISecrets };
  onSubmit: (data: { title?: string; secrets?: AISecrets }) => void;
  isPending: boolean;
  error?: AppError | null;
};

export type AIProviderFieldConfig = {
  name: "apiKey" | "baseUrl";
  type: "password" | "url" | "text";
  required: boolean;
  placeholder?: string;
};
