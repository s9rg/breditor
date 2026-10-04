import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MANUAL_CHECKS, type ManualClipboardRecorder } from "../browser/harness/manual_clipboard_recorder.js";

type Report = ReturnType<ManualClipboardRecorder["report"]> & {
  fixture: {name: string; schema: string; sessionFormatVersion: number; wasmSha256: string};
};
async function open(page: Page, guardApis = true): Promise<Locator> {
  if (guardApis) await page.addInitScript(() => {
    for (const [target, name] of [[navigator, "clipboard"], [window, "indexedDB"]] as const) {
      Object.defineProperty(target, name, {get() {
        document.documentElement.setAttribute("data-forbidden-api", name);
        throw new Error("Disposable manual fixture must not access this API");
      }});
    }
  });
  await page.goto("/manual-clipboard.html");
  await expect(page.locator("#status")).toHaveText("live · incomplete");
  return page.getByRole("textbox", {name: "Manual list clipboard editor", exact: true});
}
async function report(page: Page): Promise<Report> {
  await page.getByRole("button", {name: "Capture redacted report", exact: true}).click();
  return JSON.parse(await page.locator("#report").inputValue()) as Report;
}
async function selectNumberedItems(editor: Locator): Promise<void> {
  await editor.evaluate(host => {
    host.focus();
    const items = host.querySelectorAll("ol li p");
    const first = items[0]!.firstChild!, last = items[1]!.firstChild!;
    document.getSelection()!.setBaseAndExtent(last, last.textContent!.length, first, 0);
    document.dispatchEvent(new Event("selectionchange"));
  });
}
async function transfer(editor: Locator, kind: "copy" | "cut" | "paste"): Promise<string> {
  return editor.evaluate((host, kind) => {
    const event = new ClipboardEvent(kind, {clipboardData: new DataTransfer(), bubbles: true, cancelable: true});
    const data = event.clipboardData!;
    if (kind === "paste") {
      data.setData("text/plain", "private-clipboard-🙂");
      data.setData("text/html", '<h1 data-private="private-html">private-rich-text</h1>');
    }
    host.dispatchEvent(event);
    return data.getData("text/plain");
  }, kind);
}

test("manual list page is disposable and artifact-bound", async ({page}) => {
  const editor = await open(page);
  await expect(editor.locator(":scope > h2")).toHaveText("Make room for your ideas");
  await expect(editor.locator("ul li")).toHaveCount(2);
  await expect(editor.locator("ol")).toHaveAttribute("start", "3");
  await expect(page.locator('#toolbar [role="toolbar"] button')).toHaveCount(21);
  const candidate = process.env["BREDITOR_FLAT_LIST_BINDINGS"];
  if (!candidate) throw new Error("Missing qualified candidate");
  const qualification = JSON.parse(await readFile(resolve(candidate, "qualification.json"), "utf8"));
  expect((await report(page)).fixture).toEqual({name: "flat-list-showcase", schema: "example/flat-list-showcase",
    sessionFormatVersion: 6, wasmSha256: qualification.wasmSha256});
  await expect(page.locator("html")).not.toHaveAttribute("data-forbidden-api");
});

test("unmodified manual list page passes accessibility and narrow layout checks", async ({page}) => {
  // Keep API-access traps in the isolation tests above/below. The IndexedDB
  // getter trap reproducibly interferes with axe result serialization in Firefox.
  // Scan the actual page, including a populated report, without those test mocks.
  await open(page, false);
  await report(page);
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.setViewportSize({width: 390, height: 844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("controlled cross-item clipboard and history retain structure without claiming native evidence", async ({page}) => {
  const editor = await open(page), original = await editor.innerHTML();
  await page.locator("#scratch").fill("private-scratch-value");
  for (const check of MANUAL_CHECKS) await page.locator(`[data-check="${check}"]`).check();
  await selectNumberedItems(editor);
  expect(await transfer(editor, "copy")).toBe("Write a first draft\nReview and refine");
  expect(await editor.innerHTML()).toBe(original);
  expect(await transfer(editor, "cut")).toBe("Write a first draft\nReview and refine");
  await expect(editor).not.toContainText("Write a first draft");
  const cut = await editor.innerHTML();
  await page.getByRole("button", {name: "Undo", exact: true}).click();
  expect(await editor.innerHTML()).toBe(original);
  await page.getByRole("button", {name: "Redo", exact: true}).click();
  expect(await editor.innerHTML()).toBe(cut);
  await page.getByRole("button", {name: "Undo", exact: true}).click();
  await selectNumberedItems(editor);
  await transfer(editor, "paste");
  await expect(editor.locator("ol li")).toHaveCount(1);
  await expect(editor.locator("ol li p")).toHaveText("private-clipboard-🙂");
  await expect(editor.locator("ol")).toHaveAttribute("start", "3");
  await expect(editor.locator("h1, [data-private]")).toHaveCount(0);
  await page.getByRole("button", {name: "Undo", exact: true}).click();
  expect(await editor.innerHTML()).toBe(original);
  await expect.poll(async () => (await report(page)).pendingEvents).toBe(0);
  const captured = await report(page);
  expect(captured).toMatchObject({outcome: "incomplete", firstFault: null,
    trustedClipboardEvents: {copy: 0, cut: 0, paste: 0}});
  expect(captured.events.filter(event => ["copy", "cut", "paste"].includes(event.kind))).toHaveLength(3);
  const serialized = JSON.stringify(captured);
  for (const text of ["private-scratch", "private-clipboard", "private-html", "private-rich", "Write a first draft", "Make room for your ideas"]) {
    expect(serialized).not.toContain(text);
  }
  await expect(page.locator("html")).not.toHaveAttribute("data-forbidden-api");
  await page.reload();
  await expect(page.locator("#status")).toHaveText("live · incomplete");
  expect(await editor.innerHTML()).toBe(original);
  expect(await report(page)).toMatchObject({observedEvents: 0, outcome: "incomplete"});
});

test("browser keyboard exits an empty middle item and replays the split exactly", async ({page}) => {
  const editor = await open(page), original = await editor.innerHTML();
  await editor.locator("ul li p").first().evaluate(node => {
    (node.closest('[contenteditable="true"]') as HTMLElement).focus();
    const range = document.createRange(); range.selectNodeContents(node); range.collapse(false);
    document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.keyboard.type("!");
  await page.keyboard.press("Enter");
  await expect(editor.locator("ul li")).toHaveCount(3);
  await page.keyboard.press("Enter");
  await expect(editor.locator(":scope > ul")).toHaveCount(2);
  await expect(editor.locator("ul li")).toHaveCount(2);
  await expect(editor.locator("ol")).toHaveAttribute("start", "3");
  const exited = await editor.innerHTML();
  for (let index = 0; index < 3; index++) await page.getByRole("button", {name: "Undo", exact: true}).click();
  expect(await editor.innerHTML()).toBe(original);
  for (let index = 0; index < 3; index++) await page.getByRole("button", {name: "Redo", exact: true}).click();
  expect(await editor.innerHTML()).toBe(exited);
  await expect(page.locator("#status")).toHaveText("live · incomplete");
});
