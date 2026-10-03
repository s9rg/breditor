import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

test.afterEach(async ({ page }, testInfo) => {
  if (!testInfo.config.configFile?.endsWith("playwright.adapter-reduction.config.ts")) return;
  try {
    const url = `/@fs${fileURLToPath(new URL("./link_fault_recorder.ts", import.meta.url))}`;
    const result = await page.evaluate(async url => {
      const recorder = await import(url) as typeof import("./link_fault_recorder");
      return recorder.readLinkFaults();
    }, url);
    await testInfo.attach("adapter-reduction-faults.json", { body: JSON.stringify(result), contentType: "application/json" });
    const map = await page.request.get("/adapter-reduction-map.json");
    await testInfo.attach("adapter-reduction-map.json", { body: await map.body(), contentType: "application/json" });
    expect(map.ok(), "all three adapter diagnostic modules must be installed").toBe(true);
  } catch (error) {
    if (testInfo.status === testInfo.expectedStatus) throw error;
  }
});

for (const schedule of ["sync", "task"] as const) {
  test(`boundary-only backward Undo retains exact selection without DOM (${schedule})`, async ({ page }, testInfo) => {
    await page.goto("/impact-contract/");
    const encoded = await page.evaluate(async schedule => {
      const url = "/boundary_history_adapter_probe.ts";
      const probe = await import(url) as typeof import("../harness/boundary_history_adapter_probe");
      return probe.probeBoundaryHistory(100, schedule);
    }, schedule);
    await testInfo.attach("boundary-history-result.json", { body: encoded, contentType: "application/json" });
    expect(JSON.parse(encoded)).toEqual({ format: "breditor/boundary-history-adapter", schedule,
      cycles: "100", commands: "1900", updates: "1800", selections: "1900", targetChecks: "100" });
  });
}
