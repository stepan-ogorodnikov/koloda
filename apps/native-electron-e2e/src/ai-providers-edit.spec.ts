import { expect, test } from "./fixtures";
import {
  fillAIProfileTitle,
  openAddAIDialog,
  openEditAIDialog,
  selectAIProvider,
  setupApp,
  setupPageDefaults,
  submitAddAIDialog,
  submitEditAIDialog,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("edits OpenRouter provider title and API key", async ({ page }) => {
  await setupApp(page);
  await openAddAIDialog(page);

  await fillAIProfileTitle(page, "Original Title");
  await page.getByRole("textbox", { name: "API key" }).fill("sk-original-key");
  await submitAddAIDialog(page);
  await expect(page.getByText("Original Title")).toBeVisible();

  await openEditAIDialog(page, "Original Title");

  await fillAIProfileTitle(page, "Updated OpenRouter");

  await page.getByRole("button", { name: "Replace with a new value" }).click();
  await page.getByRole("textbox", { name: "API key" }).fill("sk-updated-key");

  await submitEditAIDialog(page);

  await expect(page.getByText("Updated OpenRouter")).toBeVisible();
  await expect(page.getByText("Original Title")).not.toBeVisible();
});

test("edits Ollama provider title and Base URL", async ({ page }) => {
  await setupApp(page);
  await openAddAIDialog(page);
  await selectAIProvider(page, "Ollama");

  await fillAIProfileTitle(page, "Original Ollama");
  await page.getByRole("textbox", { name: "Base URL" }).fill("http://localhost:11434");
  await submitAddAIDialog(page);
  await expect(page.getByText("Original Ollama")).toBeVisible();

  await openEditAIDialog(page, "Original Ollama");

  await fillAIProfileTitle(page, "Updated Ollama");

  await page.getByRole("textbox", { name: "Base URL" }).fill("http://localhost:11435");

  await submitEditAIDialog(page);

  await expect(page.getByText("Updated Ollama")).toBeVisible();
  await expect(page.getByText("Original Ollama")).not.toBeVisible();
});

test("edits LM Studio provider title and Base URL", async ({ page }) => {
  await setupApp(page);
  await openAddAIDialog(page);
  await selectAIProvider(page, "LM Studio");

  await fillAIProfileTitle(page, "Original LM Studio");
  await page.getByRole("textbox", { name: "Base URL" }).fill("http://localhost:1234/v1");
  await submitAddAIDialog(page);
  await expect(page.getByText("Original LM Studio")).toBeVisible();

  await openEditAIDialog(page, "Original LM Studio");

  await fillAIProfileTitle(page, "Updated LM Studio");

  await page.getByRole("textbox", { name: "Base URL" }).fill("http://localhost:1235/v1");

  await submitEditAIDialog(page);

  await expect(page.getByText("Updated LM Studio")).toBeVisible();
  await expect(page.getByText("Original LM Studio")).not.toBeVisible();
});
