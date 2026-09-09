import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

/**
 * UI flow helpers shared by both e2e suites (apps/web-e2e, apps/electron-e2e).
 * The suites drive the same app UI, so the flows are identical; the platform
 * differences (how defaults are seeded, bootstrap copy, launch/fixtures, AI-mock
 * transport) live in each suite's `helpers.ts` / `mock-openai-compatible.ts` facade.
 */

/**
 * Seed the UI defaults every spec expects (English, light scheme, motion off).
 * `before-load` installs an init script for a page that has not navigated yet;
 * `after-load` rewrites localStorage on an already-open page and reloads (the
 * Electron fixture hands over an already-loaded first window).
 */
export async function applyPageDefaults(page: Page, when: "before-load" | "after-load") {
  const seed = () => {
    window.localStorage.clear();
    window.localStorage.setItem("lang", "en");
    window.localStorage.setItem(
      "koloda-ui-prefs",
      JSON.stringify({ scheme: "light", motion: "off", lightTheme: "github-light", darkTheme: "github-dark" }),
    );
  };
  if (when === "before-load") {
    await page.addInitScript(seed);
  } else {
    await page.evaluate(seed);
    await page.reload({ waitUntil: "domcontentloaded" });
  }
}

/**
 * Drive the first-setup screen: confirm the bootstrap copy, click "Get started",
 * and wait for the dashboard. `bootstrapText` differs per suite ("Setting up a
 * demo" on web, "Setting up your database" on desktop).
 */
export async function bootstrapApp(page: Page, bootstrapText: string) {
  await expect(page.getByText(bootstrapText, { exact: true })).toBeVisible();

  const startButton = page.getByRole("button", { name: "Get started", exact: true });
  await expect(startButton).toBeVisible();
  await startButton.click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Learned today", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Templates", exact: true })).toBeVisible();
}

export async function openSection(page: Page, name: string) {
  const navigationLink = getNavigation(page, name);
  await expect(navigationLink).toBeVisible();
  await navigationLink.click();
}

export function getNavigation(page: Page, name: string): Locator {
  return page.getByRole("link", { name, exact: true }).first();
}

export function cardRows(page: Page): Locator {
  return page.getByRole("row").filter({ has: page.getByRole("button", { name: "Delete card" }) });
}

export async function addCard(page: Page, front: string, back: string) {
  await page.getByRole("button", { name: "Add cards" }).click();

  const addCardDialog = page.getByRole("dialog");
  await expect(addCardDialog).toBeVisible();

  await addCardDialog.getByRole("textbox", { name: "Front" }).click();
  await page.keyboard.type(front);
  await addCardDialog.getByRole("textbox", { name: "Back" }).click();
  await page.keyboard.type(back);

  await addCardDialog.getByRole("button", { name: "Create card" }).click();
  await expect(addCardDialog.getByRole("textbox", { name: "Front" })).toHaveValue("");

  await page.keyboard.press("Escape");
  await expect(addCardDialog).not.toBeVisible();
}

