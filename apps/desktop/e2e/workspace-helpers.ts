import { expect, type Page } from "@playwright/test";

/** The human inbox is a persistent toggleable pane, with its own retained detail. */
export async function showWaiting(page: Page): Promise<void> {
  const toggle = page.getByRole("button", {
    name: "Waiting for you",
    exact: true,
  });
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const back = page
    .locator("#waiting-panel")
    .getByRole("button", { name: "Back to Waiting for you", exact: true });
  if (await back.isVisible()) await back.click();
}
