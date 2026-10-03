import { expect, test } from "@playwright/test";

test("raw selection tokens reject invalid inputs without large copies", async ({ page }, testInfo) => {
  await page.goto("/impact-contract/");
  const result = await page.evaluate(async () => {
    const url = "/selection_token_probe.ts";
    const probe = await import(url) as typeof import("../harness/selection_token_probe");
    return probe.probeSelectionTokenRejections();
  });
  await testInfo.attach("selection-token-rejections.json", { body: JSON.stringify(result), contentType: "application/json" });
  expect(result.rejections).toBe(80);
  expect(result.conversionCalls).toBe(0);
  // Allow one allocator page for small error/checkpoint results, never the
  // 16 MiB copy that the unbounded candidate performed before rejecting.
  expect(result.memoryGrowth).toBeLessThanOrEqual(65_536);
});

for (const schedule of ["sync", "task"] as const) {
  test(`raw selection tokens without projection or history (${schedule})`, async ({ page }, testInfo) => {
    const scripts: string[] = [];
    const reports: string[] = [];
    page.on("request", request => { if (request.resourceType() === "script") scripts.push(request.url()); });
    page.on("console", message => {
      const text = message.text();
      if (text.startsWith("BREDITOR_RUST_SELECTION=") && reports.length < 8) reports.push(text);
    });
    await page.goto("/impact-contract/");
    try {
      const result = await page.evaluate(async schedule => {
        const url = "/selection_token_probe.ts";
        const probe = await import(url) as typeof import("../harness/selection_token_probe");
        return probe.probeSelectionTokens(2_000, schedule);
      }, schedule);
      await testInfo.attach("selection-token-result.json", { body: JSON.stringify(result), contentType: "application/json" });
      expect(result).toEqual({ rounds: 2_000, schedule, commands: 8_000 });
      expect(scripts.filter(url => /breditor-browser|reference-highlight/.test(url)), "no browser adapters or reference profile modules").toEqual([]);
    } finally {
      await testInfo.attach("rust-selection-rejections.json", { body: JSON.stringify(reports), contentType: "application/json" });
      if (testInfo.config.configFile?.endsWith("playwright.selection-input-diagnostic.config.ts")) {
        const response = await page.request.get("/selection-input-diagnostic-map.json");
        await testInfo.attach("selection-input-diagnostic-map.json", { body: await response.body(), contentType: "application/json" });
        expect(response.ok()).toBe(true);
      }
    }
  });
}
