import { expect, test } from "@playwright/test";

test.afterEach(async ({ page }, testInfo) => {
  if (!testInfo.config.configFile?.endsWith("playwright.selection-input-diagnostic.config.ts")) return;
  try {
    const response = await page.request.get("/selection-input-diagnostic-map.json");
    const manifest = await response.json() as { moduleUrl: string; formatCount: string; rustFormatCount: string };
    await testInfo.attach("selection-input-diagnostic-map.json", { body: await response.body(), contentType: "application/json" });
    expect(response.ok()).toBe(true);
    const records = await page.evaluate(async manifest => {
      const module = await import(manifest.moduleUrl) as {
        __breditorReadFormatCounts(): unknown; debugLastProjectionFormatCount(): string;
      };
      return { js: manifest.formatCount === "inline" ? module.__breditorReadFormatCounts() : null,
        rust: manifest.rustFormatCount === "on" ? JSON.parse(module.debugLastProjectionFormatCount()) : null };
    }, manifest);
    await testInfo.attach("projection-count-returns.json", { body: JSON.stringify(records), contentType: "application/json" });
  } catch (error) {
    if (testInfo.status === testInfo.expectedStatus) throw error;
  }
});

for (const lifetime of ["retained", "renewed"] as const) {
  for (const comparison of ["strict", "same-value", "decimal"] as const) {
    test(`fixed projection counts without history (${lifetime}, ${comparison})`, async ({ page }, testInfo) => {
      const scripts: string[] = [];
      page.on("request", request => { if (request.resourceType() === "script") scripts.push(request.url()); });
      await page.goto("/impact-contract/");
      const result = await page.evaluate(async ({ lifetime, comparison }) => {
        const url = "/projection_count_probe.ts";
        const probe = await import(url) as typeof import("../harness/projection_count_probe");
        return probe.probeProjectionCounts(10_000, lifetime, comparison);
      }, { lifetime, comparison });
      await testInfo.attach("projection-count-result.json", { body: JSON.stringify(result), contentType: "application/json" });
      expect(result).toEqual({ lifetime, comparison, rounds: 10_000, counts: 110_000, snapshots: lifetime === "retained" ? 1 : 10_000 });
      expect(scripts.filter(url => /breditor-browser|reference-highlight/.test(url)), "no browser adapter or reference profile modules").toEqual([]);
    });
  }
}
