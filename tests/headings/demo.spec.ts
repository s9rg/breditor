import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { expectAutosavedAction } from "../demo/autosave_observation.js";

const label = "Breditor heading document";
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

test("all heading ranks compose with inline formats and exact undo", async ({ page }) => {
  const { editor, shell, status } = await open(page);
  const original = await editor.textContent();
  await selectFirstBlock(editor);
  for (const rank of [1, 2, 3, 4, 5, 6]) {
    await expectAutosavedAction(status, () => shell.getByRole("button", { name: `Heading ${rank}`, exact: true }).click());
    await expect(editor.locator(`:scope > h${rank}`)).toHaveText("Give your words structure");
    await expect(shell.getByRole("button", { name: `Heading ${rank}`, exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(await editor.textContent()).toBe(original);
  }
  await expectAutosavedAction(status, () => shell.getByRole("button", { name: "Bold", exact: true }).click());
  await expect(editor.locator("h6 strong")).toHaveText("Give your words structure");
  await expectAutosavedAction(status, () => shell.getByRole("button", { name: "Highlight", exact: true }).click());
  await expect(editor.locator("h6 strong mark")).toHaveText("Give your words structure");
  await expectAutosavedAction(status, () => shell.getByRole("button", { name: "Paragraph", exact: true }).click());
  await expect(editor.locator(":scope > p")).toHaveCount(3);
  await expect(editor.locator("p strong mark")).toHaveText("Give your words structure");
  await expectAutosavedAction(status, () => shell.getByRole("button", { name: "Undo", exact: true }).click());
  await expect(editor.locator("h6 strong mark")).toHaveText("Give your words structure");
});

test("reload and independent backup recovery retain a heading redo branch", async ({ page }) => {
  let { editor, shell, status } = await open(page);
  await selectFirstBlock(editor);
  await shell.getByRole("button", { name: "Link", exact: true }).click();
  await shell.getByRole("textbox", { name: "Link URL", exact: true }).fill("https://example.test/headings");
  await expectAutosavedAction(status, () => shell.getByRole("button", { name: "Apply Link", exact: true }).click());
  await shell.getByRole("button", { name: "Text size", exact: true }).click();
  await shell.locator('select[name="example/text-size-step"]').selectOption("2");
  await expectAutosavedAction(status, () => shell.getByRole("button", { name: "Apply size", exact: true }).click());
  await expectAutosavedAction(status, () => shell.getByRole("button", { name: "Heading 4", exact: true }).click());
  await expectAutosavedAction(status, () => shell.getByRole("button", { name: "Undo", exact: true }).click());
  const saved = await backup(page, shell);
  expect(JSON.parse(saved).formatVersion).toBe(5);
  ({ editor, shell, status } = await open(page));
  await expect(editor.locator("h2")).toHaveText("Give your words structure");
  await expectAutosavedAction(status, () => shell.getByRole("button", { name: "Redo", exact: true }).click());
  await expect(editor.locator("h4")).toHaveText("Give your words structure");
  await expect(editor.locator("h4 a")).toHaveAttribute("href", "https://example.test/headings");
  await expect(editor.locator("h4 .breditor-text-size")).toHaveAttribute("data-breditor-integer-token", "huge");
  await page.getByLabel("Open session backup").setInputFiles({ name: "headings.json", mimeType: "application/json", buffer: Buffer.from(saved) });
  const recovered = page.getByRole("region", { name: "Recovered Breditor session editor" });
  await expect(recovered).toHaveAttribute("aria-busy", "false");
  await expect(recovered.locator(".editor-status")).toHaveText("Autosave is off.");
  expect(await backup(page, recovered)).toBe(saved);
  await recovered.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(recovered.getByRole("textbox").locator("h4")).toHaveText("Give your words structure");
  await recovered.getByRole("button", { name: "Paragraph", exact: true }).click();
  await expect(recovered.getByRole("textbox").locator(":scope > p")).toHaveCount(3);
  await expect(editor.locator("h4")).toHaveText("Give your words structure");
});

test("heading demo has accessible controls and no horizontal overflow", async ({ page, browserName }, testInfo) => {
  await open(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (browserName === "chromium") {
    await page.setViewportSize({ width: 1280, height: 960 });
    await page.screenshot({ path: testInfo.outputPath("heading_demo.png"), fullPage: true });
  }
});
