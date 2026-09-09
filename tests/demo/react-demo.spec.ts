import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const EDITOR_LABEL = "Breditor formatting reference document";
const SAMPLE_TEXT = "Highlighted link";
const APPENDED_TEXT = " demo-ready";

async function openDemo(page: Page): Promise<{
  readonly editor: Locator;
  readonly status: Locator;
}> {
  await page.goto("/");

  const shell = page.getByRole("region", {
    name: `${EDITOR_LABEL} editor`,
  });
  const editor = page.getByRole("textbox", { name: EDITOR_LABEL });
  const status = shell.getByRole("status");

  await expect(shell).toHaveAttribute("aria-busy", "false");
  await expect(editor).toHaveAttribute("contenteditable", "true");
  await expect(status).toHaveText("All changes saved.");
  return { editor, status };
}

/**
 * Selects UTF-16 text offsets in the rendered editor, then emits the native
 * selectionchange event consumed by the browser adapter. This leaves all
 * mutation work to real toolbar clicks and browser keyboard input.
 */
async function selectEditorText(
  editor: Locator,
  anchorOffset: number,
  focusOffset: number,
): Promise<void> {
  await editor.evaluate(
    (host, offsets) => {
      const ownerDocument = host.ownerDocument;
      const selection = ownerDocument.getSelection();
      if (selection === null) throw new Error("browser selection is unavailable");

      const textNodes: Text[] = [];
      const walker = ownerDocument.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        textNodes.push(node as Text);
      }

      const locate = (absoluteOffset: number): readonly [Text, number] => {
        if (!Number.isSafeInteger(absoluteOffset) || absoluteOffset < 0) {
          throw new Error("selection offset is invalid");
        }
        let consumed = 0;
        for (const textNode of textNodes) {
          const length = textNode.data.length;
          if (absoluteOffset <= consumed + length) {
            return [textNode, absoluteOffset - consumed] as const;
          }
          consumed += length;
        }
        throw new Error("selection offset exceeds editor text");
      };

      const [anchorNode, anchor] = locate(offsets.anchorOffset);
      const [focusNode, focus] = locate(offsets.focusOffset);
      host.focus();
      selection.setBaseAndExtent(anchorNode, anchor, focusNode, focus);
      ownerDocument.dispatchEvent(new Event("selectionchange"));
    },
    { anchorOffset, focusOffset },
  );
}

