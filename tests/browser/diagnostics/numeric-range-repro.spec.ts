import { expect, test } from "@playwright/test";

test("positive integer bounds hold without Rust, Wasm or an editor", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", request => requested.push(request.url()));
  await page.goto("/selection-endpoint.html");
  const result = await page.evaluate(async () => {
    const path = "/numeric_range_probe.ts";
    const probe = await import(/* @vite-ignore */ path) as typeof import("../harness/numeric_range_probe");
    return probe.probeNumericRange(10_000);
  });
  expect(result).toEqual({ iterations: "10000", checks: "150000" });
  expect(requested.filter(url => /\.wasm(?:\?|$)|breditor-browser\/(?:dist|src)\//u.test(url))).toEqual([]);
});
