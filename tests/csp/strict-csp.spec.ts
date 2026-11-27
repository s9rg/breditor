import { expect, test, type Page } from "@playwright/test";
import {
  strictContentSecurityPolicy,
  styleAttributeContentSecurityPolicy,
} from "./policy.mjs";

// Strict Content Security Policy gate (docs/CONTENT_SECURITY_POLICY.md). The fixture host serves a
// Vite production build of the installed-style editor with the documented header. Every test records
// `securitypolicyviolation` events, console errors and page errors from before the first script runs.

interface Violation {
  readonly directive: string;
  readonly blocked: string;
  readonly sample: string;
  readonly source: string;
}
interface Recorder {
  readonly consoleErrors: string[];
  readonly pageErrors: string[];
  violations(): Promise<Violation[]>;
}
declare global {
  interface Window {
    __cspViolations?: Violation[];
    __cspPwned?: unknown;
    csp?: {
      editor: {
        surface: HTMLElement;
        execute(command: unknown): unknown;
        focus(): void;
        view(): { documentJson: string };
        insertImageFiles(store: unknown, files: readonly File[], position: unknown): Promise<unknown>;
      };
      assets: unknown;
      errors: string[];
      range(block: string, start: number, end?: number): unknown;
      renderStatic(): void;
    };
    cspShared?: { errors: string[] };
  }
}

async function record(page: Page): Promise<Recorder> {
  const consoleErrors: string[] = [], pageErrors: string[] = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", error => { pageErrors.push(String(error)); });
  await page.addInitScript(() => {
    const violations: Violation[] = [];
    Object.defineProperty(window, "__cspViolations", { value: violations });
    document.addEventListener("securitypolicyviolation", event => {
      violations.push({
        directive: event.effectiveDirective || event.violatedDirective,
        blocked: event.blockedURI,
        sample: event.sample,
        source: event.sourceFile,
      });
    }, true);
  });
  return { consoleErrors, pageErrors, violations: () => page.evaluate(() => [...(window.__cspViolations ?? [])]) };
}

async function open(page: Page, path: string): Promise<void> {
  const response = await page.goto(path);
  const header = response?.headers()["content-security-policy"] ?? "";
  const nonce = /'nonce-([^']+)'/u.exec(header)?.[1] ?? "";
  const relaxed = new URL(path, "http://fixture.invalid").searchParams.get("policy") === "style-attributes";
  expect(header).toBe(relaxed ? styleAttributeContentSecurityPolicy(nonce) : strictContentSecurityPolicy(nonce));
  await expect(page.locator("#ready")).toHaveText("Ready", { timeout: 15_000 });
}

async function expectClean(page: Page, recorder: Recorder): Promise<void> {
  expect(await recorder.violations()).toEqual([]);
  expect(recorder.pageErrors).toEqual([]);
  expect(recorder.consoleErrors).toEqual([]);
  // Every stylesheet the editor injected carries the published nonce and actually applied.
  const sheets = await page.evaluate(() => [...document.querySelectorAll("style")].map(style => ({
    applied: style.sheet !== null,
    nonce: style.nonce === document.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]')?.nonce,
  })));
  expect(sheets.length).toBeGreaterThan(0);
  expect(sheets.every(sheet => sheet.applied && sheet.nonce)).toBe(true);
}

async function caretAtEnd(page: Page, surface: string, block: string): Promise<void> {
  await page.locator(surface).focus();
  await page.locator(`${surface} [data-rich-text="${block}"]`).evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

async function typeIntoLocal(page: Page, text: string): Promise<void> {
  await page.evaluate(() => {
    const t = window.csp!;
    t.editor.execute({ kind: "setSelection", selection: t.range("body", 0) });
    t.editor.focus();
  });
  await page.keyboard.type(text);
}

const surface = "#editor [contenteditable=true]";

test("the fixture enforces the policy it serves", async ({ page, browserName }) => {
  const recorder = await record(page);
  await open(page, "/");
  // Positive controls: a nonce-less style element and (where implemented) a raw HTML string sink are refused.
  const result = await page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = "body{outline:1px solid red}";
    document.head.append(style);
    const blockedStyle = style.sheet === null;
    style.remove();
    const trustedTypes = "trustedTypes" in window;
    let htmlRefused = false;
    if (trustedTypes) {
      try { document.createElement("div").innerHTML = "<b>x</b>"; } catch { htmlRefused = true; }
    }
    return { blockedStyle, trustedTypes, htmlRefused };
  });
  test.info().annotations.push({ type: "trusted-types", description: result.trustedTypes ? "enforced" : "not implemented (CSP only)" });
  expect(result.blockedStyle).toBe(true);
  expect(result.htmlRefused).toBe(result.trustedTypes);
  if (browserName === "chromium") expect(result.trustedTypes).toBe(true);
  await expect.poll(async () => (await recorder.violations()).map(v => v.directive).sort())
    .toEqual(result.trustedTypes ? ["require-trusted-types-for", "style-src-elem"] : ["style-src-elem"]);
});

