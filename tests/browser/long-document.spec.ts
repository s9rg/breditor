import { expect, test } from "@playwright/test";

/** Bounded correctness qualification, not a latency benchmark or native paste test. */
test("250 Unicode paragraphs retain backward selection and redo history across reload", async ({ page }) => {
  const paragraphs = Array.from({ length: 250 }, (_, index) =>
    `Block ${String(index).padStart(3, "0")}: 🙂 e\u0301 ${"stable text ".repeat(8)}`);
  const plainText = paragraphs.join("\n");
  await page.goto("/");
  await page.waitForFunction(() => window.__breditorHarness?.phase === "ready" ||
    window.__breditorStartupError !== undefined);
  expect(await page.evaluate(() => window.__breditorStartupError)).toBeUndefined();
  const editor = page.getByRole("textbox", { name: "Release gate rich-text editor" });
  await page.evaluate(() => window.__breditorHarness!.select(0, 0));
  const paste = await page.evaluate(text =>
    window.__breditorHarness!.clipboard("paste", { plainText: text }), plainText);
  expect(paste.defaultPrevented).toBe(true);
  await expect(editor.locator("p")).toHaveCount(paragraphs.length);
  expect(await editor.locator("p").allTextContents()).toEqual(paragraphs);
  const original = await page.evaluate(() => {
    const result = window.__breditorHarness!.exportContent("documentJson");
    if (!result.ok) throw new Error(result.error.code);
    return result.value;
  });

  // Real DOM selection, backwards across all blocks, including surrogate pairs
  // and combining marks. Clipboard data above remains a controlled fixture.
  await editor.evaluate(host => {
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode() as Text | null;
    if (!first) throw new Error("missing first text leaf");
    let last = first;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) last = node as Text;
    (host as HTMLElement).focus();
    document.getSelection()!.setBaseAndExtent(last, last.length, first, 0);
    document.dispatchEvent(new Event("selectionchange"));
  });
  const backwards = await page.evaluate(() => window.__breditorHarness!.selection());
  expect(backwards.direction).toBe("backward");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(editor.locator("strong")).toHaveCount(paragraphs.length);
  expect(await page.evaluate(() => window.__breditorHarness!.selection())).toEqual(backwards);
  const formatted = await page.evaluate(() => {
    const result = window.__breditorHarness!.exportContent("documentJson");
    if (!result.ok) throw new Error(result.error.code);
    return result.value;
  });
  expect(formatted).not.toBe(original);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(editor.locator("strong")).toHaveCount(0);
  expect(await page.evaluate(() => window.__breditorHarness!.flush())).toEqual({ status: "committed" });
  const saved = await page.evaluate(() => window.__breditorHarness!.snapshot().document);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-breditor-ready", "true");
  expect(await page.evaluate(() => window.__breditorHarness!.snapshot().document)).toEqual(saved);
  expect(await page.evaluate(() => window.__breditorHarness!.selection())).toEqual(backwards);
  expect(await page.evaluate(() => window.__breditorHarness!.exportContent("documentJson")))
    .toMatchObject({ ok: true, value: original });
  expect(await page.evaluate(() => window.__breditorHarness!.exportContent("plainText")))
    .toMatchObject({ ok: true, value: plainText });

  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect(await page.evaluate(() => window.__breditorHarness!.exportContent("documentJson")))
    .toMatchObject({ ok: true, value: formatted });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(editor.locator("p")).toHaveCount(1);
  await expect(editor).toHaveText("");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect(await page.evaluate(() => window.__breditorHarness!.exportContent("documentJson")))
    .toMatchObject({ ok: true, value: original });
  expect(await page.evaluate(() => window.__breditorHarness!.snapshot().status)).toEqual({ phase: "live" });
});
