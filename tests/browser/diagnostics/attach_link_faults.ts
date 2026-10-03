import { expect, type Page, type TestInfo } from "@playwright/test";
import { attachStartupRejections } from "./attach_startup_rejections";
import { attachSelectionU32Candidate } from "./attach_selection_u32_candidate";

/** Add evidence to broad suites only in the explicitly selected diagnostic runs.
 * Ordinary release tests keep their existing teardown and browser call schedule.
 */
export async function attachConfiguredLinkFaults(page: Page, testInfo: TestInfo): Promise<void> {
  await attachSelectionU32Candidate(page, testInfo);
  const config = testInfo.config.configFile?.split(/[\\/]/).pop();
  if (config !== "playwright.queue-diagnostics.config.ts" &&
      config !== "playwright.link-diagnostics.config.ts" &&
      config !== "playwright.startup-development-diagnostics.config.ts") return;
  await attachLinkFaults(page, testInfo);
}

/** Keep the first-failure breadcrumbs and source map with either Link workflow. */
export async function attachLinkFaults(page: Page, testInfo: TestInfo): Promise<void> {
  await attachStartupRejections(page, testInfo);
  try {
    const diagnostic = await page.evaluate(() => {
      const fixture = window as unknown as { breditorLinkDiagnostics?: () => unknown };
      return fixture.breditorLinkDiagnostics?.() ?? null;
    });
    if (testInfo.config.configFile?.endsWith("playwright.link-diagnostics.config.ts") ||
        testInfo.config.configFile?.endsWith("playwright.queue-diagnostics.config.ts")) {
      expect(diagnostic, "diagnostic fixture must expose its recorder").not.toBeNull();
    }
    if (testInfo.config.configFile?.endsWith("playwright.queue-diagnostics.config.ts") &&
        process.env["BREDITOR_QUEUE_DELIVERY"] === "1") {
      expect(diagnostic, "delivery diagnostic must expose its recorder").toHaveProperty("deliveries");
    }
    if (testInfo.config.configFile?.endsWith("playwright.queue-diagnostics.config.ts") &&
        process.env["BREDITOR_QUEUE_PROJECTION"] === "1") {
      expect(diagnostic, "projection diagnostic must expose its recorder").toHaveProperty("projection");
    }
    if (testInfo.config.configFile?.endsWith("playwright.queue-diagnostics.config.ts") &&
        process.env["BREDITOR_QUEUE_CLIPBOARD"] === "1") {
      expect(diagnostic, "clipboard diagnostic must expose its recorder").toHaveProperty("clipboard");
    }
    if (diagnostic !== null) {
      // The server may already have stopped after a suite timeout. Preserve
      // the fetched recorder before attempting any further network operation.
      await testInfo.attach("link-faults.json", { body: JSON.stringify(diagnostic), contentType: "application/json" });
      const mapping = await page.request.get("/link-diagnostic-map.json");
      await testInfo.attach("link-diagnostic-map.json", { body: await mapping.body(), contentType: "application/json" });
      expect(mapping.ok(), "all diagnostic modules must be installed").toBe(true);
    }
  } catch (error) {
    // Attachment failures must not replace the original regression failure.
    if (testInfo.status === testInfo.expectedStatus) throw error;
  }
}