test("the React demo edits, formats, replays, persists, and remains accessible", async ({
  page,
}) => {
  const { editor, status } = await openDemo(page);
  const toolbar = page.getByRole("toolbar", { name: "Editor controls" });
  const bold = page.getByRole("button", { name: "Bold" });
  const highlight = page.getByRole("button", { name: "Highlight" });
  const undo = page.getByRole("button", { name: "Undo" });
  const redo = page.getByRole("button", { name: "Redo" });
  const linkUrl = page.getByRole("textbox", { name: "Link URL" });
  const newWindow = page.getByRole("checkbox", { name: "Open in new window" });
  const applyLink = page.getByRole("button", { name: "Apply Link" });
  const removeLink = page.getByRole("button", { name: "Remove Link" });

  await expect(editor).toHaveText(SAMPLE_TEXT);
  await expect(
    editor.locator("mark.breditor-reference-highlight"),
  ).toHaveText(SAMPLE_TEXT);
  await expect(editor.locator("a.breditor-link")).toHaveAttribute(
    "href",
    "https://example.test/reference",
  );
  await expect(editor.locator("a.breditor-link")).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  await expect(editor.locator("a.breditor-link")).toHaveAttribute(
    "target",
    "_blank",
  );

  // The React-owned form intentionally takes DOM focus. The typed intent still
  // acts on the Rust-owned semantic range selected immediately beforehand.
  await selectEditorText(editor, 0, SAMPLE_TEXT.length);
  await expect(highlight).toHaveAttribute("aria-pressed", "true");
  await expect(linkUrl).toBeEnabled();
  await expect(applyLink).toBeDisabled();
  await linkUrl.fill("HTTPS://Example.COM:443/a/../docs?q=one&b=two");
  await expect(applyLink).toBeEnabled();
  await newWindow.uncheck();
  await applyLink.click();
  await expect(editor.locator("a.breditor-link")).toHaveAttribute(
    "href",
    "https://example.com/docs?q=one&b=two",
  );
  await expect(editor.locator("a.breditor-link")).not.toHaveAttribute("target");
  await expect(page.getByText("Link applied.", { exact: true })).toBeVisible();

  await undo.click();
  await expect(editor.locator("a.breditor-link")).toHaveAttribute(
    "href",
    "https://example.test/reference",
  );
  await redo.click();
  await expect(editor.locator("a.breditor-link")).toHaveAttribute(
    "href",
    "https://example.com/docs?q=one&b=two",
  );
  await expect(removeLink).toBeEnabled();
  await removeLink.click();
  await expect(editor.locator("a.breditor-link")).toHaveCount(0);
  await expect(applyLink).toBeEnabled();
  await undo.click();
  await expect(editor.locator("a.breditor-link")).toHaveAttribute(
    "href",
    "https://example.com/docs?q=one&b=two",
  );

  await selectEditorText(editor, 12, 16);
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await bold.click();
  await expect(editor.locator("strong")).toHaveText("link");
  await expect(bold).toHaveAttribute("aria-pressed", "true");

  await undo.click();
  await expect(editor.locator("strong")).toHaveCount(0);
  await expect(editor.locator("mark.breditor-reference-highlight")).toHaveText(
    SAMPLE_TEXT,
  );

  await redo.click();
  await expect(editor.locator("strong")).toHaveText("link");

  await selectEditorText(editor, SAMPLE_TEXT.length, SAMPLE_TEXT.length);
  await page.keyboard.type(APPENDED_TEXT, { delay: 25 });
  await expect(editor).toHaveText(SAMPLE_TEXT + APPENDED_TEXT);

  // Observe a dirty state before accepting the final idle state, so this
  // assertion cannot pass merely because the initial document was idle.
  await expect(status).not.toHaveText("All changes saved.");
  await expect(status).toHaveText("All changes saved.", { timeout: 10_000 });

  await page.reload();
  const restored = await openDemo(page);
  await expect(restored.editor).toHaveText(SAMPLE_TEXT + APPENDED_TEXT);
  await expect(restored.editor.locator("strong")).toHaveText(
    "link" + APPENDED_TEXT,
  );
  await expect(
    restored.editor.locator("mark.breditor-reference-highlight"),
  ).toHaveText(["Highlighted ", "link" + APPENDED_TEXT]);
  const restoredLinks = restored.editor.locator("a.breditor-link");
  await expect(restoredLinks).toHaveCount(2);
  expect(
    await restoredLinks.evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")),
    ),
  ).toEqual([
    "https://example.com/docs?q=one&b=two",
    "https://example.com/docs?q=one&b=two",
  ]);
  await expect(page.getByRole("button", { name: "Highlight" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.setViewportSize({ width: 320, height: 800 });
  await expect(toolbar).toBeVisible();
  const containment = await toolbar.evaluate((element) => {
    const toolbarBounds = element.getBoundingClientRect();
    const buttons = Array.from(element.querySelectorAll("button"));
    return {
      toolbarClientWidth: element.clientWidth,
      toolbarScrollWidth: element.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      buttonRows: new Set(
        buttons.map((button) => Math.round(button.getBoundingClientRect().top)),
      ).size,
      buttonsInside: buttons.every((button) => {
        const bounds = button.getBoundingClientRect();
        return (
          bounds.left >= toolbarBounds.left - 1 &&
          bounds.right <= toolbarBounds.right + 1
        );
      }),
    };
  });
  expect(containment.toolbarScrollWidth).toBeLessThanOrEqual(
    containment.toolbarClientWidth,
  );
  expect(containment.documentScrollWidth).toBeLessThanOrEqual(
    containment.documentClientWidth,
  );
  expect(containment.buttonsInside).toBe(true);
  expect(containment.buttonRows).toBeGreaterThan(1);
});

test(
  "ordinary keyboard typing continues after a trailing space at a formatted boundary",
  async ({ page }) => {
    const { editor } = await openDemo(page);
    const bold = page.getByRole("button", { name: "Bold" });
    const undo = page.getByRole("button", { name: "Undo" });
    const redo = page.getByRole("button", { name: "Redo" });

    await selectEditorText(editor, 12, 16);
    await bold.click();
    await undo.click();
    await redo.click();

    await selectEditorText(editor, SAMPLE_TEXT.length, SAMPLE_TEXT.length);
    await page.keyboard.type(" xy", { delay: 25 });

    await expect(editor).toHaveText(SAMPLE_TEXT + " xy");
    await expect(editor.locator("strong")).toHaveText("link xy");
  },
);
