import { expect, test } from "@playwright/test";

/** Bounded correctness qualification, not a latency benchmark or native paste test. */
test("250 Unicode paragraphs retain backward selection and redo history across reload", async ({ page }, testInfo) => {
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
  // Assert independent known coordinates, not just direction: an invalid
  // numeric baseline must never become the expected result for later steps.
  // Retain the original frozen object for failure-only transport diagnostics;
  // do not rerun selection acquisition or normalize a bad value into a pass.
  const selectionHandle = await page.evaluateHandle(() => window.__breditorHarness!.selection());
  const backwards = {anchorOffset: paragraphs.reduce((sum, text) => sum + text.length, 0),
    focusOffset: 0, direction: "backward" as const};
  try {
    expect(await selectionHandle.jsonValue()).toEqual(backwards);
  } catch (error) {
    const encoded = await selectionHandle.evaluate(snapshot => {
      const fields = Object.fromEntries((["anchorOffset", "focusOffset"] as const).map(key => {
        const value = snapshot[key], bits = new DataView(new ArrayBuffer(8));
        bits.setFloat64(0, value, false);
        return [key, {type: typeof value, decimal: String(value), json: JSON.stringify(value),
          bits: bits.getBigUint64(0, false).toString(16).padStart(16, "0")}];
      }));
      return JSON.stringify({frozen: Object.isFrozen(snapshot), direction: snapshot.direction, fields});
    });
    await testInfo.attach("original-selection-snapshot", {body: encoded, contentType: "application/json"});
    throw error;
  } finally {
    await selectionHandle.dispose();
  }
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
