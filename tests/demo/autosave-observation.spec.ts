import { expect, test } from "@playwright/test";
import { expectAutosavedAction } from "./autosave_observation";

test("autosave observation retains a complete transition before the action returns", async ({ page }) => {
  await page.setContent('<p role="status">All changes saved.</p>');
  const status = page.getByRole("status");
  await expectAutosavedAction(status, async () => {
    await status.evaluate(async (node) => {
      node.textContent = "Unsaved changes; save scheduled.";
      await Promise.resolve();
      node.textContent = "All changes saved.";
      await Promise.resolve();
    });
    // A conventional post-action poll already sees idle; the observer must
    // nevertheless retain the preceding dirty publication.
    await expect(status).toHaveText("All changes saved.");
  });
});

test("autosave observation never accepts the unchanged initial idle status", async ({ page }) => {
  await page.setContent('<p role="status">All changes saved.</p>');
  await expect(expectAutosavedAction(page.getByRole("status"), async () => {}, 100))
    .rejects.toThrow("the action must publish dirty state and finish saving");
});
