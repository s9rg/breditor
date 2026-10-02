import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { transformJscComparison } from "./jsc_comparison_variants.mjs";
import type { probePropertyBoundary } from "./property_boundary_probe";

test("captured numeric comparison agrees with independently expected values", async ({ page }, testInfo) => {
  const comparison = process.env["BREDITOR_COMPARISON"] ?? "original";
  const original = readFileSync(new URL("../../../target/property-transport/js-cold-minimal/assets/index-a-Ao9ALN.js", import.meta.url), "utf8");
  const body = transformJscComparison(original, comparison);
  await testInfo.attach("comparison-source.json", { contentType: "application/json", body: JSON.stringify({ comparison,
    originalSha256: createHash("sha256").update(original).digest("hex"),
    executedSha256: createHash("sha256").update(body).digest("hex") }) });
  let served = 0, wasmRequests = 0;
  page.on("request", request => { if (new URL(request.url()).pathname.endsWith(".wasm")) wasmRequests++; });
  await page.route("**/assets/index-a-Ao9ALN.js", async route => {
    served++;
    await route.fulfill({ contentType: "text/javascript", body });
  });
  await page.goto("/");
  await page.waitForFunction(() => "breditorPropertyBoundaryProbe" in window);
  type Fixture = { breditorPropertyBoundaryProbe: typeof probePropertyBoundary;
    breditorStartupDiagnostics: () => unknown; breditorHotComparison?: unknown };
  try {
    const result = await page.evaluate(() => (window as unknown as Fixture).breditorPropertyBoundaryProbe("tiny-wasm", 10000));
    expect(result).toEqual({ mode: "tiny-wasm", iterations: 10000, reads: 20000 });
    expect(await page.evaluate(() => (window as unknown as Fixture).breditorStartupDiagnostics())).toMatchObject({ events: [], omitted: 0 });
    expect(await page.evaluate(() => (window as unknown as Fixture).breditorHotComparison)).toBeUndefined();
    expect(served).toBe(1);
    expect(wasmRequests).toBe(0);
  } catch (error) {
    try {
      const report = await page.evaluate(() => { const fixture = window as unknown as Fixture; return {
        diagnostic: fixture.breditorStartupDiagnostics(), hotComparison: fixture.breditorHotComparison }; });
      await testInfo.attach("comparison-rejection.json", { contentType: "application/json", body: JSON.stringify(report, null, 2) });
    } catch { /* Preserve the original rejection. */ }
    throw error;
  }
});