test("local editing, paste, undo, images and static render raise no violation", async ({ page }) => {
  const recorder = await record(page);
  await open(page, "/");
  await typeIntoLocal(page, "Hello");
  await expect(page.locator(surface)).toContainText("Hello");

  // Foreign HTML is parsed into an inert tree (parse5), never a live DOM; handlers and scripts stay data.
  await page.evaluate(() => {
    const target = window.csp!.editor.surface;
    const html = '<p>Pasted <strong>bold</strong> <a href="https://example.test/">link</a></p>' +
      '<img src="https://example.invalid/x.png" onerror="window.__cspPwned=1"><script>window.__cspPwned=2</script>';
    const data = new DataTransfer();
    data.setData("text/html", html);
    data.setData("text/plain", "Pasted bold link");
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data });
    if (event.clipboardData !== data) {
      event.clipboardData!.setData("text/html", html);
      event.clipboardData!.setData("text/plain", "Pasted bold link");
    }
    target.dispatchEvent(event);
  });
  await expect(page.locator(surface)).toContainText("Pasted bold link");
  await expect(page.locator(`${surface} strong`)).toHaveText("bold");
  expect(await page.evaluate(() => window.__cspPwned)).toBeUndefined();

  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(surface)).not.toContainText("Pasted");
  await expect(page.locator(surface)).toContainText("Hello");

  // Image bytes become an object URL (img-src blob:) after native raster admission.
  await page.evaluate(async () => {
    const t = window.csp!;
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    canvas.getContext("2d")!.fillRect(0, 0, 2, 2);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(Error("toBlob")), "image/png"));
    await t.editor.insertImageFiles(t.assets, [new File([blob], "pixel.png", { type: "image/png" })], { parent: { kind: "document" }, before: null });
  });
  const image = page.locator(`${surface} img`);
  await expect(image).toHaveCount(1);
  await expect(image).toHaveAttribute("src", /^blob:/u);
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth)).toBe(2);

  // The one HTML sink: static render output through the allowlisted Trusted Types policy.
  await page.evaluate(() => window.csp!.renderStatic());
  // With Trusted Types enforced (see the control test), a plain string here would have thrown.
  await expect(page.locator("#static")).toContainText("Hello");
  expect(await page.evaluate(() => window.csp!.errors)).toEqual([]);
  await expectClean(page, recorder);
});

test("two shared replicas over the in-page relay raise no violation", async ({ page }) => {
  const recorder = await record(page);
  await open(page, "/shared.html");
  const a = "#a [contenteditable=true]", b = "#b [contenteditable=true]";
  await caretAtEnd(page, a, "body");
  await page.keyboard.type(" from A");
  await expect(page.locator(b)).toContainText("Shared from A");
  await caretAtEnd(page, b, "body");
  await page.keyboard.type(" and B");
  await expect(page.locator(a)).toContainText("Shared from A and B");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(a)).toContainText("Shared from A");
  await expect(page.locator(a)).not.toContainText("and B");
  expect(await page.evaluate(() => window.cspShared!.errors)).toEqual([]);
  await expectClean(page, recorder);
});

for (const relaxed of [false, true]) {
  test(`text color ${relaxed ? "applies under the style-attribute relaxation" : "is the documented style-src-attr requirement"}`, async ({ page }) => {
    const recorder = await record(page);
    await open(page, relaxed ? "/?policy=style-attributes" : "/");
    await typeIntoLocal(page, "Tint");
    await page.evaluate(() => {
      const t = window.csp!;
      t.editor.execute({ kind: "setSelection", selection: t.range("body", 0, 4) });
    });
    await page.locator('[data-rich-control="text-color"] summary').click();
    await page.locator('[data-rich-field="text-color-value"]').fill("#336699");
    await page.locator('[data-rich-field="text-color-value"]').press("Enter");
    const span = page.locator(`${surface} .breditor-inline-text-color`);
    await expect(span).toHaveText("Tint");
    if (relaxed) {
      await expect(span).toHaveAttribute("style", "color:#336699");
      await expect(span).toHaveCSS("color", "rgb(51, 102, 153)");
      await expectClean(page, recorder);
    } else {
      // Chromium and WebKit keep the blocked attribute string; Firefox keeps the attribute empty.
      await expect(span).not.toHaveCSS("color", "rgb(51, 102, 153)");
      await expect.poll(async () => [...new Set((await recorder.violations()).map(v => v.directive))]).toEqual(["style-src-attr"]);
    }
  });
}
