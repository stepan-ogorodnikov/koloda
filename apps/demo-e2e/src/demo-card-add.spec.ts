import { expect, test } from "@playwright/test";
import { createDeck, openSection, setupDemo, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("rejects empty required field", async ({ page }) => {
  await setupDemo(page);
  await openSection(page, "Decks");

  await createDeck(page, "Test Deck");
  await page.getByRole("tab", { name: "Cards" }).click();

  await page.getByRole("button", { name: "Add cards" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Add card", exact: true })).toBeVisible();

  const frontField = dialog.getByRole("textbox", { name: "Front" });
  await frontField.click();
  await frontField.fill("test");
  await frontField.clear();
  await frontField.blur();

  const submitButton = dialog.getByRole("button", { name: "Create card" });
  await expect(submitButton).toBeEnabled();
  await submitButton.click();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("This field can't be empty").first()).toBeVisible();
});

test("creates a card with all fields filled", async ({ page }) => {
  await setupDemo(page);
  await openSection(page, "Decks");

  await createDeck(page, "Test Deck");
  await page.getByRole("tab", { name: "Cards" }).click();

  await page.getByRole("button", { name: "Add cards" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const frontField = dialog.getByRole("textbox", { name: "Front" });
  const backField = dialog.getByRole("textbox", { name: "Back" });

  await frontField.click();
  await frontField.fill("Test Front");
  await backField.click();
  await backField.fill("Test Back");

  const submitButton = dialog.getByRole("button", { name: "Create card" });
  await expect(submitButton).toBeEnabled();
  await submitButton.click();

  await expect(frontField).toHaveValue("");
  await expect(backField).toHaveValue("");

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  await expect(page.getByRole("row").filter({ has: page.getByText("Test Front", { exact: true }) })).toBeVisible();
  await expect(page.getByRole("row").filter({ has: page.getByText("Test Back", { exact: true }) })).toBeVisible();
});

test("resets form after successful submission", async ({ page }) => {
  await setupDemo(page);
  await openSection(page, "Decks");

  await createDeck(page, "Reset Deck");
  await page.getByRole("tab", { name: "Cards" }).click();

  await page.getByRole("button", { name: "Add cards" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const frontField = dialog.getByRole("textbox", { name: "Front" });
  const backField = dialog.getByRole("textbox", { name: "Back" });

  await frontField.click();
  await frontField.fill("First Front");
  await backField.click();
  await backField.fill("First Back");

  const submitButton = dialog.getByRole("button", { name: "Create card" });
  await submitButton.click();

  await expect(frontField).toHaveValue("");
  await expect(backField).toHaveValue("");

  await expect(submitButton).toBeDisabled();
});
