import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

// Match the native Safari click/reload workflow, not page.evaluate(probe()).
// Each batch retains the ordinary 30-second test budget. The ten tests share
// one page so its visible runner drives the same bounded reload sequence.
test.describe.serial("visible native number runner", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    const build = new URL("../../../target/property-transport/js-dataview-bare/", import.meta.url);
    const entry = readFileSync(new URL("index.html", build), "utf8").match(/src="(\/assets\/index-[A-Za-z0-9_-]+\.js)"/)?.[1];
    if (!entry) throw new Error("Expected DataView fixture entry missing");
    const hash = createHash("sha256").update(readFileSync(new URL(`.${entry}`, build))).digest("hex");
    page = await browser.newPage();
    await page.goto("http://127.0.0.1:4202/");
    await expect(page.locator("#report")).toContainText(hash);
    await expect(page.locator("#report")).toContainText('"variant": "js-dataview-bare"');
    await page.getByRole("button", { name: "Start 10 batches", exact: true }).click();
  });
  test.afterAll(async () => { await page?.close(); });
  for (let batch = 1; batch <= 10; batch++) {
    test(`batch ${batch} completes without a rejection`, async ({}, testInfo) => {
      await page.waitForFunction(expected => {
        const text = document.querySelector("#report")?.textContent;
        if (!text) return false;
        const report = JSON.parse(text);
        return report.passed >= expected || report.outcome === "failed" || report.outcome === "stopped";
      }, batch, { timeout: 25_000 }); // Batch computation, within the unchanged 30-second test budget.
      const report = JSON.parse(await page.locator("#report").innerText());
      if (report.outcome === "failed") await testInfo.attach("native-number-report.json", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
      expect(report.outcome).not.toBe("failed");
      expect(report.outcome).not.toBe("stopped");
      expect(report.passed).toBeGreaterThanOrEqual(batch);
      if (batch === 10) expect(report).toMatchObject({ active: false, outcome: "passed", passed: 10 });
    });
  }
});
