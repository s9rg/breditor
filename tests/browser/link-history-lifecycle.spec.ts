import { expect, test } from "@playwright/test";

test.afterEach(async ({ page }, testInfo) => {
  try {
    const diagnostic = await page.evaluate(() => {
      const fixture = window as unknown as { breditorLinkDiagnostics?: () => unknown };
      return fixture.breditorLinkDiagnostics?.() ?? null;
    });
    if (testInfo.config.configFile?.endsWith("playwright.link-diagnostics.config.ts")) {
      expect(diagnostic, "diagnostic fixture must expose its recorder").not.toBeNull();
    }
    if (diagnostic !== null) {
      const mapping = await page.request.get("/link-diagnostic-map.json");
      await testInfo.attach("link-faults.json", { body: JSON.stringify(diagnostic), contentType: "application/json" });
      await testInfo.attach("link-diagnostic-map.json", { body: await mapping.body(), contentType: "application/json" });
      expect(mapping.ok(), "all diagnostic modules must be installed").toBe(true);
    }
  } catch (error) {
    // Never replace an original failure with an attachment failure.
    if (testInfo.status === testInfo.expectedStatus) throw error;
  }
});

test("a warm Link owner retains typed form hydration, bounded history, and an exportable redo branch", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() =>
    window.__breditorHarness?.phase === "ready" || window.__breditorStartupError !== undefined,
  );
  expect(await page.evaluate(() => window.__breditorStartupError)).toBeUndefined();

  const completed = await page.evaluate(async () => {
    const harness = window.__breditorHarness!;
    const initialHref = "https://example.test/reference";
    const fixture = await harness.mountReferenceFormatting(false, initialHref);
    const root = document.querySelector(`[data-breditor-reference-formatting-probe="${fixture.probeId}"]`)!;
    const host = root.querySelector<HTMLElement>("[contenteditable]")!;
    const click = (name: string) => {
      const button = [...root.querySelectorAll<HTMLButtonElement>("button")]
        .find((candidate) => candidate.textContent === name || candidate.getAttribute("aria-label") === name);
      if (button === undefined) throw new Error(`missing ${name} control`);
      // Deliberate same-task native focus/click calls, not trusted pointer input.
      button.focus();
      button.click();
    };
    click("Link");
    const input = root.querySelector<HTMLInputElement>('input[type="text"]')!;
    const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
    const assertState = (href: string, raw: string) => {
      if (harness.referenceFormattingSnapshot(fixture.probeId).status.phase !== "live") throw new Error("owner is not live");
      if (host.querySelector("a")?.getAttribute("href") !== href) throw new Error("rendered Link differs");
      if (input.value !== raw) throw new Error("typed form hydration differs");
      if (host.textContent !== fixture.text || host.querySelector("mark")?.textContent !== fixture.text) throw new Error("unrelated text or Highlight changed");
    };
    let priorHref = initialHref;
    let priorRaw = initialHref;
    let stage = "initial";
    let cycle = 0;
    try {
      assertState(priorHref, priorRaw);
      // The fixture's history capacity is 20. This deliberately exceeds it
      // without relying on older evicted entries, keeping one owner/JIT warm.
      for (; cycle < 300; cycle += 1) {
        const href = `https://example.test/step/${cycle}`;
        const raw = `HTTPS://Example.TEST:443/unused/../step/${cycle}`;
        stage = "apply";
        input.focus();
        input.value = raw;
        input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
        click("Apply Link");
        assertState(href, raw);
        if (cycle % 3 === 0) await nextTask();
        stage = "undo";
        click("Undo");
        assertState(priorHref, priorRaw);
        if (cycle % 3 === 1) await nextTask();
        stage = "redo";
        click("Redo");
        assertState(href, raw);
        if (cycle % 3 === 2) await nextTask();
        priorHref = href;
        priorRaw = raw;
      }
      stage = "checkpoint";
      click("Undo");
      assertState("https://example.test/step/298", "HTTPS://Example.TEST:443/unused/../step/298");
      const checkpoint = harness.referenceFormattingBackup(fixture.probeId);
      const restored = await harness.restoreReferenceFormattingBackup(checkpoint);
      if (restored !== checkpoint) throw new Error("restored checkpoint differs");
      click("Redo");
      assertState(priorHref, priorRaw);
    } catch (error) {
      // Keep the failed fixture mounted for Playwright's screenshot/trace.
      // The page fixture releases its owners when the browser context closes.
      throw new Error(`Link cycle=${cycle} stage=${stage} status=${JSON.stringify(harness.referenceFormattingSnapshot(fixture.probeId).status)}: ${String(error)}`);
    }
    harness.cleanupReferenceFormatting(fixture.probeId);
    return cycle;
  });
  expect(completed).toBe(300);
});
