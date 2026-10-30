import { expect } from "@playwright/test";
import type { ElectronApplication, Locator, Page } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createDeckWithTemplate, createMarkdownFrontTemplate, startDeckLesson } from "@koloda/e2e";
import { test as base } from "./fixtures";
import { setupApp, setupPageDefaults } from "./helpers";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const FORMAT_ERROR = "Only PNG, JPEG, GIF, WebP, and AVIF images are supported";
const IMAGE_REF = /^!\[cat\]\(attachment:[0-9a-f]{64}\)$/;

type ImageServerFixtures = { imageServerUrl: string };

// Serves the PNG at `/cat.png`, a redirect to it at `/moved`, and 404 for anything else.
const test = base.extend<ImageServerFixtures>({
  // WHY: Playwright's fixture signature is `(parentFixtures, provide) => …`, so root fixtures must destructure an empty object.
  // oxlint-disable-next-line no-empty-pattern
  imageServerUrl: async ({}, provide) => {
    const server = createServer((request, response) => {
      if (request.url === "/cat.png") {
        response.writeHead(200, { "content-type": "image/png" }).end(ONE_PIXEL_PNG);
      } else if (request.url === "/moved") {
        response.writeHead(302, { location: "/cat.png" }).end();
      } else {
        response.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    await provide(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await new Promise((resolve) => server.close(resolve));
  },
});

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

async function openAddCardDialog(page: Page, deckTitle: string) {
  await setupApp(page);
  await createMarkdownFrontTemplate(page, "E2E Image Template");
  await createDeckWithTemplate(page, deckTitle, "E2E Image Template");
  await page.getByRole("tab", { name: "Cards" }).click();
  await page.getByRole("button", { name: "Add cards" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

// WHY: the embed action shows only after a real paste, so the link goes through the system clipboard.
async function pasteLink(electronApp: ElectronApplication, page: Page, field: Locator, url: string) {
  await electronApp.evaluate(({ clipboard }, text) => clipboard.writeText(text), url);
  await field.click();
  await page.keyboard.press("Control+v");
  await expect(field).toHaveValue(url);
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

test("embeds an image from a pasted link, through a redirect, and keeps a link that fails as text", async ({
  electronApp,
  page,
  imageServerUrl,
}) => {
  const dialog = await openAddCardDialog(page, "E2E Link Deck");
  const front = dialog.getByRole("textbox", { name: "Front" });
  const embedButton = dialog.getByRole("button", { name: "Embed image" });

  // A direct link
  await pasteLink(electronApp, page, front, `${imageServerUrl}/cat.png`);
  await embedButton.click();
  await expect(front).toHaveValue(IMAGE_REF);
  await expect(embedButton).toHaveCount(0);

  // A link that redirects to the image: each hop goes through main's own redirect check
  await front.fill("");
  await pasteLink(electronApp, page, front, `${imageServerUrl}/moved`);
  await embedButton.click();
  await expect(front).toHaveValue(/^!\[moved\]\(attachment:[0-9a-f]{64}\)$/);

  // A link that cannot be downloaded stays as text
  await front.fill("");
  await pasteLink(electronApp, page, front, `${imageServerUrl}/missing.png`);
  await embedButton.click();
  await expect(dialog.getByText("Couldn't download the image")).toBeVisible();
  await expect(front).toHaveValue(`${imageServerUrl}/missing.png`);
});
