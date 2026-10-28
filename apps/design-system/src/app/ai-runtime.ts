import type { AIRuntime } from "@koloda/ai";
import { SAMPLE_AI_MODELS } from "./assistant-samples";

// WHY: the app talks to no provider. Sending a prompt fails the run, which shows the chat's error state.
export const aiRuntime: AIRuntime = {
  listModels: async () => SAMPLE_AI_MODELS,
  chat: () => Promise.reject(new Error("The design system app has no AI provider")),
};
