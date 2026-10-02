import { expect, test } from "@playwright/test";
import { attachLinkFaults } from "./diagnostics/attach_link_faults";

test.afterEach(async ({ page }, testInfo) => {
  await attachLinkFaults(page, testInfo);
});

test.afterEach(async ({ page }, testInfo) => {
  if (process.env["BREDITOR_LINK_TIMING"] !== "1") return;
  try {
    const snapshot = await page.evaluate(() =>
      (window as unknown as { breditorLinkTiming?: () => string }).breditorLinkTiming?.() ?? null,
    );
    expect(snapshot, "opt-in timing observer must be installed").not.toBeNull();
    if (snapshot !== null) {
      await testInfo.attach("link-timing.json", { body: snapshot, contentType: "application/json" });
      if (testInfo.status === testInfo.expectedStatus) {
        expect(JSON.parse(snapshot)).toMatchObject({ format: "breditor/link-timing", version: 1,
          terminal: "completed", scheduled: 300, completed: 300, pending: null });
      }
    }
  } catch (error) {
    if (testInfo.status === testInfo.expectedStatus) throw error;
  }
});

test("a warm Link owner retains typed form hydration, bounded history, and an exportable redo branch", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() =>
    window.__breditorHarness?.phase === "ready" || window.__breditorStartupError !== undefined,
  );
  expect(await page.evaluate(() => window.__breditorStartupError)).toBeUndefined();

  const completed = await page.evaluate(async observeTiming => {
    const probeUrl = "/link_timing_probe.ts";
    const timing = observeTiming
      ? (await import(probeUrl) as typeof import("./harness/link_timing_probe")).installLinkTimingProbe()
      : undefined;
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
    const nextTask = timing?.nextTask ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
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
      try { timing?.finish("failed"); } catch { /* Preserve the original probe failure. */ }
      // Keep the failed fixture mounted for Playwright's screenshot/trace.
      // The page fixture releases its owners when the browser context closes.
      throw new Error(`Link cycle=${cycle} stage=${stage} status=${JSON.stringify(harness.referenceFormattingSnapshot(fixture.probeId).status)}: ${String(error)}`);
    }
    harness.cleanupReferenceFormatting(fixture.probeId);
    timing?.finish("completed");
    return cycle;
  }, process.env["BREDITOR_LINK_TIMING"] === "1");
  expect(completed).toBe(300);
});
