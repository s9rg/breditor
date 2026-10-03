import { expect, test as base } from "@playwright/test";
import { attachSelectionU32Candidate } from "./diagnostics/attach_selection_u32_candidate";

const test = base.extend<{ restoreIterations: number; productionSelectionProbe: boolean; startupDiagnostics: boolean }>({
  restoreIterations: [3_000, { option: true }],
  productionSelectionProbe: [false, { option: true }],
  startupDiagnostics: [false, { option: true }],
});

test.afterEach(async ({ page }, testInfo) => {
  await attachSelectionU32Candidate(page, testInfo);
});

test("restored selection coordinates retain presence, zero offsets, and direction", async ({ page, restoreIterations, productionSelectionProbe, startupDiagnostics }, testInfo) => {
  // The separate stress configuration scales work without relaxing timeouts,
  // changing optimization settings, or weakening the same exact-field oracle.
  expect(Number.isSafeInteger(restoreIterations) && restoreIterations > 0 && restoreIterations <= 10_000).toBe(true);
  await page.goto("/");
  if (productionSelectionProbe) {
    await page.waitForFunction(() => "breditorSelectionProbe" in window);
  }
  let result;
  try {
    result = await page.evaluate(async ({ iterations, production }) => {
      if (production) {
        const fixture = window as unknown as {
          breditorSelectionProbe: typeof import("./harness/selection_restore_probe").probeRestoredSelections;
        };
        return fixture.breditorSelectionProbe(iterations);
      }
      const url = "/selection_restore_probe.ts";
      const probe = await import(url) as typeof import("./harness/selection_restore_probe");
      return probe.probeRestoredSelections(iterations);
    }, { iterations: restoreIterations, production: productionSelectionProbe });
    const diagnostic = await page.evaluate(() => {
      const fixture = window as unknown as { breditorStartupDiagnostics?: () => unknown };
      return fixture.breditorStartupDiagnostics?.() ?? null;
    });
    if (startupDiagnostics) {
      expect(diagnostic).toMatchObject({
        format: "breditor/startup-rejections", version: 1, events: [], omitted: 0,
      });
      const mapping = await page.request.get("/startup-diagnostic-map.json");
      expect(mapping.ok(), "all startup diagnostic modules must be installed").toBe(true);
      const manifest = await mapping.json() as { modules: Record<string, unknown> };
      expect(Object.keys(manifest.modules).sort()).toEqual([
        "wasm_document_json.js", "wasm_engine_bootstrap.js", "wasm_profile_descriptor.js",
        "wasm_selection_adapter.js", "wasm_session_checkpoint.js",
      ]);
    }
    else expect(diagnostic).toBeNull();
  } catch (error) {
    // The opt-in debug build exposes only bounded, payload-free breadcrumbs.
    // Attachment failure must not replace the original runtime/test failure.
    try {
      const diagnostic = await page.evaluate(() => {
        const fixture = window as unknown as {
          breditorStartupDiagnostics?: () => unknown;
        };
        return fixture.breditorStartupDiagnostics?.() ?? null;
      });
      if (diagnostic !== null) {
        await testInfo.attach("startup-rejections.json", {
          body: JSON.stringify(diagnostic, null, 2), contentType: "application/json",
        });
        const mapping = await page.request.get("/startup-diagnostic-map.json");
        if (mapping.ok()) await testInfo.attach("startup-diagnostic-map.json", {
          body: await mapping.body(), contentType: "application/json",
        });
      }
    } catch { /* Preserve the original failure if the page already closed. */ }
    throw error;
  }
  expect(result).toEqual({ iterations: restoreIterations, reads: restoreIterations * 3 });
});
