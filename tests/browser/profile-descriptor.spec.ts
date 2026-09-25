import { expect, test } from "@playwright/test";

test("repeated profile descriptor reads retain properties and absent sentinels", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const url = "/profile_descriptor_probe.ts";
    const probe = await import(url) as typeof import("./harness/profile_descriptor_probe");
    return probe.probeProfileDescriptors(1_000);
  });
  expect(result).toEqual({ iterations: 1_000 });
});
