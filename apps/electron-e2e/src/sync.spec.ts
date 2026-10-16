import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { addCard, cardRows, createDeckWithCard, openSection } from "@koloda/e2e";
import { launchApp, test as base } from "./fixtures";
import { setupApp, setupPageDefaults } from "./helpers";
import { startSyncServer } from "./sync-server";
import type { SyncServer } from "./sync-server";

type SyncFixtures = {
  syncServer: SyncServer;
  secondDevice: Page;
};

const test = base.extend<SyncFixtures>({
  // WHY: Playwright's fixture signature is `(parentFixtures, provide) => …`, so root fixtures must destructure an empty object.
  // oxlint-disable-next-line no-empty-pattern
  syncServer: async ({}, provide) => {
    const server = await startSyncServer();
    await provide(server);
    await server.stop();
  },

  // oxlint-disable-next-line no-empty-pattern
  secondDevice: async ({}, provide) => {
    const userDataDir = await mkdtemp(resolve(tmpdir(), "koloda-e2e-"));
    const app = await launchApp(userDataDir);
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await provide(page);
    await app.close();
    await rm(userDataDir, { recursive: true, force: true });
  },
});

const PAIRING_CODE = /^[0-9A-Z]{5}(?:-[0-9A-Z]{1,5})+$/;

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

async function openSyncSettings(page: Page) {
  await openSection(page, "Settings");
  await page.getByRole("link", { name: "Sync", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sync", exact: true })).toBeVisible();
}

// WHY: the name field starts as the computer's name once it loads; typing before that could be overwritten.
async function fillDeviceName(page: Page, name: string) {
  const field = page.getByRole("textbox", { name: "This device's name" });
  await expect(field).not.toHaveValue("");
  await field.fill(name);
}

async function openDeckCards(page: Page, deckTitle: string) {
  await openSection(page, "Decks");
  await page.getByRole("link", { name: deckTitle, exact: true }).click();
  await page.getByRole("tab", { name: "Cards" }).click();
}

test("a device joins a space with a pairing code and gets its cards", async ({ page, syncServer, secondDevice }) => {
  const deckTitle = "E2E Synced Deck";

  // Device A: start fresh with a deck and a card
  await setupApp(page);
  await createDeckWithCard(page, deckTitle, "First front", "First back");

  // Device A: create a space
  await openSyncSettings(page);
  await page.getByRole("button", { name: "Create a space", exact: true }).click();
  const createDialog = page.getByRole("dialog");
  await createDialog.getByRole("textbox", { name: "Server address" }).fill(syncServer.url);
  await createDialog.getByLabel("Setup token", { exact: true }).fill(syncServer.setupToken);
  await createDialog.getByRole("textbox", { name: "Space name" }).fill("E2E Space");
  await fillDeviceName(page, "Device A");
  await createDialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(createDialog).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Up to date", exact: true })).toBeVisible();

  // Device A: invite a device
  await page.getByRole("button", { name: "Invite a device", exact: true }).click();
  const inviteDialog = page.getByRole("dialog");
  const code = await inviteDialog.getByText(PAIRING_CODE).textContent();
  expect(code).toMatch(PAIRING_CODE);
  await page.keyboard.press("Escape");
  await expect(inviteDialog).not.toBeVisible();

  // Device B: join from the first-run screen
  await setupPageDefaults(secondDevice);
  await secondDevice.getByRole("button", { name: "Join a space", exact: true }).click();
  await secondDevice.getByRole("textbox", { name: "Server address" }).fill(syncServer.url);
  await secondDevice.getByRole("textbox", { name: "Pairing code" }).fill(code ?? "");
  await fillDeviceName(secondDevice, "Device B");
  await secondDevice.getByRole("button", { name: "Continue", exact: true }).click();

  // Device B: the preview shows what the code joins
  await expect(secondDevice.getByText("Space “E2E Space”", { exact: true })).toBeVisible();
  await expect(secondDevice.getByText("1 deck", { exact: true })).toBeVisible();
  await expect(secondDevice.getByText("1 card", { exact: true })).toBeVisible();
  await secondDevice.getByRole("button", { name: "Join", exact: true }).click();

  // Device B: the app opens once the space has downloaded
  await expect(secondDevice).toHaveURL(/\/dashboard$/);

  // Device B: both devices are listed, and this one is marked
  await openSyncSettings(secondDevice);
  const thisDevice = secondDevice.getByText("Device B", { exact: true }).locator("..");
  await expect(thisDevice).toContainText("This device");
  const otherDevice = secondDevice.getByText("Device A", { exact: true }).locator("..");
  await expect(otherDevice.getByRole("button", { name: "Remove", exact: true })).toBeVisible();

  // Device B: the card made before the join is there
  await openDeckCards(secondDevice, deckTitle);
  await expect(cardRows(secondDevice).filter({ hasText: "First front" })).toBeVisible();

  // Device A: add a card after the join
  await openDeckCards(page, deckTitle);
  await addCard(page, "Second front", "Second back");

  // Device B: the new card shows without a reload
  await expect(cardRows(secondDevice).filter({ hasText: "Second front" })).toBeVisible();
  await expect(cardRows(secondDevice)).toHaveCount(2);
});
