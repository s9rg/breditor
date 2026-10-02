import { expect, test, type Page } from "@playwright/test";
import { MANUAL_CHECKS, MANUAL_EVENT_LIMIT, ManualClipboardRecorder } from "./harness/manual_clipboard_recorder";

type Report = ReturnType<ManualClipboardRecorder["report"]>;
const SAMPLE = "Breditor 🙂 clipboard";

async function openFixture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Any Clipboard API access fails the test, even a caught attempt.
    Object.defineProperty(navigator, "clipboard", { get() {
      document.documentElement.setAttribute("data-clipboard-api-touched", "true");
      throw new Error("Clipboard API is out of scope for the manual fixture");
    } });
  });
  await page.goto("/manual-clipboard.html");
  await expect(page.locator("#status")).toHaveText("live · incomplete");
  await expect(page.getByRole("textbox", { name: "Manual clipboard editor", exact: true })).toHaveText(SAMPLE);
}

async function report(page: Page): Promise<Report> {
  await page.locator("#capture-report").click();
  return JSON.parse(await page.locator("#report").inputValue()) as Report;
}

async function selectPrefix(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>("#editor")!;
    const leaf = document.createTreeWalker(host, NodeFilter.SHOW_TEXT).nextNode()!;
    host.focus();
    window.getSelection()!.setBaseAndExtent(leaf, 0, leaf, 8);
    document.dispatchEvent(new Event("selectionchange"));
  });
}

test("manual recorder distinguishes operator evidence, pending dispatch, truncation, and sticky faults", () => {
  const recorder = new ManualClipboardRecorder();
  recorder.observe({ status: { phase: "live" }, document: { lineage: "test", revision: "0" } });
  for (const check of MANUAL_CHECKS) recorder.confirm(check, true);
  for (const kind of ["copy", "cut", "paste"] as const) {
    const sequence = recorder.begin(kind, false, null);
    recorder.settle(sequence, true);
  }
  expect(recorder.report().outcome).toBe("incomplete");
  for (const kind of ["copy", "cut", "paste"] as const) {
    // Model-only injection, not evidence of a native browser clipboard run.
    const sequence = recorder.begin(kind, true, null);
    expect(recorder.report().outcome).toBe("incomplete");
    recorder.settle(sequence, true);
  }
  expect(recorder.report().outcome).toBe("operator-confirmed");
  recorder.confirm("history", false);
  expect(recorder.report().outcome).toBe("incomplete");
  recorder.confirm("history", true);
  for (let i = 0; i < MANUAL_EVENT_LIMIT; i++) recorder.settle(recorder.begin("input", false, "private-value"), false);
  expect(recorder.report()).toMatchObject({ outcome: "truncated", pendingEvents: 0, droppedEvents: 6 });
  recorder.observe({ status: { phase: "faulted", reason: "queueUncertain" }, document: { lineage: "test", revision: "4" } });
  recorder.observe({ status: { phase: "disposed" }, document: { lineage: "test", revision: "4" } });
  for (let i = 0; i < MANUAL_EVENT_LIMIT; i++) recorder.settle(recorder.begin("input", false, null), false);
  expect(recorder.report()).toMatchObject({ outcome: "fault-observed", firstFault: { reason: "queueUncertain", revision: "4" } });
  expect(JSON.stringify(recorder.report())).not.toContain("private-value");
  const failed = new ManualClipboardRecorder();
  failed.startupFailed();
  expect(failed.report()).toMatchObject({ outcome: "fault-observed", owner: { phase: "startupFailed" } });
});

test("manual fixture reports synthetic events honestly and excludes content and scratch input", async ({ page }) => {
  await openFixture(page);
  await page.locator("#scratch").fill("scratch-private-sentinel");
  for (const check of MANUAL_CHECKS) await page.locator(`[data-check="${check}"]`).check();
  await selectPrefix(page);
  await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>("#editor")!;
    for (const kind of ["copy", "cut", "paste"]) {
      const transfer = new DataTransfer();
      const event = new ClipboardEvent(kind, { clipboardData: transfer, bubbles: true, cancelable: true });
      // Firefox constructs its own event-owned transfer. Populate that object.
      const data = event.clipboardData ?? transfer;
      if (kind === "paste") {
        data.setData("text/plain", "private-clipboard-sentinel");
        data.setData("text/html", '<a href="https://private.test/sentinel">private-html-sentinel</a>');
      }
      host.dispatchEvent(event);
    }
    host.dispatchEvent(new InputEvent("beforeinput", { inputType: "private-input-type", data: "private-input-data", bubbles: true, cancelable: true }));
  });
  await expect(page.locator("#editor")).toContainText("private-clipboard-sentinel");
  await expect.poll(async () => (await report(page)).pendingEvents).toBe(0);
  const captured = await report(page);
  expect(captured).toMatchObject({ outcome: "incomplete", trustedClipboardEvents: { copy: 0, cut: 0, paste: 0 } });
  expect(captured.events.filter(event => ["copy", "cut", "paste"].includes(event.kind))).toHaveLength(3);
  expect(captured.events.every(event => !event.trusted && event.settled)).toBe(true);
  expect(captured.events.find(event => event.inputType === "other")).toBeDefined();
  const serialized = await page.locator("#report").inputValue();
  for (const secret of ["scratch-private", "private-clipboard", "private-html", "private.test", "private-input", SAMPLE, "https://example.test/original"]) {
    expect(serialized).not.toContain(secret);
  }
  await expect(page.locator("html")).not.toHaveAttribute("data-clipboard-api-touched");
});

