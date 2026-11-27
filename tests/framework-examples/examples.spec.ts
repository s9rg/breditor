import { test, expect, type Page } from "@playwright/test";

// Smoke coverage for the non-React integration examples, served from their production
// builds. Each test checks mount, typing, live read-only policy and the lifecycle edge
// that example exists to demonstrate, and that no error reached the host.

interface EditorLike {
  view(): { documentJson: string; undoDepth: number; readOnly?: true };
  checkpointJson(): string;
}
interface Log { ready: number; changes: number; errors: string[] }
type DemoWindow = Window & {
  vanillaDemo: Log & { editor: EditorLike | null };
  webComponentDemo: Log & { editor: HTMLElement & { phase: string; editor: EditorLike | null; readOnly: boolean } };
  vueDemo: Log & { editors: EditorLike[] };
  before?: unknown;
};

const surface = (page: Page) => page.locator(".breditor-rich-surface");
const intro = (page: Page) => page.locator('[data-rich-text="intro"]');

async function typeAtEnd(page: Page, text: string) {
  await intro(page).click();
  await page.keyboard.press("End");
  await page.keyboard.type(text);
}

test("vanilla example opens, edits, enforces read-only and reopens from its exact checkpoint", async ({ page }) => {
  await page.goto("http://127.0.0.1:4211/");
  await expect(page.locator("#status")).toHaveText("Ready");
  await expect(intro(page)).toHaveText("Hello from the vanilla example.");
  await typeAtEnd(page, " Typed");
  await expect(intro(page)).toHaveText("Hello from the vanilla example. Typed");
  expect(Number(await page.locator("#changes").textContent())).toBeGreaterThan(0);

  await page.locator("#read-only").check();
  await expect(surface(page)).toHaveAttribute("aria-readonly", "true");
  await typeAtEnd(page, "X");
  await expect(intro(page)).toHaveText("Hello from the vanilla example. Typed");
  await page.locator("#read-only").uncheck();
  await expect(surface(page)).toHaveAttribute("aria-readonly", "false");

  const checkpoint = await page.evaluate(() => (window as unknown as DemoWindow).vanillaDemo.editor!.checkpointJson());
  await page.locator("#close").click();
  await expect(page.locator("#status")).toHaveText("Closed");
  await expect(surface(page)).toHaveCount(0);
  await page.locator("#open").click();
  await expect(page.locator("#status")).toHaveText("Ready");
  await expect(intro(page)).toHaveText("Hello from the vanilla example. Typed");
  expect(await page.evaluate(() => (window as unknown as DemoWindow).vanillaDemo.editor!.checkpointJson())).toBe(checkpoint);

  // Close and reopen repeatedly in one task: every pending opening is cancelled first.
  await page.evaluate(() => { for (let i = 0; i < 3; i += 1) document.querySelector<HTMLButtonElement>("#restart")!.click(); });
  await expect(page.locator("#status")).toHaveText("Ready");
  await expect(surface(page)).toHaveCount(1);
  expect(await page.evaluate(() => (window as unknown as DemoWindow).vanillaDemo.editor!.view().undoDepth)).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as unknown as DemoWindow).vanillaDemo.errors)).toEqual([]);
});

