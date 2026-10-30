import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createDeckWithTemplate, createMarkdownFrontTemplate, startDeckLesson } from "@koloda/e2e";
import { setupWeb, setupPageDefaults } from "./helpers";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const FORMAT_ERROR = "Only PNG, JPEG, GIF, WebP, and AVIF images are supported";
const IMAGE_REF = /^!\[cat\]\(attachment:[0-9a-f]{64}\)$/;

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

async function openAddCardDialog(page: Page, deckTitle: string) {
  await setupWeb(page);
  await createMarkdownFrontTemplate(page, "E2E Image Template");
  await createDeckWithTemplate(page, deckTitle, "E2E Image Template");
  await page.getByRole("tab", { name: "Cards" }).click();
  await page.getByRole("button", { name: "Add cards" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test("inserts a picked image, rejects a non-image, and shows the image in preview and a lesson", async ({ page }) => {
  const deckTitle = "E2E Image Deck";
  const dialog = await openAddCardDialog(page, deckTitle);
  const front = dialog.getByRole("textbox", { name: "Front" });

  // WHY: the "Insert image" button opens a native file picker; its hidden file input takes the files instead.
  await dialog.locator('input[type="file"]').setInputFiles([
    { name: "cat.png", mimeType: "image/png", buffer: ONE_PIXEL_PNG },
    { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("plain text") },
  ]);
  await expect(front).toHaveValue(IMAGE_REF);
  await expect(dialog.getByText(FORMAT_ERROR)).toBeVisible();

  // The next card starts clean: no reference and no error
  await dialog.getByRole("textbox", { name: "Back" }).fill("Cat back");
  await dialog.getByRole("button", { name: "Create card" }).click();
  await expect(front).toHaveValue("");
  await expect(dialog.getByText(FORMAT_ERROR)).not.toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  // Preview
  await page.getByRole("button", { name: "Preview Card" }).click();
  const previewDialog = page.getByRole("dialog");
  await expect(previewDialog.getByRole("img", { name: "cat" })).toHaveAttribute("src", /^blob:/);
  await page.keyboard.press("Escape");
  await expect(previewDialog).not.toBeVisible();

  // Lesson
  const lessonDialog = await startDeckLesson(page, deckTitle, 1);
  await expect(lessonDialog.getByRole("img", { name: "cat" })).toHaveAttribute("src", /^blob:/);
});

test("keeps a pasted link as text, with no embed action", async ({ page }) => {
  const url = "https://example.test/cat.png";
  const dialog = await openAddCardDialog(page, "E2E Link Deck");
  const front = dialog.getByRole("textbox", { name: "Front" });

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate((text) => navigator.clipboard.writeText(text), url);
  await front.click();
  await page.keyboard.press("Control+v");

  await expect(front).toHaveValue(url);
  await expect(dialog.getByRole("button", { name: "Embed image" })).toHaveCount(0);
});
