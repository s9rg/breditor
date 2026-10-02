import { expect, type Page, type TestInfo } from "@playwright/test";

/** Preserve descriptor-startup evidence even when the lifecycle probe throws. */
export async function attachStartupRejections(page: Page, testInfo: TestInfo): Promise<void> {
  if (!testInfo.config.configFile?.endsWith("playwright.startup-development-diagnostics.config.ts")) return;
  try {
    const diagnostic = await page.evaluate(() => {
      const fixture = window as unknown as { breditorStartupDiagnostics?: () => unknown };
      return fixture.breditorStartupDiagnostics?.() ?? null;
    });
    await testInfo.attach("startup-rejections.json", {
      body: JSON.stringify(diagnostic), contentType: "application/json",
    });
    const mapping = await page.request.get("/startup-diagnostic-map.json");
    await testInfo.attach("startup-diagnostic-map.json", {
      body: await mapping.body(), contentType: "application/json",
    });
    expect(mapping.ok(), "all startup diagnostic modules must be installed").toBe(true);
    expect(Object.keys((await mapping.json() as { modules: Record<string, unknown> }).modules).sort()).toEqual([
      "wasm_document_json.js", "wasm_engine_bootstrap.js", "wasm_profile_descriptor.js",
      "wasm_selection_adapter.js", "wasm_session_checkpoint.js",
    ]);
    if (testInfo.status === testInfo.expectedStatus) {
      expect(diagnostic).toMatchObject({ format: "breditor/startup-rejections", version: 1, events: [], omitted: 0 });
    }
  } catch (error) {
    // Never replace the original failure with a closed-page/attachment error.
    if (testInfo.status === testInfo.expectedStatus) throw error;
  }
}
