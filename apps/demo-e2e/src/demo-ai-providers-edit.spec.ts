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

async function openEditDialog(page: Page, profileTitle: string) {
  await page.locator("div", { hasText: profileTitle }).getByRole("button", { name: "Edit profile" }).click();
  await expect(page.getByRole("dialog", { name: "Edit AI profile" })).toBeVisible();
}

async function submitEditDialog(page: Page) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
}

test("edits OpenRouter provider title and API key", async ({ page }) => {
  await setupDemo(page);
  await openAddAIDialog(page);

  // Add an "OpenRouter" provider first
  await fillTitle(page, "Original Title");
  await page.getByRole("textbox", { name: "API key" }).fill("sk-original-key");
  await submitDialog(page);
  await expect(page.getByText("Original Title")).toBeVisible();

  // Open edit dialog
  await openEditDialog(page, "Original Title");

  // Change "Title"
  await fillTitle(page, "Updated OpenRouter");

  // Replace "API key"
  await page.getByRole("button", { name: "Replace with a new value" }).click();
  await page.getByRole("textbox", { name: "API key" }).fill("sk-updated-key");

  await submitEditDialog(page);

  // Verify the changes
  await expect(page.getByText("Updated OpenRouter")).toBeVisible();
  await expect(page.getByText("Original Title")).not.toBeVisible();
});

test("edits Ollama provider title and Base URL", async ({ page }) => {
  await setupDemo(page);
  await openAddAIDialog(page);
  await selectProvider(page, "Ollama");

  // Add an "Ollama" provider first
  await fillTitle(page, "Original Ollama");
  await page.getByRole("textbox", { name: "Base URL" }).fill("http://localhost:11434");
  await submitDialog(page);
  await expect(page.getByText("Original Ollama")).toBeVisible();

  // Open edit dialog
  await openEditDialog(page, "Original Ollama");

  // Change "Title"
  await fillTitle(page, "Updated Ollama");

  // Change "Base URL"
  await page.getByRole("textbox", { name: "Base URL" }).fill("http://localhost:11435");

  await submitEditDialog(page);

  // Verify the changes
  await expect(page.getByText("Updated Ollama")).toBeVisible();
  await expect(page.getByText("Original Ollama")).not.toBeVisible();
});

test("edits LM Studio provider title and Base URL", async ({ page }) => {
  await setupDemo(page);
  await openAddAIDialog(page);
  await selectProvider(page, "LM Studio");

  // Add "LM Studio" provider first
  await fillTitle(page, "Original LM Studio");
  await page.getByRole("textbox", { name: "Base URL" }).fill("http://localhost:1234/v1");
  await submitDialog(page);
  await expect(page.getByText("Original LM Studio")).toBeVisible();

  // Open edit dialog
  await openEditDialog(page, "Original LM Studio");

  // Change "Title"
  await fillTitle(page, "Updated LM Studio");

  // Change "Base URL"
  await page.getByRole("textbox", { name: "Base URL" }).fill("http://localhost:1235/v1");

  await submitEditDialog(page);

  // Verify the changes
  await expect(page.getByText("Updated LM Studio")).toBeVisible();
  await expect(page.getByText("Original LM Studio")).not.toBeVisible();
});
