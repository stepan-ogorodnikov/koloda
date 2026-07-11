export type AIModel = {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  top_provider?: {
    max_completion_tokens?: number;
  };
  architecture?: {
    modality?: string;
    tokenizer?: string;
    instruct_type?: string;
  };
  supported_parameters?: string[];
  supported_reasoning_levels?: Array<{ effort: string; description: string }>;
  default_reasoning_level?: string;
};

export type ModelParameter = {
  type: "reasoning_effort";
  value: string;
  levels: Array<{ effort: string; description: string }>;
};

export type StreamUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};
