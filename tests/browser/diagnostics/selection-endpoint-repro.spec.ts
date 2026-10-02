import { expect, test } from "@playwright/test";

test("JavaScript-only endpoint consumer preserves binary64 coordinates", async ({ page }) => {
  const wasmRequests: string[] = [];
  page.on("request", request => { if (/\.wasm(?:\?|$)/.test(request.url())) wasmRequests.push(request.url()); });
  await page.goto("/selection-endpoint.html");
  const result = await page.evaluate(async () => {
    const url = "/selection_endpoint_probe.ts";
    const module = await import(url) as typeof import("../harness/selection_endpoint_probe");
    return module.probeJavaScriptSelectionEndpoints(10_000);
  });
  expect(result).toEqual({ iterations: 10_000, numericReads: 40_000, frees: 10_000 });
  expect(wasmRequests).toEqual([]);
});

test("real restored selection consumer preserves coordinates without DOM editing", async ({ page }) => {
  await page.goto("/selection-endpoint.html");
  const result = await page.evaluate(async () => {
    const url = "/selection_restore_probe.ts";
    const module = await import(url) as typeof import("../harness/selection_restore_probe");
    return module.probeRestoredSelections(10_000);
  });
  expect(result).toEqual({ iterations: 10_000, reads: 30_000 });
});
