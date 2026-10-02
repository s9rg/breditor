import { expect, test } from "@playwright/test";
import type { probePropertyBoundary } from "./property_boundary_probe";

for (const mode of ["javascript", "tiny-wasm", "wasm"] as const) {
  test(`property validator accepts independently expected ${mode} inputs`, async ({ page }, testInfo) => {
    let wasmRequests = 0;
    page.on("request", request => { if (new URL(request.url()).pathname.endsWith(".wasm")) wasmRequests++; });
    await page.goto("/");
    await page.waitForFunction(() => "breditorPropertyBoundaryProbe" in window);
    try {
      const result = await page.evaluate(async mode => {
        const fixture = window as unknown as { breditorPropertyBoundaryProbe: typeof probePropertyBoundary };
        return fixture.breditorPropertyBoundaryProbe(mode, 10_000);
      }, mode);
      expect(result).toEqual({ mode, iterations: 10_000, reads: 20_000 });
      const diagnostic = await page.evaluate(() => (window as unknown as { breditorStartupDiagnostics: () => unknown }).breditorStartupDiagnostics());
      expect(diagnostic).toMatchObject({ events: [], omitted: 0 });
      expect(wasmRequests).toBe(mode === "wasm" ? 1 : 0);
    } catch (error) {
      try {
        const diagnostic = await page.evaluate(() => (window as unknown as { breditorStartupDiagnostics: () => unknown }).breditorStartupDiagnostics());
        await testInfo.attach("property-rejections.json", { body: JSON.stringify(diagnostic, null, 2), contentType: "application/json" });
      } catch { /* Retain the original failure. */ }
      throw error;
    }
  });
}
