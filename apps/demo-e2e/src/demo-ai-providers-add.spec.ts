import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openSection, setupDemo, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

async function openAddAIDialog(page: Page) {
  await openSection(page, "Settings");
  await page.getByRole("link", { name: "AI", exact: true }).click();
  await expect(page.getByText("No profiles")).toBeVisible();

  await page.getByRole("button", { name: "Add profile" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add AI Profile" })).toBeVisible();
}

async function selectProvider(page: Page, provider: string) {
  await page.getByRole("button", { name: "OpenRouter" }).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.getByRole("option", { name: provider, exact: true }).click();
}

async function fillTitle(page: Page, title: string) {
  await page.getByRole("textbox", { name: "Title" }).fill(title);
}

async function submitDialog(page: Page) {
  await page.getByRole("button", { name: "Add", exact: true }).click();
}

test("shows validation error for OpenRouter with empty API key", async ({ page }) => {
  await setupDemo(page);
  await openAddAIDialog(page);

  // "OpenRouter" is selected by default, try to submit without filling required fields
  await submitDialog(page);

  // Verify dialog is still open (form didn't submit due to validation)
  await expect(page.getByRole("dialog")).toBeVisible();

  // Verify no profile was added
  await expect(page.getByText("No profiles")).toBeVisible();
});

test("adds OpenRouter provider successfully", async ({ page }) => {
  await setupDemo(page);
  await openAddAIDialog(page);

  // Fill in fields
  await fillTitle(page, "My OpenRouter");
  await page.getByRole("textbox", { name: "API key" }).fill("sk-test-key-12345");

  await submitDialog(page);

  // Verify the profile was added
  await expect(page.getByText("My OpenRouter")).toBeVisible();
  await expect(page.getByText("OpenRouter", { exact: true })).toBeVisible();
});

test("shows validation error for Ollama with empty Base URL", async ({ page }) => {
  await setupDemo(page);
  await openAddAIDialog(page);
  await selectProvider(page, "Ollama");

  // Try to submit without filling required fields
  await submitDialog(page);

  // Verify dialog is still open (form didn't submit due to validation)
  await expect(page.getByRole("dialog", { name: "Add AI Profile" })).toBeVisible();

  // Verify no profile was added
  await expect(page.getByText("No profiles")).toBeVisible();
});

test("adds Ollama provider successfully", async ({ page }) => {
  await setupDemo(page);
  await openAddAIDialog(page);
  await selectProvider(page, "Ollama");

  // Fill in fields
  await fillTitle(page, "My Ollama");
  await page.getByRole("textbox", { name: "Base URL" }).fill("http://localhost:11434");

  await submitDialog(page);

  // Verify the profile was added
  await expect(page.getByText("My Ollama")).toBeVisible();
  await expect(page.getByText("Ollama", { exact: true })).toBeVisible();
});

test("shows validation error for LM Studio with empty Base URL", async ({ page }) => {
  await setupDemo(page);
  await openAddAIDialog(page);
  await selectProvider(page, "LM Studio");

  // Try to submit without filling required fields
  await submitDialog(page);

  // Verify dialog is still open (form didn't submit due to validation)
  await expect(page.getByRole("dialog", { name: "Add AI Profile" })).toBeVisible();

  // Verify no profile was added
  await expect(page.getByText("No profiles")).toBeVisible();
});

test("adds LM Studio provider successfully", async ({ page }) => {
  await setupDemo(page);
  await openAddAIDialog(page);
  await selectProvider(page, "LM Studio");

  // Fill in fields
  await fillTitle(page, "My LM Studio");
  await page.getByRole("textbox", { name: "Base URL" }).fill("http://localhost:1234/v1");

  await submitDialog(page);

  // Verify the profile was added
  await expect(page.getByText("My LM Studio")).toBeVisible();
  await expect(page.getByText("LM Studio", { exact: true })).toBeVisible();
});
