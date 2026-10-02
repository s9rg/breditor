import { expect, test } from "@playwright/test";

test("raw Link update metadata survives Apply/Undo/Redo and child transfer", async ({ page }, testInfo) => {
  await page.goto("/impact-contract.html");
  const encoded = await page.evaluate(async () => {
    const url = "/impact_contract_probe.ts";
    const probe = await import(url) as typeof import("../harness/impact_contract_probe");
    return probe.probeRawProjectionImpacts(300);
  });
  await testInfo.attach("raw-impact-result.json", { body: encoded, contentType: "application/json" });
  expect(JSON.parse(encoded)).toEqual({ format: "breditor/raw-impact-probe", cycles: "300", updates: "900" });
});
