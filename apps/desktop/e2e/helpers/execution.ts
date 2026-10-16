import type { Page } from "@playwright/test";
export async function openExecutionOptions(page: Page): Promise<void> {
  const summary = page
    .locator("summary")
    .filter({ hasText: "Execution options" });
  await summary.waitFor({ state: "visible" });
  if (!(await summary.evaluate((element) => element.closest("details")?.open)))
    await summary.click();
}
