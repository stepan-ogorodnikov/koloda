import { describe, expect, it } from "vitest";
import { AI_PROVIDER_FORM_CONFIG, getEditSchema } from "./ai-provider-form-config";

describe("getEditSchema", () => {
  const openrouter = AI_PROVIDER_FORM_CONFIG.openrouter;
  const ollama = AI_PROVIDER_FORM_CONFIG.ollama;

  it("rejects a whitespace-only replacement apiKey when secrets are stored", () => {
    const result = getEditSchema(openrouter, true).safeParse({ title: "Main", apiKey: "   " });
    expect(result.success).toBe(false);
    const issue = result.error!.issues[0];
    expect(issue?.path).toEqual(["apiKey"]);
    expect(issue?.message).toBe("validation.settings-ai.providers.apiKey");
  });

  it("treats a blank apiKey as keep-existing when secrets are stored", () => {
    const parsed = getEditSchema(openrouter, true).parse({ title: "Main", apiKey: "" });
    expect(parsed.apiKey).toBeUndefined();
  });

  it("accepts a non-blank replacement apiKey when secrets are stored", () => {
    const result = getEditSchema(openrouter, true).safeParse({ title: "Main", apiKey: "sk-or" });
    expect(result.success).toBe(true);
  });

  it("keeps the required add-schema key when no secrets are stored", () => {
    const result = getEditSchema(openrouter, false).safeParse({ title: "Main", apiKey: "   " });
    expect(result.success).toBe(false);
  });

  it("stays lenient on a whitespace-only optional apiKey for ollama", () => {
    // WHY: Rust ignores optional keys on input (`domain/ai.rs` only trims required keys),
    // so the edit schema must stay as lenient as the add schema here.
    const parsed = getEditSchema(ollama, true).parse({
      title: "Local",
      baseUrl: "http://localhost:11434",
      apiKey: "   ",
    });
    expect(parsed.apiKey).toBe("   ");
  });
});
