import { expect, test } from "@playwright/test";
import { clipboardBoundaryProbe } from "./harness/clipboard_boundary_probe";
import { attachConfiguredLinkFaults } from "./diagnostics/attach_link_faults";

test.afterEach(async ({ page }, testInfo) => {
  await attachConfiguredLinkFaults(page, testInfo);
});

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__breditorHarness?.phase === "ready" || window.__breditorStartupError !== undefined);
  expect(await page.evaluate(() => window.__breditorStartupError)).toBeUndefined();
});

for (const backward of [false, true]) {
  for (const scenario of ["crossParagraph", "crossParagraphHtml", "boundaryOnly"] as const) {
    test(`clipboard ${scenario} ${backward ? "backward" : "forward"} ranges retain Unicode, empty paragraphs and atomic history`, async ({ page }) => {
      await page.evaluate(clipboardBoundaryProbe, { scenario, backward });
    });
  }
}

test("clipboard rejected paste preserves a selected document and retained redo branch", async ({ page }) => {
  await page.evaluate(clipboardBoundaryProbe, { scenario: "rejectedPaste", backward: true } as const);
});
