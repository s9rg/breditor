import { expect, test } from "@playwright/test";

test("raw fresh-profile descriptors retain required, zero, and absent numeric fields", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const url = "/profile_descriptor_raw_probe.ts";
    const probe = await import(url) as typeof import("./harness/profile_descriptor_raw_probe");
    return probe.probeRawProfileDescriptors(3_000);
  });
  expect(result).toEqual({ iterations: 3_000, reads: 9_000 });
});
