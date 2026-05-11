import { registerProviderImplementation } from "@koloda/ai";
import { createCodexClient, fetchCodexModels } from "../services/codex";

registerProviderImplementation("codex", {
  createClient: () => createCodexClient(),
  fetchModels: fetchCodexModels,
});