export async function createDeck(page: Page, title: string) {
  await openSection(page, "Decks");
  await page.getByRole("button", { name: "New deck", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title", { exact: true }).fill(title);

  const createButton = dialog.getByRole("button", { name: "Add deck", exact: true });
  await expect(createButton).toBeEnabled();
  await createButton.click();

  const redirectLink = dialog.getByRole("link", { name: "Go to the new deck", exact: true });
  await expect(redirectLink).toBeVisible();
  await redirectLink.click();

  await expect(page).toHaveURL(/\/decks\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
}

export async function createDeckWithCard(page: Page, deckTitle: string, cardFront: string, cardBack: string) {
  await createDeck(page, deckTitle);
  await page.getByRole("tab", { name: "Cards" }).click();
  await addCard(page, cardFront, cardBack);
}

export async function createDeckWithCards(
  page: Page,
  deckTitle: string,
  cards: Array<{ front: string; back: string }>,
) {
  await createDeck(page, deckTitle);
  await page.getByRole("tab", { name: "Cards" }).click();
  for (const card of cards) {
    await addCard(page, card.front, card.back);
  }
}

export async function createAlgorithm(page: Page, title: string) {
  await openSection(page, "Presets");

  await page.getByRole("button", { name: "New preset", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title", { exact: true }).fill(title);

  const createButton = dialog.getByRole("button", { name: "Create", exact: true });
  await expect(createButton).toBeEnabled();
  await createButton.click();

  const redirectLink = dialog.getByRole("link", { name: "Go to the new preset", exact: true });
  await expect(redirectLink).toBeVisible();
  await redirectLink.click();

  await expect(page).toHaveURL(
    /\/algorithms\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  );
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
}

export async function openNewPresetDialog(page: Page) {
  await openSection(page, "Presets");
  await page.getByRole("button", { name: "New preset", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("heading", { name: "New preset", exact: true })).toBeVisible();

  return dialog;
}

export async function openNewTemplateDialog(page: Page) {
  await openSection(page, "Templates");
  await page.getByRole("button", { name: "New template", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("heading", { name: "New template", exact: true })).toBeVisible();

  return dialog;
}

export async function openNewDeckDialog(page: Page) {
  await openSection(page, "Decks");
  await page.getByRole("button", { name: "New deck", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("heading", { name: "New deck", exact: true })).toBeVisible();

  return dialog;
}

export async function createTemplate(page: Page, title: string) {
  await openSection(page, "Templates");
  await page.getByRole("button", { name: "New template", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title", { exact: true }).fill(title);

  const createButton = dialog.getByRole("button", { name: "Create", exact: true });
  await expect(createButton).toBeEnabled();
  await createButton.click();

  const redirectLink = dialog.getByRole("link", { name: "Go to the new template", exact: true });
  await expect(redirectLink).toBeVisible();
  await redirectLink.click();

  await expect(page).toHaveURL(
    /\/templates\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  );
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
}

export async function createDeckWithAlgorithm(page: Page, deckTitle: string, algorithmTitle: string) {
  await openSection(page, "Decks");
  await page.getByRole("button", { name: "New deck", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title", { exact: true }).fill(deckTitle);

  await dialog.getByRole("button", { name: /Preset$/ }).click();
  const option = page.getByRole("option", { name: algorithmTitle, exact: true });
  await expect(option).toBeVisible();
  await option.click();

  const createButton = dialog.getByRole("button", { name: "Add deck", exact: true });
  await expect(createButton).toBeEnabled();
  await createButton.click();

  const redirectLink = dialog.getByRole("link", { name: "Go to the new deck", exact: true });
  await expect(redirectLink).toBeVisible();
  await redirectLink.click();

  await expect(page).toHaveURL(/\/decks\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);
  await expect(page.getByRole("heading", { name: deckTitle, exact: true })).toBeVisible();
}

export async function createDeckWithTemplate(page: Page, deckTitle: string, templateTitle: string) {
  await openSection(page, "Decks");
  await page.getByRole("button", { name: "New deck", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title", { exact: true }).fill(deckTitle);

  await dialog.getByRole("button", { name: /Template$/ }).click();
  const option = page.getByRole("option", { name: templateTitle, exact: true });
  await expect(option).toBeVisible();
  await option.click();

  const createButton = dialog.getByRole("button", { name: "Add deck", exact: true });
  await expect(createButton).toBeEnabled();
  await createButton.click();

  const redirectLink = dialog.getByRole("link", { name: "Go to the new deck", exact: true });
  await expect(redirectLink).toBeVisible();
  await redirectLink.click();

  await expect(page).toHaveURL(/\/decks\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);
  await expect(page.getByRole("heading", { name: deckTitle, exact: true })).toBeVisible();
}

export async function openLearningSettings(page: Page) {
  await openSection(page, "Settings");
  await page.getByRole("link", { name: "Learning", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Learning", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Minutes" })).toBeVisible();
}

export async function saveLearningSettings(page: Page) {
  const saveButton = page.getByRole("button", { name: "Save", exact: true });
  await expect(saveButton).toBeEnabled();
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(page.getByText("Learn ahead limit")).toBeVisible();
}

export async function setLearnAheadLimit(page: Page, hours: number, minutes: number) {
  await openLearningSettings(page);

  const hoursField = page.getByRole("textbox", { name: "Hours" });
  await hoursField.click();
  await hoursField.clear();
  await hoursField.fill(String(hours));
  await hoursField.blur();

  const minutesField = page.getByRole("textbox", { name: "Minutes" });
  await minutesField.click();
  await minutesField.clear();
  await minutesField.fill(String(minutes));
  await minutesField.blur();

  await saveLearningSettings(page);
  await expect(hoursField).toHaveValue(String(hours));
  await expect(minutesField).toHaveValue(String(minutes));
}

export async function expectDeckCardCount(page: Page, count: number) {
  const rows = cardRows(page);
  await expect(rows).toHaveCount(count, { timeout: 15_000 });
}

export async function openLessonDialog(page: Page, deckTitle: string, newCardCount: number) {
  await openSection(page, "Dashboard");

  const deckRow = page.getByRole("row").filter({ has: page.getByText(deckTitle, { exact: true }) });
  await expect(deckRow).toBeVisible({ timeout: 15_000 });

  const lessonBadge = deckRow.getByRole("button", { name: String(newCardCount), exact: true }).first();
  await expect(lessonBadge).toBeEnabled({ timeout: 15_000 });
  await lessonBadge.click();

  const lessonDialog = page.getByRole("dialog");
  await expect(lessonDialog).toBeVisible();
  await expect(lessonDialog.getByRole("heading", { name: "Study cards" })).toBeVisible();

  return lessonDialog;
}

export async function gradeLessonCards(page: Page, lessonDialog: Locator, grades: string[]) {
  const backTextbox = page.getByRole("textbox", { name: "Back" });
  const doneMessage = lessonDialog.getByText("Done");

  for (let i = 0; i < 10; i++) {
    await backTextbox.or(doneMessage).waitFor({ timeout: 15_000 });

    if (await doneMessage.isVisible().catch(() => false)) break;

    const grade = grades[i];
    if (!grade) break;

    await backTextbox.fill("test");
    await page.getByRole("button", { name: "Continue" }).click();

    const gradeButton = page.getByRole("button", { name: grade, exact: true });
    await expect(gradeButton).toBeVisible();
    await gradeButton.click();
  }

  await expect(doneMessage).toBeVisible({ timeout: 15_000 });
}

export async function startDeckLesson(page: Page, deckTitle: string, newCardCount: number) {
  const lessonDialog = await openLessonDialog(page, deckTitle, newCardCount);
  await lessonDialog.getByRole("button", { name: "Start" }).click();

  return lessonDialog;
}

export async function openHotkeysSettings(page: Page) {
  await openSection(page, "Settings");
  await page.getByRole("link", { name: "Hotkeys", exact: true }).click();
  const kbds = page.locator("form kbd");
  await expect(kbds.first()).toBeVisible();
}

export function getHotkeyByLabel(page: Page, label: string) {
  const kbd = page.locator(`xpath=//div[normalize-space()='${label}']/following-sibling::div//kbd`);
  const container = kbd.locator("xpath=..");
  const editButton = kbd
    .locator("xpath=ancestor::div[contains(@class, 'flex-row') and contains(@class, 'items-center')]")
    .getByRole("button", { name: "Change hotkey" });

  return { kbd, container, editButton };
}

export async function editHotkey(page: Page, label: string, newKey: string) {
  const { editButton } = getHotkeyByLabel(page, label);
  await editButton.first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await page.keyboard.press(newKey);

  await dialog.getByRole("button", { name: "Accept this hotkey" }).click();
  await expect(dialog).not.toBeVisible();
}

export async function dragTo(page: Page, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();

  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error("Could not get bounding box for drag source or target");

  const sourceX = sourceBox.x + sourceBox.width / 2;
  const sourceY = sourceBox.y + sourceBox.height / 2;
  const targetX = targetBox.x + targetBox.width / 2;
  const targetY = targetBox.y + targetBox.height / 2;

  // WHY: dnd-kit binds drag activation to the handle element, so the press must
  // land on it. Right after a section mounts, the renderer can still hit-test
  // the handle's center to the document root, and a press there starts nothing.
  // hover() retries until the handle is the hit target at the point.
  await source.hover();
  await page.mouse.down();
  await page.mouse.move(sourceX, sourceY + 20, { steps: 3 });
  await page.waitForTimeout(150);
  await page.mouse.move(targetX, targetY, { steps: 10 });
  await page.waitForTimeout(100);
  await page.mouse.up();
}

export async function reorderWithKeyboard(handle: Locator, direction: "up" | "down", steps: number) {
  await handle.scrollIntoViewIfNeeded();
  await handle.focus();
  await handle.press("Enter");
  for (let i = 0; i < steps; i++) {
    await handle.press(direction === "up" ? "ArrowUp" : "ArrowDown");
  }
  await handle.press("Enter");
}

/**
 * Sliders (e.g. Retention) are react-aria components backed by a visually
 * hidden <input type="range">. Pointer clicks on them are intercepted by the
 * track container, so values are changed by focusing the input and stepping
 * with arrow keys (native range inputs step by `step`, which is 1 here).
 */
export async function setSliderValue(page: Page, name: string, target: number) {
  const thumb = page.getByRole("slider", { name });
  await expect(thumb).toBeAttached();
  await thumb.focus();
  const current = Number(await thumb.inputValue());
  if (current === target) return;
  const key = target > current ? "ArrowRight" : "ArrowLeft";
  for (let i = 0; i < Math.abs(target - current); i++) {
    await page.keyboard.press(key);
  }
  await expect(thumb).toHaveValue(String(target));
}

export async function getSliderValue(page: Page, name: string) {
  const thumb = page.getByRole("slider", { name });
  await expect(thumb).toBeAttached();
  return Number(await thumb.inputValue());
}

export async function openAddAIDialog(page: Page) {
  await openSection(page, "Settings");
  await page.getByRole("link", { name: "AI", exact: true }).click();
  await expect(page.getByText("No profiles")).toBeVisible();

  await page.getByRole("button", { name: "Add profile" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add AI Profile" })).toBeVisible();
}

export async function selectAIProvider(page: Page, provider: string, currentProvider = "OpenRouter") {
  await page.getByRole("button", { name: currentProvider }).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.getByRole("option", { name: provider, exact: true }).click();
}

export async function fillAIProfileTitle(page: Page, title: string) {
  await page.getByRole("textbox", { name: "Title" }).fill(title);
}

export async function submitAddAIDialog(page: Page) {
  await page.getByRole("button", { name: "Add", exact: true }).click();
}

export async function openEditAIDialog(page: Page, profileTitle: string) {
  await page.locator("div", { hasText: profileTitle }).getByRole("button", { name: "Edit profile" }).click();
  await expect(page.getByRole("dialog", { name: "Edit AI profile" })).toBeVisible();
}

export async function submitEditAIDialog(page: Page) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
}

export async function deleteAIProfile(page: Page, profileTitle: string) {
  await page.locator("div", { hasText: profileTitle }).getByRole("button", { name: "Delete profile" }).click();
  await expect(page.getByText("Are you sure you want to delete this profile?")).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
}

type AddLmStudioProfileOptions = { title?: string; baseUrl: string };

export async function addLmStudioProfile(page: Page, options: AddLmStudioProfileOptions) {
  const title = options.title ?? "E2E LM Studio";
  await openAddAIDialog(page);
  await selectAIProvider(page, "LM Studio");
  await fillAIProfileTitle(page, title);
  const baseUrlInput = page.getByRole("textbox", { name: "Base URL" });
  await baseUrlInput.clear();
  await baseUrlInput.fill(options.baseUrl);
  await submitAddAIDialog(page);
  await expect(page.getByText(title)).toBeVisible();
}

/**
 * Open Assistant. Visiting `/ai` with no conversationId stays on that route
 * until the user types a non-whitespace prompt (or a stored active id is
 * restored). Do not require `conversationId` in the URL before the user types.
 */
export function getConversationIdFromUrl(page: Page): string {
  const match = page.url().match(/conversationId=([^&]+)/);
  if (!match?.[1]) throw new Error(`Could not parse conversation id from ${page.url()}`);
  return decodeURIComponent(match[1]);
}

export async function waitForConversationIdFromUrl(page: Page): Promise<string> {
  await expect(page).toHaveURL(/conversationId=/);
  return getConversationIdFromUrl(page);
}

export async function openAssistantWithConversation(page: Page, conversationId: string) {
  // WHY: Resolve against the current page URL rather than a relative path —
  // relative gotos need a `baseURL` (web sets one, the Electron context does not).
  // Every spec calls this after the app has loaded, so the current origin is
  // always the app origin in both suites.
  const origin = new URL(page.url()).origin;
  await page.goto(`${origin}/ai?conversationId=${encodeURIComponent(conversationId)}`);
  await expect(page).toHaveURL(new RegExp(`/ai\\?conversationId=${encodeURIComponent(conversationId)}`));
  await expect(page.getByRole("textbox", { name: "Prompt input" })).toBeVisible();
}

export async function openAssistantWithDeck(page: Page) {
  // WHY: See openAssistantWithConversation — resolve against the current origin.
  const origin = new URL(page.url()).origin;
  await page.goto(`${origin}/ai`);
  await expect(page.getByRole("textbox", { name: "Prompt input" })).toBeVisible();
}

/**
 * Open a new conversation through the assistant's "New conversation" button.
 * Lands on the AI route with no conversationId.
 */
export async function startNewConversation(page: Page): Promise<void> {
  const newConversationButton = page.getByRole("button", { name: "New conversation" });
  await expect(newConversationButton).toBeEnabled();
  await newConversationButton.click();
  await expect(page).not.toHaveURL(/conversationId=/);
  await expect(page.getByRole("textbox", { name: "Prompt input" })).toBeVisible();
}

/** Simulate graceful app shutdown (`pagehide` with `persisted: false`). */
export async function dispatchGracefulShutdown(page: Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
  });
}

export async function createDeckAndOpenAssistant(page: Page, deckTitle = "E2E Assistant Deck") {
  await createDeck(page, deckTitle);
  const match = page
    .url()
    .match(/\/decks\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);
  if (!match?.[1]) throw new Error(`Could not parse deck id from ${page.url()}`);
  const deckId = match[1];
  await openAssistantWithDeck(page);
  return deckId;
}

export async function waitForAssistantReady(page: Page) {
  const sendButton = page.getByRole("button", { name: "Send" });
  const prompt = page.getByRole("textbox", { name: "Prompt input" });

  await prompt.fill("ping");

  // WHY: Auto-resolve may already have a model; if Send stays disabled, pick one explicitly.
  try {
    await expect(sendButton).toBeEnabled({ timeout: 5_000 });
  } catch {
    await page.getByRole("button", { name: "Select a model" }).click();
    await page.getByRole("option", { name: "e2e-test-model" }).click();
    await expect(sendButton).toBeEnabled({ timeout: 15_000 });
  }

  await prompt.clear();
}

export async function sendAssistantMessage(page: Page, text: string) {
  const prompt = page.getByRole("textbox", { name: "Prompt input" });
  await prompt.fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

export function conversationLog(page: Page) {
  // AIChatMessages uses role="log" (aria-label "Conversation log").
  return page.getByRole("log", { name: "Conversation log" });
}
