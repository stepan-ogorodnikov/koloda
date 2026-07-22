import { expect, test } from "./fixtures";
import {
  deleteAIProfile,
  fillAIProfileTitle,
  openAddAIDialog,
  selectAIProvider,
  setupApp,
  setupPageDefaults,
  submitAddAIDialog,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("deletes OpenRouter provider", async ({ page }) => {
  await setupApp(page);
  await openAddAIDialog(page);

  await fillAIProfileTitle(page, "OpenRouter to Delete");
  await page.getByRole("textbox", { name: "API key" }).fill("sk-test-key");
  await submitAddAIDialog(page);
  await expect(page.getByText("OpenRouter to Delete")).toBeVisible();

  await deleteAIProfile(page, "OpenRouter to Delete");

  await expect(page.getByText("OpenRouter to Delete")).not.toBeVisible();
  await expect(page.getByText("No profiles")).toBeVisible();
});

test("deletes Ollama provider", async ({ page }) => {
  await setupApp(page);
  await openAddAIDialog(page);
  await selectAIProvider(page, "Ollama");

  await fillAIProfileTitle(page, "Ollama to Delete");
  await page.getByRole("textbox", { name: "Base URL" }).fill("http://localhost:11434");
  await submitAddAIDialog(page);
  await expect(page.getByText("Ollama to Delete")).toBeVisible();

  await deleteAIProfile(page, "Ollama to Delete");

  await expect(page.getByText("Ollama to Delete")).not.toBeVisible();
  await expect(page.getByText("No profiles")).toBeVisible();
});

test("deletes LM Studio provider", async ({ page }) => {
  await setupApp(page);
  await openAddAIDialog(page);
  await selectAIProvider(page, "LM Studio");

  await fillAIProfileTitle(page, "LM Studio to Delete");
  await page.getByRole("textbox", { name: "Base URL" }).fill("http://localhost:1234/v1");
  await submitAddAIDialog(page);
  await expect(page.getByText("LM Studio to Delete")).toBeVisible();

  await deleteAIProfile(page, "LM Studio to Delete");

  await expect(page.getByText("LM Studio to Delete")).not.toBeVisible();
  await expect(page.getByText("No profiles")).toBeVisible();
});
