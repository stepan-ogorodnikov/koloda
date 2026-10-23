export type AIModel = {
  id: string;
  name: string;
  context_length: number;
  supported_reasoning_levels?: Array<{ effort: string; description: string }>;
  default_reasoning_level?: string;
};

export type ModelParameter = {
  type: "reasoning_effort";
  value: string;
  levels: Array<{ effort: string; description: string }>;
  // WHY: false when the model's source names no default level. The picker then
  // offers Default, and `value` is "" until the user picks a level.
  hasDefault: boolean;
};

export type StreamUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};
