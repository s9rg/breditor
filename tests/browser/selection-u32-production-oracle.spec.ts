import { expect, test } from "@playwright/test";

test("built selection adapter admits exactly raw u32 offsets", async ({ page }) => {
  const wasmRequests: string[] = [];
  page.on("request", request => {
    if (/\.wasm(?:\?|$)/u.test(request.url())) wasmRequests.push(request.url());
  });
  await page.goto("/selection-endpoint.html");
  const result = await page.evaluate(async () => {
    const url = "/selection_u32_production_oracle.ts";
    const probe = await import(url) as typeof import("./harness/selection_u32_production_oracle");
    return probe.probeProductionSelectionU32(200);
  });
  expect(result).toEqual({ cycles: 200, fixtures: 30, checks: 12_000 });
  expect(wasmRequests).toEqual([]);
});
