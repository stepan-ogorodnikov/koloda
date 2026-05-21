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

async function deleteProfile(page: Page, profileTitle: string) {
  await page.locator("div", { hasText: profileTitle }).getByRole("button", { name: "Delete profile" }).click();
  await expect(page.getByText("Are you sure you want to delete this profile?")).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
}

test("deletes OpenRouter provider", async ({ page }) => {
  await setupDemo(page);
  await openAddAIDialog(page);

  await fillTitle(page, "OpenRouter to Delete");
  await page.getByRole("textbox", { name: "API key" }).fill("sk-test-key");
  await submitDialog(page);
  await expect(page.getByText("OpenRouter to Delete")).toBeVisible();

  await deleteProfile(page, "OpenRouter to Delete");

  await expect(page.getByText("OpenRouter to Delete")).not.toBeVisible();
  await expect(page.getByText("No profiles")).toBeVisible();
});

test("deletes Ollama provider", async ({ page }) => {
  await setupDemo(page);
  await openAddAIDialog(page);
  await selectProvider(page, "Ollama");

  await fillTitle(page, "Ollama to Delete");
  await page.getByRole("textbox", { name: "Base URL" }).fill("http://localhost:11434");
  await submitDialog(page);
  await expect(page.getByText("Ollama to Delete")).toBeVisible();

  await deleteProfile(page, "Ollama to Delete");

  await expect(page.getByText("Ollama to Delete")).not.toBeVisible();
  await expect(page.getByText("No profiles")).toBeVisible();
});

test("deletes LM Studio provider", async ({ page }) => {
  await setupDemo(page);
  await openAddAIDialog(page);
  await selectProvider(page, "LM Studio");

  await fillTitle(page, "LM Studio to Delete");
  await page.getByRole("textbox", { name: "Base URL" }).fill("http://localhost:1234/v1");
  await submitDialog(page);
  await expect(page.getByText("LM Studio to Delete")).toBeVisible();

  await deleteProfile(page, "LM Studio to Delete");

  await expect(page.getByText("LM Studio to Delete")).not.toBeVisible();
  await expect(page.getByText("No profiles")).toBeVisible();
});
