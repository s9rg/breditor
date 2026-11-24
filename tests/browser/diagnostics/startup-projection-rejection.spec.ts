import { expect, test } from "@playwright/test";
import type { probeRestoredSelections } from "../harness/selection_restore_probe";
import type { probeStartupProjectionRejection } from "../harness/startup_projection_control";
import type { StartupRejectionSite } from "./startup_instrumentation";
import type { readStartupRejections } from "./startup_recorder";

type DiagnosticPage = Window & {
  breditorSelectionProbe: typeof probeRestoredSelections;
  breditorStartupProjectionControl: typeof probeStartupProjectionRejection;
  breditorStartupDiagnostics: typeof readStartupRejections;
};

for (const control of ["nodeCount", "snapshotRevision"] as const) {
  test(`startup diagnostics identify a rejected projection ${control}`, async ({ page }, testInfo) => {
    await page.goto("/");
    await page.waitForFunction(() => "breditorStartupProjectionControl" in window);
    const result = await page.evaluate(async (input) => {
      const fixture = window as unknown as DiagnosticPage;
      const rejection = await fixture.breditorStartupProjectionControl(input);
      return { rejection, diagnostic: fixture.breditorStartupDiagnostics() };
    }, control);
    const response = await page.request.get("/startup-diagnostic-map.json");
    expect(response.ok()).toBe(true);
    const { modules } = await response.json() as { modules: Record<string, { sites: StartupRejectionSite[] }> };
    const adapter = modules["wasm_projection_adapter.js"]!.sites;
    const bootstrap = modules["wasm_engine_bootstrap.js"]!.sites.filter(site => site.function === "consumeProjectionRead");
    expect(bootstrap).toHaveLength(2);
    await testInfo.attach("startup-rejections.json", {
      body: JSON.stringify(result.diagnostic, null, 2), contentType: "application/json",
    });
    await testInfo.attach("startup-diagnostic-map.json", { body: await response.body(), contentType: "application/json" });

    expect(result.rejection).toEqual({
      error: "engine_bootstrap.invalid_initial_projection", reads: 1, original: control === "nodeCount" ? 3 : "0",
    });
    expect(result.diagnostic).toMatchObject({ format: "breditor/startup-rejections", version: 1, omitted: 0 });
    if (control === "nodeCount") {
      const [shape, boundary] = result.diagnostic.events;
      expect(result.diagnostic.events).toHaveLength(2);
      expect(adapter.find(site => site.stage === shape?.stage)?.function).toBe("readSemanticProjection");
      expect(shape?.counters).toEqual({ nodeCount: "1", rootIndex: "0" });
      expect(boundary).toEqual({ stage: bootstrap[0]!.stage, counters: {} });
    } else {
      expect(result.diagnostic.events).toEqual([{ stage: bootstrap[1]!.stage, counters: {} }]);
    }
    const afterControl = await page.evaluate(async () => {
      const fixture = window as unknown as DiagnosticPage;
      const restored = await fixture.breditorSelectionProbe(1);
      return { restored, diagnostic: fixture.breditorStartupDiagnostics() };
    });
    expect(afterControl.restored).toEqual({ iterations: 1, reads: 3 });
    expect(afterControl.diagnostic).toEqual(result.diagnostic);
  });
}
