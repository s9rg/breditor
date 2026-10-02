import { expect, test } from "@playwright/test";

test("export contract resolver accepts unchanged JavaScript metadata", async ({ page }) => {
  const wasmRequests: string[] = [];
  page.on("request", request => { if (/\.wasm(?:\?|$)/.test(request.url())) wasmRequests.push(request.url()); });
  await page.goto("/selection-endpoint.html");
  const result = await page.evaluate(async () => {
    const url = "/durable_contract_probe.ts";
    const module = await import(url) as typeof import("../harness/durable_contract_probe");
    return module.probeDurableContracts(10_000);
  });
  expect(result).toEqual({ iterations: 10_000, reads: 30_000 });
  expect(wasmRequests).toEqual([]);
});
