import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { expectAutosavedAction } from "../demo/autosave_observation.js";

const label = "Breditor list document";
async function open(page: Page) {
  await page.goto("/");
  const shell = page.getByRole("region", { name: `${label} editor` });
  await expect(shell).toHaveAttribute("aria-busy", "false");
  const diagnostics = await shell.locator("details code").allTextContents();
  expect(diagnostics).toEqual([]);
  const editor = page.getByRole("textbox", { name: label, exact: true });
  await expect(editor).toHaveAttribute("contenteditable", "true");
  return { shell, editor, status: shell.locator(".editor-status") };
}

async function selectFirstBlock(editor: Locator) {
  await editor.evaluate((host) => {
    host.focus();
    const range = host.ownerDocument.createRange();
    range.selectNodeContents(host.firstElementChild!);
    const selection = host.ownerDocument.getSelection()!;
    selection.removeAllRanges(); selection.addRange(range);
    host.ownerDocument.dispatchEvent(new Event("selectionchange"));
  });
}

async function backup(page: Page, shell: Locator): Promise<string> {
  const pending = page.waitForEvent("download");
  await shell.getByRole("button", { name: "Download session backup", exact: true }).click();
  const path = await (await pending).path();
  if (!path) throw new Error("Backup download has no path");
  return readFile(path, "utf8");
}


test("headings and typed inline formats survive list conversion and exact undo", async ({ page }) => {
  const { editor, shell, status } = await open(page);
  const original = await editor.textContent();
  await expect(editor.locator(":scope > ol")).toHaveAttribute("start", "3");
  await selectFirstBlock(editor);
  for (const rank of [1, 2, 3, 4, 5, 6]) {
    await expectAutosavedAction(status, () => shell.getByRole("button", {name: `Heading ${rank}`, exact: true}).click());
    await expect(editor.locator(`:scope > h${rank}`)).toHaveText("Make room for your ideas");
  }
  await shell.getByRole("button", {name: "Link", exact: true}).click();
  await shell.getByRole("textbox", {name: "Link URL", exact: true}).fill("https://example.test/lists");
  await expectAutosavedAction(status, () => shell.getByRole("button", {name: "Apply Link", exact: true}).click());
  await shell.getByRole("button", {name: "Text size", exact: true}).click();
  await shell.locator('select[name="example/text-size-step"]').selectOption("2");
  await expectAutosavedAction(status, () => shell.getByRole("button", {name: "Apply size", exact: true}).click());
  const before = await editor.innerHTML();
  await expectAutosavedAction(status, () => shell.getByRole("button", {name: "Bullet list", exact: true}).click());
  await expect(editor.locator(":scope > ul").first().locator("li h6 a")).toHaveAttribute("href", "https://example.test/lists");
  await expect(editor.locator("h6 .breditor-text-size")).toHaveAttribute("data-breditor-integer-token", "huge");
  await expectAutosavedAction(status, () => shell.getByRole("button", {name: "Numbered list", exact: true}).click());
  await expect(editor.locator(":scope > ol").first().locator("li h6")).toHaveText("Make room for your ideas");
  await expectAutosavedAction(status, () => shell.getByRole("button", {name: "Remove list", exact: true}).click());
  expect(await editor.innerHTML()).toBe(before);
  await expectAutosavedAction(status, () => shell.getByRole("button", {name: "Undo", exact: true}).click());
  await expect(editor.locator(":scope > ol").first().locator("li h6")).toHaveText("Make room for your ideas");
  expect(await editor.textContent()).toBe(original);
});

test("autosave reload and independent V6 backup retain the list redo branch", async ({ page }) => {
  let { editor, shell, status } = await open(page);
  await selectFirstBlock(editor);
  const original = await editor.innerHTML();
  await expectAutosavedAction(status, () => shell.getByRole("button", {name: "Bullet list", exact: true}).click());
  const listed = await editor.innerHTML();
  await expectAutosavedAction(status, () => shell.getByRole("button", {name: "Undo", exact: true}).click());
  const saved = await backup(page, shell);
  expect(JSON.parse(saved).formatVersion).toBe(6);
  ({ editor, shell, status } = await open(page));
  expect(await editor.innerHTML()).toBe(original);
  expect(await backup(page, shell)).toBe(saved);
  await expectAutosavedAction(status, () => shell.getByRole("button", {name: "Redo", exact: true}).click());
  expect(await editor.innerHTML()).toBe(listed);
  await page.getByLabel("Open session backup").setInputFiles({name: "lists.json", mimeType: "application/json", buffer: Buffer.from(saved)});
  const recovered = page.getByRole("region", {name: "Recovered Breditor session editor"});
  await expect(recovered).toHaveAttribute("aria-busy", "false");
  await expect(recovered.locator(".editor-status")).toHaveText("Autosave is off.");
  expect(await backup(page, recovered)).toBe(saved);
  await recovered.getByRole("button", {name: "Redo", exact: true}).click();
  expect(await recovered.getByRole("textbox").innerHTML()).toBe(listed);
  await recovered.getByRole("button", {name: "Remove list", exact: true}).click();
  expect(await recovered.getByRole("textbox").innerHTML()).toBe(original);
  expect(await editor.innerHTML()).toBe(listed);
});

test("browser keyboard typing and Enter edit a real list item and undo after reload", async ({ page }) => {
  let { editor, shell, status } = await open(page);
  const item = editor.locator("ul li p").first();
  await item.evaluate(node => {
    const host = node.closest<HTMLElement>('[contenteditable="true"]')!;
    host.focus();
    const range = document.createRange(); range.selectNodeContents(node); range.collapse(false);
    document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await expectAutosavedAction(status, () => page.keyboard.type(" together"));
  await expect(item).toHaveText("Collect your ideas together");
  await expectAutosavedAction(status, () => page.keyboard.press("Enter"));
  await expect(editor.locator("ul li")).toHaveCount(3);
  const split = await editor.innerHTML();
  ({ editor, shell, status } = await open(page));
  expect(await editor.innerHTML()).toBe(split);
  await expectAutosavedAction(status, () => shell.getByRole("button", {name: "Undo", exact: true}).click());
  await expect(editor.locator("ul li")).toHaveCount(2);
  await expect(editor.locator("ul li p").first()).toHaveText("Collect your ideas together");
  await expectAutosavedAction(status, () => shell.getByRole("button", {name: "Redo", exact: true}).click());
  expect(await editor.innerHTML()).toBe(split);
});

test("list demo controls pass automated accessibility and narrow layout checks", async ({ page }) => {
  await open(page);
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.setViewportSize({width: 390, height: 844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
