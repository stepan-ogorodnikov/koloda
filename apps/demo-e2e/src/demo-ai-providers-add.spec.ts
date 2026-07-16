import { expect, test } from "@playwright/test";
import {
  fillAIProfileTitle,
  openAddAIDialog,
  selectAIProvider,
  setupDemo,
  setupPageDefaults,
  submitAddAIDialog,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

const providerCases = [
  { name: "OpenRouter", title: "My OpenRouter", requiredField: { name: "API key", value: "sk-test-key-12345" } },
  { name: "Ollama", title: "My Ollama", requiredField: { name: "Base URL", value: "http://localhost:11434" } },
  { name: "LM Studio", title: "My LM Studio", requiredField: { name: "Base URL", value: "http://localhost:1234/v1" } },
] as const;

test("validates required fields and adds profiles for all providers", async ({ page }) => {
  await setupDemo(page);
  await openAddAIDialog(page);

  for (const [index, { name, title, requiredField }] of providerCases.entries()) {
    if (name !== "OpenRouter") {
      const previousProvider = providerCases[index - 1].name;
      await selectAIProvider(page, name, previousProvider);
    }

    // --- Validation: empty required field, dialog stays open ---
    // Ollama / LM Studio prefill Base URL; clear it so submit actually hits validation.
    const requiredInput = page.getByRole("textbox", { name: requiredField.name });
    await requiredInput.click();
    await requiredInput.clear();
    await requiredInput.blur();

    await submitAddAIDialog(page);
    await expect(page.getByRole("dialog", { name: "Add AI Profile" })).toBeVisible();

    // First iteration: also verify "No profiles" is still shown (no profile was added).
    if (index === 0) {
      await expect(page.getByText("No profiles")).toBeVisible();
    }

    // --- Success: fill required fields and submit ---
    await fillAIProfileTitle(page, title);
    await requiredInput.fill(requiredField.value);
    await submitAddAIDialog(page);

    await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByText(name, { exact: true })).toBeVisible();

    // Re-open the dialog for the next iteration and wait for the form to be ready.
    if (index < providerCases.length - 1) {
      await page.getByRole("button", { name: "Add profile" }).click();
      const addDialog = page.getByRole("dialog", { name: "Add AI Profile" });
      await expect(addDialog).toBeVisible();
      await expect(addDialog.getByRole("button", { name })).toBeVisible();
    }
  }
});
