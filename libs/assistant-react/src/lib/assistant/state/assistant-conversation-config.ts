export type AssistantConversationConfig = {
  profileId: string;
  modelId: string;
  modelName?: string;
  temperature: number;
  reasoningEffort: string;
  chatPromptTemplate: string | null;
};
