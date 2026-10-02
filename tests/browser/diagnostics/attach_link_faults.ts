import { expect, type Page, type TestInfo } from "@playwright/test";
import { attachStartupRejections } from "./attach_startup_rejections";

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
    if (diagnostic !== null) {
      const mapping = await page.request.get("/link-diagnostic-map.json");
      await testInfo.attach("link-faults.json", { body: JSON.stringify(diagnostic), contentType: "application/json" });
      await testInfo.attach("link-diagnostic-map.json", { body: await mapping.body(), contentType: "application/json" });
      expect(mapping.ok(), "all diagnostic modules must be installed").toBe(true);
    }
  } catch (error) {
    // Attachment failures must not replace the original regression failure.
    if (testInfo.status === testInfo.expectedStatus) throw error;
  }
}