test("custom element keeps its owner across moves, survives detach/reattach and cancels a disconnected startup", async ({ page }) => {
  await page.goto("http://127.0.0.1:4212/");
  await expect(page.locator("#status")).toHaveText("ready");
  const element = page.locator("breditor-editor");
  await expect(element).toHaveAttribute("data-breditor-phase", "ready");
  await expect(intro(page)).toHaveText("Hello from a custom element.");
  await typeAtEnd(page, " Typed");
  await expect(intro(page)).toHaveText("Hello from a custom element. Typed");
  expect(await page.evaluate(() => (window as unknown as DemoWindow).webComponentDemo.changes)).toBeGreaterThan(0);

  await page.locator("#read-only").check();
  await expect(element).toHaveAttribute("read-only", "");
  await expect(surface(page)).toHaveAttribute("aria-readonly", "true");
  await page.locator("#read-only").uncheck();
  await expect(surface(page)).toHaveAttribute("aria-readonly", "false");

  // A synchronous DOM move keeps the same native owner and its history.
  await page.evaluate(() => { const w = window as unknown as DemoWindow; w.before = w.webComponentDemo.editor.editor; });
  await page.locator("#move").click();
  await expect(page.locator("#slot-b breditor-editor")).toHaveCount(1);
  expect(await page.evaluate(() => { const w = window as unknown as DemoWindow; return w.before === w.webComponentDemo.editor.editor; })).toBe(true);
  await typeAtEnd(page, "!");
  await expect(intro(page)).toHaveText("Hello from a custom element. Typed!");

  // Detach disposes after a microtask; reattach reopens from the exact checkpoint.
  const checkpoint = await page.evaluate(() => (window as unknown as DemoWindow).webComponentDemo.editor.editor!.checkpointJson());
  await page.locator("#detach").click();
  await expect(page.locator("#status")).toHaveText("idle");
  expect(await page.evaluate(() => { const w = window as unknown as DemoWindow; try { (w.before as EditorLike).view(); return "live"; } catch { return "disposed"; } })).toBe("disposed");
  await page.locator("#attach").click();
  await expect(page.locator("#status")).toHaveText("ready");
  await expect(intro(page)).toHaveText("Hello from a custom element. Typed!");
  expect(await page.evaluate(() => (window as unknown as DemoWindow).webComponentDemo.editor.editor!.checkpointJson())).toBe(checkpoint);

  // Disconnect during asynchronous startup, reconnect, disconnect again, reconnect later.
  await page.evaluate(async () => {
    const w = window as unknown as DemoWindow, element = w.webComponentDemo.editor, slot = document.querySelector("#slot-a")!;
    element.remove(); await new Promise((resolve) => setTimeout(resolve, 0));
    slot.append(element); element.remove(); await Promise.resolve();
    slot.append(element); await new Promise((resolve) => setTimeout(resolve, 0));
    element.remove(); await new Promise((resolve) => setTimeout(resolve, 0));
    slot.append(element);
  });
  await expect(element).toHaveAttribute("data-breditor-phase", "ready");
  await expect(surface(page)).toHaveCount(1);
  await expect(intro(page)).toHaveText("Hello from a custom element. Typed!");
  expect(await page.evaluate(() => (window as unknown as DemoWindow).webComponentDemo.errors)).toEqual([]);
});

test("Vue example updates props live and disposes owners on unmount, key change and remount during startup", async ({ page }) => {
  await page.goto("http://127.0.0.1:4213/");
  await expect(page.locator("#status")).toHaveText("ready");
  await expect(intro(page)).toHaveText("Hello from Vue document 1.");
  await typeAtEnd(page, " Typed");
  await expect(intro(page)).toHaveText("Hello from Vue document 1. Typed");
  expect(await page.evaluate(() => (window as unknown as DemoWindow).vueDemo.changes)).toBeGreaterThan(0);

  // A prop update goes through setReadOnly on the same owner.
  await page.locator("#read-only").check();
  await expect(surface(page)).toHaveAttribute("aria-readonly", "true");
  await page.locator("#read-only").uncheck();
  await expect(surface(page)).toHaveAttribute("aria-readonly", "false");
  expect(await page.evaluate(() => (window as unknown as DemoWindow).vueDemo.ready)).toBe(1);

  await page.locator("#toggle").click();
  await expect(surface(page)).toHaveCount(0);
  await page.locator("#toggle").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as DemoWindow).vueDemo.ready)).toBe(2);

  // The current read-only prop is the initial policy of a newly keyed owner.
  await page.locator("#read-only").check();
  await page.locator("#next").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as DemoWindow).vueDemo.ready)).toBe(3);
  await expect(intro(page)).toHaveText("Hello from Vue document 2.");
  await expect(surface(page)).toHaveAttribute("aria-readonly", "true");
  await page.locator("#read-only").uncheck();

  // Replace the keyed editor again before its opening can settle, then remount.
  const before = await page.evaluate(() => (window as unknown as DemoWindow).vueDemo.ready);
  await page.evaluate(async () => {
    const next = document.querySelector<HTMLButtonElement>("#next")!;
    next.click(); await Promise.resolve(); await Promise.resolve(); next.click();
    document.querySelector<HTMLButtonElement>("#remount")!.click();
  });
  await expect(page.locator("#document")).toHaveText("4");
  await expect(intro(page)).toHaveText("Hello from Vue document 4.");
  await expect(surface(page)).toHaveCount(1);
  const result = await page.evaluate(() => {
    const log = (window as unknown as DemoWindow).vueDemo;
    const live = log.editors.map((editor) => { try { editor.view(); return true; } catch { return false; } });
    return { live, errors: log.errors };
  });
  expect(result.errors).toEqual([]);
  // Only the newest owner is live; every earlier one was disposed exactly when unmounted.
  expect(result.live.slice(0, -1).every((value) => !value)).toBe(true);
  expect(result.live.at(-1)).toBe(true);
  expect(result.live.length).toBeGreaterThan(before);
});
