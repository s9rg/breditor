import { expect, test } from "@playwright/test";

test("JavaScript-only production validator preserves required boolean properties", async ({ page }, testInfo) => {
  const wasmRequests: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname.endsWith(".wasm")) wasmRequests.push(request.url()); });
  await page.goto("/impact-contract/");
  const encoded = await page.evaluate(async () => {
    const url = "/projection_validator_probe.ts";
    const probe = await import(url) as typeof import("../harness/projection_validator_probe");
    return probe.probeProjectionValidator(10_000);
  });
  await testInfo.attach("projection-validator-result.json", { body: encoded, contentType: "application/json" });
  expect(wasmRequests).toEqual([]);
  expect(JSON.parse(encoded)).toEqual({ format: "breditor/js-projection-validator", cycles: "10000", checks: "40000" });
});