test("manual fixture uses the real owner for controlled cut, paste and history without an input shim", async ({ page }) => {
  await openFixture(page);
  await selectPrefix(page);
  const cut = await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>("#editor")!;
    const event = new ClipboardEvent("cut", { clipboardData: new DataTransfer(), bubbles: true, cancelable: true });
    host.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(cut).toBe(true);
  await expect(page.locator("#editor")).toHaveText(" 🙂 clipboard");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator("#editor")).toHaveText(SAMPLE);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator("#editor")).toHaveText(" 🙂 clipboard");
  await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>("#editor")!;
    const leaf = document.createTreeWalker(host, NodeFilter.SHOW_TEXT).nextNode()!;
    host.focus();
    window.getSelection()!.setBaseAndExtent(leaf, 0, leaf, 0);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    const event = new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true });
    (event.clipboardData ?? transfer).setData("text/plain", "Breditor");
    document.querySelector("#editor")!.dispatchEvent(event);
  });
  await expect(page.locator("#editor")).toHaveText(SAMPLE);
  await expect.poll(async () => (await report(page)).pendingEvents).toBe(0);
  const captured = await report(page);
  expect(captured.owner.phase).toBe("live");
  expect(captured.firstFault).toBeNull();
  expect(captured.events.filter(event => event.kind === "cut" || event.kind === "paste").every(event => event.defaultPrevented)).toBe(true);
  await expect(page.locator("html")).not.toHaveAttribute("data-clipboard-api-touched");
});

test("manual fixture bounds recording and makes dropped evidence explicit", async ({ page }) => {
  await openFixture(page);
  await page.evaluate(limit => {
    const host = document.querySelector("#editor")!;
    for (let i = 0; i < limit + 5; i++) host.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, cancelable: true }));
  }, MANUAL_EVENT_LIMIT);
  await expect.poll(async () => (await report(page)).pendingEvents).toBe(0);
  const captured = await report(page);
  expect(captured).toMatchObject({ outcome: "truncated", observedEvents: MANUAL_EVENT_LIMIT + 5, droppedEvents: 5 });
  expect(captured.events).toHaveLength(MANUAL_EVENT_LIMIT);
  expect(captured.events[0]?.sequence).toBe(6);
  await expect(page.locator("html")).not.toHaveAttribute("data-clipboard-api-touched");
});

test("manual fixture handles browser-dispatched typing and records cancellation after native listeners", async ({ page }) => {
  await openFixture(page);
  await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>("#editor")!;
    const leaf = document.createTreeWalker(host, NodeFilter.SHOW_TEXT).nextNode()!;
    host.focus();
    window.getSelection()!.setBaseAndExtent(leaf, leaf.textContent!.length, leaf, leaf.textContent!.length);
    document.dispatchEvent(new Event("selectionchange"));
  });
  // Browser keyboard input, not a clipboard shortcut or synthetic InputEvent.
  await page.keyboard.type("!");
  await expect(page.locator("#editor")).toHaveText(`${SAMPLE}!`);
  await expect.poll(async () => (await report(page)).pendingEvents).toBe(0);
  const captured = await report(page);
  expect(captured.events).toContainEqual(expect.objectContaining({
    kind: "beforeinput", inputType: "insertText", trusted: true, defaultPrevented: true, settled: true,
  }));
  expect(captured).toMatchObject({ outcome: "incomplete", firstFault: null, trustedClipboardEvents: { copy: 0, cut: 0, paste: 0 } });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator("#editor")).toHaveText(SAMPLE);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator("#editor")).toHaveText(`${SAMPLE}!`);
  await expect(page.locator("html")).not.toHaveAttribute("data-clipboard-api-touched");
});
