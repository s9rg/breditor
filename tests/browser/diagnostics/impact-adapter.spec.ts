import { expect, test } from "@playwright/test";

test("production projection adapters preserve Link history without a DOM owner", async ({ page }, testInfo) => {
  await page.goto("/impact-contract.html");
  const encoded = await page.evaluate(async () => {
    const url = "/impact_adapter_probe.ts";
    const probe = await import(url) as typeof import("../harness/impact_adapter_probe");
    return probe.probeAdaptedProjectionImpacts(300);
  });
  await testInfo.attach("adapted-impact-result.json", { body: encoded, contentType: "application/json" });
  expect(JSON.parse(encoded)).toEqual({ format: "breditor/adapted-impact-probe", cycles: "300", updates: "900" });
});
