import { expect, test } from "@playwright/test";

for (const schedule of ["sync", "task"] as const) {
  test(`production adapters preserve cut/caret/type history without DOM (${schedule})`, async ({ page }, testInfo) => {
    await page.goto("/impact-contract/");
    const encoded = await page.evaluate(async schedule => {
      const url = "/history_adapter_probe.ts";
      const probe = await import(url) as typeof import("../harness/history_adapter_probe");
      return probe.probeAdaptedHistory(300, schedule);
    }, schedule);
    await testInfo.attach("adapted-history-result.json", { body: encoded, contentType: "application/json" });
    expect(JSON.parse(encoded)).toEqual({ format: "breditor/adapted-history-probe", schedule,
      cycles: "300", updates: "4200", selections: "4200" });
  });
}
