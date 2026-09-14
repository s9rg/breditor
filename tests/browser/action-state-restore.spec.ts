import { expect, test } from "@playwright/test";

test("repeated checkpoint restores retain coherent typed action states", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const url = "/action_state_restore_probe.ts";
    const probe = await import(url) as typeof import("./harness/action_state_restore_probe");
    return probe.probeRestoredActionStates(1_000);
  });
  expect(result).toEqual({ iterations: 1_000, reads: 3_000 });
});
