import { expect, test } from "@playwright/test";

for (const transport of ["literal", "decimal"] as const) {
  test(`JavaScript-only selection predicates retain numeric admission (${transport})`, async ({ page }, testInfo) => {
    const wasmRequests: string[] = [];
    page.on("request", request => { if (new URL(request.url()).pathname.endsWith(".wasm")) wasmRequests.push(request.url()); });
    await page.goto("/impact-contract/");
    const encoded = await page.evaluate(async transport => {
      const url = "/selection_validator_probe.ts";
      const probe = await import(url) as typeof import("../harness/selection_validator_probe");
      return probe.probeSelectionValidator(10_000, transport);
    }, transport);
    await testInfo.attach("selection-validator-result.json", { body: encoded, contentType: "application/json" });
    expect(wasmRequests).toEqual([]);
    expect(JSON.parse(encoded)).toEqual({ format: "breditor/js-selection-validator", transport,
      cycles: "10000", fixtures: "29", checks: "870000", coercions: "0" });
  });
}
