import { expect, test } from "@playwright/test";
import { numberTransportModes, type probeNumberTransport } from "./number_transport_probe";

for (const mode of numberTransportModes) {
  test(`comparison-only number transport: ${mode}`, async ({ page }, testInfo) => {
    let wasmRequests = 0;
    page.on("request", request => { if (new URL(request.url()).pathname.endsWith(".wasm")) wasmRequests++; });
    await page.goto("/");
    await page.waitForFunction(() => "breditorNumberTransportProbe" in window);
    try {
      const result = await page.evaluate(async mode => {
        const fixture = window as unknown as { breditorNumberTransportProbe: typeof probeNumberTransport };
        return fixture.breditorNumberTransportProbe(mode, 10_000);
      }, mode);
      expect(result).toEqual({ mode, iterations: 10_000, comparisons: 100_000 });
      const diagnostic = await page.evaluate(() => (window as unknown as { breditorStartupDiagnostics: () => unknown }).breditorStartupDiagnostics());
      expect(diagnostic).toMatchObject({ events: [], omitted: 0 });
      expect(wasmRequests).toBe(0);
    } catch (error) {
      try {
        const diagnostic = await page.evaluate(() => (window as unknown as { breditorStartupDiagnostics: () => unknown }).breditorStartupDiagnostics());
        await testInfo.attach("number-rejections.json", { body: JSON.stringify(diagnostic, null, 2), contentType: "application/json" });
      } catch { /* Preserve the original failure. */ }
      throw error;
    }
  });
}
