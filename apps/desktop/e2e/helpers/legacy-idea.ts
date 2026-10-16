import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { createIdea } from "voidra";
/** Prepare historical idea data through its public API, then exercise its retained editor. */
export async function openLegacyIdeaEditor(
  page: Page,
  root: string,
): Promise<void> {
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  const title = `Existing idea ${randomUUID().slice(0, 8)}`;
  await createIdea(root, {
    title,
    description: "Existing project idea.",
    by: "Fixture",
  });
  await page.getByRole("button", { name: title, exact: true }).click();
  await page
    .getByRole("button", { name: `Edit idea: ${title}`, exact: true })
    .click();
}
