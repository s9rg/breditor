import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const EDITOR_LABEL = "Breditor showcase document";
const SAMPLE_TEXT = "Breditor showcase";
const TARGET_TEXT = "showcase";
const TARGET_START = SAMPLE_TEXT.indexOf(TARGET_TEXT);
const FIRST_WORD = "Breditor";
const SECOND_PARAGRAPH = " showcase";
const APPENDED_TEXT = " demo-ready";
const REFERENCE_LINK_URL = "https://example.test/reference";
const CROSS_PARAGRAPH_LINK_INPUT =
  "HTTPS://Cross.Example.TEST:443/a/../guide?q=alpha&b=two";
const CROSS_PARAGRAPH_LINK_URL =
  "https://cross.example.test/guide?q=alpha&b=two";

async function openDemo(page: Page): Promise<{
  readonly editor: Locator;
  readonly status: Locator;
}> {
  await page.goto("/");

  const shell = page.getByRole("region", {
    name: `${EDITOR_LABEL} editor`,
  });
  const editor = page.getByRole("textbox", { name: EDITOR_LABEL });
  const status = shell.locator(".editor-status");

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
      if (selection === null)
        throw new Error("browser selection is unavailable");

      const textNodes: Text[] = [];
      const walker = ownerDocument.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      for (
        let node = walker.nextNode();
        node !== null;
        node = walker.nextNode()
      ) {
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

/**
 * Selects UTF-16 offsets within one projected paragraph. Paragraph-relative
 * offsets stay unambiguous after structural edits introduce more than one
 * block, while still exercising the public DOM-selection boundary.
 */
async function selectParagraphText(
  editor: Locator,
  paragraphIndex: number,
  anchorOffset: number,
  focusOffset: number,
): Promise<void> {
  await selectParagraphRange(
    editor,
    paragraphIndex,
    anchorOffset,
    paragraphIndex,
    focusOffset,
  );
}

/** Selects a semantic range whose endpoints may belong to different blocks. */
async function selectParagraphRange(
  editor: Locator,
  anchorParagraphIndex: number,
  anchorOffset: number,
  focusParagraphIndex: number,
  focusOffset: number,
): Promise<void> {
  await editor.evaluate(
    (host, offsets) => {
      const ownerDocument = host.ownerDocument;
      const selection = ownerDocument.getSelection();
      if (selection === null)
        throw new Error("browser selection is unavailable");

      const paragraphs = Array.from(host.children).filter(
        (child) => child.localName === "p",
      );
      const locate = (
        paragraphIndex: number,
        paragraphOffset: number,
      ): readonly [Text, number] => {
        if (!Number.isSafeInteger(paragraphOffset) || paragraphOffset < 0) {
          throw new Error("selection offset is invalid");
        }
        const paragraph = paragraphs.at(paragraphIndex);
        if (paragraph === undefined)
          throw new Error("paragraph is unavailable");

        const textNodes: Text[] = [];
        const walker = ownerDocument.createTreeWalker(
          paragraph,
          NodeFilter.SHOW_TEXT,
        );
        for (
          let node = walker.nextNode();
          node !== null;
          node = walker.nextNode()
        ) {
          textNodes.push(node as Text);
        }

        let consumed = 0;
        for (const textNode of textNodes) {
          const length = textNode.data.length;
          if (paragraphOffset <= consumed + length) {
            return [textNode, paragraphOffset - consumed] as const;
          }
          consumed += length;
        }
        throw new Error("selection offset exceeds paragraph text");
      };

      const [anchorNode, anchor] = locate(
        offsets.anchorParagraphIndex,
        offsets.anchorOffset,
      );
      const [focusNode, focus] = locate(
        offsets.focusParagraphIndex,
        offsets.focusOffset,
      );
      (host as HTMLElement).focus();
      selection.setBaseAndExtent(anchorNode, anchor, focusNode, focus);
      ownerDocument.dispatchEvent(new Event("selectionchange"));
    },
    {
      anchorParagraphIndex,
      anchorOffset,
      focusParagraphIndex,
      focusOffset,
    },
  );
}

/** Dispatches one native-shaped plain-text paste and its browser followups. */
async function pastePlainText(editor: Locator, text: string): Promise<void> {
  const outcome = await editor.evaluate((host, plainText) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", plainText);
    const paste = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      composed: true,
      clipboardData: transfer,
    });
    host.dispatchEvent(paste);

    // Browsers emit these after a cancelled paste. The editor consumes them as
    // duplicate native followups, so the test also covers that suppression.
    if (paste.defaultPrevented) {
      host.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          composed: true,
          inputType: "insertFromPaste",
        }),
      );
      host.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          composed: true,
          inputType: "insertFromPaste",
        }),
      );
    }

    return {
      defaultPrevented: paste.defaultPrevented,
      plainText: (paste.clipboardData ?? transfer).getData("text/plain"),
    };
  }, text);

  expect(outcome).toEqual({ defaultPrevented: true, plainText: text });
}

/**
 * Checks text and full inline-format coverage without depending on how many
 * equivalent adjacent runs the canonical projection chooses to expose.
 */
async function expectSafelyLinkedParagraphs(
  editor: Locator,
  expectedText: readonly string[],
  expectedLinkUrl = REFERENCE_LINK_URL,
): Promise<void> {
  await expect
    .poll(() =>
      editor.locator(":scope > p").evaluateAll(
        (paragraphs, referenceLinkUrl) =>
          paragraphs.map((paragraph) => {
            const links = Array.from(
              paragraph.querySelectorAll("a.breditor-link"),
            );
            const highlights = Array.from(
              paragraph.querySelectorAll("mark.breditor-reference-highlight"),
            );
            const textNodes: Text[] = [];
            const walker = paragraph.ownerDocument.createTreeWalker(
              paragraph,
              NodeFilter.SHOW_TEXT,
            );
            for (
              let node = walker.nextNode();
              node !== null;
              node = walker.nextNode()
            ) {
              if ((node.textContent ?? "").length > 0)
                textNodes.push(node as Text);
            }
            return {
              text: paragraph.textContent ?? "",
              fullyLinked:
                links.length > 0 &&
                textNodes.every((node) =>
                  links.some((link) => link.contains(node)),
                ),
              safeLinkAttributes: links.every(
                (link) =>
                  link.getAttribute("href") === referenceLinkUrl &&
                  link.getAttribute("rel") === "noopener noreferrer" &&
                  link.getAttribute("target") === "_blank",
              ),
              highlightPreserved:
                highlights.length > 0 &&
                textNodes.every((node) =>
                  highlights.some((highlight) => highlight.contains(node)),
                ),
            };
          }),
        expectedLinkUrl,
      ),
    )
    .toEqual(
      expectedText.map((text) => ({
        text,
        fullyLinked: true,
        safeLinkAttributes: true,
        highlightPreserved: true,
      })),
    );
}

/** Checks that Highlight still covers every character after Link is removed. */
async function expectHighlightedUnlinkedParagraphs(
  editor: Locator,
  expectedText: readonly string[],
): Promise<void> {
  await expect
    .poll(() =>
      editor.locator(":scope > p").evaluateAll((paragraphs) =>
        paragraphs.map((paragraph) => {
          const highlights = Array.from(
            paragraph.querySelectorAll("mark.breditor-reference-highlight"),
          );
          const textNodes: Text[] = [];
          const walker = paragraph.ownerDocument.createTreeWalker(
            paragraph,
            NodeFilter.SHOW_TEXT,
          );
          for (
            let node = walker.nextNode();
            node !== null;
            node = walker.nextNode()
          ) {
            if ((node.textContent ?? "").length > 0)
              textNodes.push(node as Text);
          }
          return {
            text: paragraph.textContent ?? "",
            linkCount: paragraph.querySelectorAll("a.breditor-link").length,
            highlightPreserved:
              highlights.length > 0 &&
              textNodes.every((node) =>
                highlights.some((highlight) => highlight.contains(node)),
              ),
          };
        }),
      ),
    )
    .toEqual(
      expectedText.map((text) => ({
        text,
        linkCount: 0,
        highlightPreserved: true,
      })),
    );
}

/** Checks exact Link segments while requiring Highlight to cover all text. */
async function expectHighlightedLinkLayout(
  editor: Locator,
  expected: readonly {
    readonly text: string;
    readonly links: readonly {
      readonly text: string;
      readonly href: string;
    }[];
  }[],
): Promise<void> {
  await expect
    .poll(() =>
      editor.locator(":scope > p").evaluateAll((paragraphs) =>
        paragraphs.map((paragraph) => {
          const highlights = Array.from(
            paragraph.querySelectorAll("mark.breditor-reference-highlight"),
          );
          const textNodes: Text[] = [];
          const walker = paragraph.ownerDocument.createTreeWalker(
            paragraph,
            NodeFilter.SHOW_TEXT,
          );
          for (
            let node = walker.nextNode();
            node !== null;
            node = walker.nextNode()
          ) {
            if ((node.textContent ?? "").length > 0)
              textNodes.push(node as Text);
          }
          return {
            text: paragraph.textContent ?? "",
            links: Array.from(
              paragraph.querySelectorAll("a.breditor-link"),
            ).map((link) => ({
              text: link.textContent ?? "",
              href: link.getAttribute("href") ?? "",
              rel: link.getAttribute("rel"),
              target: link.getAttribute("target"),
            })),
            highlightPreserved:
              highlights.length > 0 &&
              textNodes.every((node) =>
                highlights.some((highlight) => highlight.contains(node)),
              ),
          };
        }),
      ),
    )
    .toEqual(
      expected.map(({ text, links }) => ({
        text,
        links: links.map((link) => ({
          ...link,
          rel: "noopener noreferrer",
          target: "_blank",
        })),
        highlightPreserved: true,
      })),
    );
}

/**
 * Proves the canonical renderer emits one deterministic wrapper path for each
 * uniformly formatted paragraph. Attribute order and browser serialization
 * are intentionally ignored; element order, classes, safe Link attributes,
 * text, and the single-branch topology are exact.
 */
async function expectUniformShowcaseTree(
  editor: Locator,
  expectedText: readonly string[],
  expectedChain: readonly string[],
): Promise<void> {
  await expect
    .poll(() =>
      editor.locator(":scope > p").evaluateAll((paragraphs) =>
        paragraphs.map((paragraph) => {
          const chain: string[] = [];
          let singleBranch = true;
          let current: Element = paragraph;
          while (current.firstElementChild !== null) {
            if (
              current.children.length !== 1 ||
              current.childNodes.length !== 1
            ) {
              singleBranch = false;
            }
            current = current.firstElementChild;
            const classes = Array.from(current.classList).sort();
            chain.push(
              `${current.localName}${classes.map((name) => `.${name}`).join("")}`,
            );
          }
          if (
            current.childNodes.length !== 1 ||
            current.firstChild?.nodeType !== Node.TEXT_NODE
          ) {
            singleBranch = false;
          }
          const link = paragraph.querySelector(":scope > a.breditor-link");
          return {
            text: paragraph.textContent ?? "",
            chain,
            singleBranch,
            link: {
              href: link?.getAttribute("href") ?? null,
              rel: link?.getAttribute("rel") ?? null,
              target: link?.getAttribute("target") ?? null,
            },
          };
        }),
      ),
    )
    .toEqual(
      expectedText.map((text) => ({
        text,
        chain: [...expectedChain],
        singleBranch: true,
        link: expectedChain.includes("a.breditor-link")
          ? {
              href: REFERENCE_LINK_URL,
              rel: "noopener noreferrer",
              target: "_blank",
            }
          : { href: null, rel: null, target: null },
      })),
    );
}

test("the React demo edits, formats, replays, persists, and remains accessible", async ({
  page,
}) => {
  const { editor, status } = await openDemo(page);
  const toolbar = page.getByRole("toolbar", { name: "Editor controls" });
  const bold = page.getByRole("button", { name: "Bold" });
  const highlight = page.getByRole("button", { name: "Highlight" });
  const link = page.getByRole("button", { name: "Link" });
  const undo = page.getByRole("button", { name: "Undo" });
  const redo = page.getByRole("button", { name: "Redo" });
  const linkUrl = page.getByRole("textbox", { name: "Link URL" });
  const newWindow = page.getByRole("checkbox", { name: "Open in new window" });
  const applyLink = page.getByRole("button", { name: "Apply Link" });
  const removeLink = page.getByRole("button", { name: "Remove Link" });

  await expect(editor).toHaveText(SAMPLE_TEXT);
  await expect(editor.locator("mark.breditor-reference-highlight")).toHaveText(
    SAMPLE_TEXT,
  );
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

  // The runtime-owned form intentionally takes DOM focus. The typed intent still
  // acts on the Rust-owned semantic range selected immediately beforehand.
  await selectEditorText(editor, 0, SAMPLE_TEXT.length);
  await expect(highlight).toHaveAttribute("aria-pressed", "true");
  await link.click();
  await expect(linkUrl).toBeEnabled();
  await expect(linkUrl).toHaveValue(REFERENCE_LINK_URL);
  await expect(newWindow).toBeChecked();
  await expect(applyLink).toBeEnabled();
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
  await expect(linkUrl).toHaveValue(
    "HTTPS://Example.COM:443/a/../docs?q=one&b=two",
  );
  await expect(newWindow).not.toBeChecked();

  await undo.click();
  await expect(editor.locator("a.breditor-link")).toHaveAttribute(
    "href",
    "https://example.test/reference",
  );
  await expect(linkUrl).toHaveValue(REFERENCE_LINK_URL);
  await expect(newWindow).toBeChecked();
  await redo.click();
  await expect(editor.locator("a.breditor-link")).toHaveAttribute(
    "href",
    "https://example.com/docs?q=one&b=two",
  );
  await expect(linkUrl).toHaveValue(
    "HTTPS://Example.COM:443/a/../docs?q=one&b=two",
  );
  await expect(newWindow).not.toBeChecked();
  await expect(removeLink).toBeEnabled();
  await removeLink.click();
  await expect(editor.locator("a.breditor-link")).toHaveCount(0);
  await expect(linkUrl).toHaveValue("");
  await expect(newWindow).not.toBeChecked();
  await expect(applyLink).toBeDisabled();
  await undo.click();
  await expect(editor.locator("a.breditor-link")).toHaveAttribute(
    "href",
    "https://example.com/docs?q=one&b=two",
  );
  await expect(linkUrl).toHaveValue(
    "HTTPS://Example.COM:443/a/../docs?q=one&b=two",
  );
  await expect(newWindow).not.toBeChecked();

  await selectEditorText(editor, TARGET_START, SAMPLE_TEXT.length);
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await bold.click();
  await expect(editor.locator("strong")).toHaveText(TARGET_TEXT);
  await expect(bold).toHaveAttribute("aria-pressed", "true");

  await undo.click();
  await expect(editor.locator("strong")).toHaveCount(0);
  await expect(editor.locator("mark.breditor-reference-highlight")).toHaveText(
    SAMPLE_TEXT,
  );

  await redo.click();
  await expect(editor.locator("strong")).toHaveText(TARGET_TEXT);

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
    TARGET_TEXT + APPENDED_TEXT,
  );
  await expect(
    restored.editor.locator("mark.breditor-reference-highlight"),
  ).toHaveText([`${FIRST_WORD} `, TARGET_TEXT + APPENDED_TEXT]);
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

test("the nine-control Showcase composes and clears deterministic formats across paragraphs and persistence", async ({
  page,
}) => {
  const { editor, status } = await openDemo(page);
  const toolbar = page.getByRole("toolbar", { name: "Editor controls" });
  const topLevelControls = toolbar.locator(":scope > button");
  const bold = page.getByRole("button", { name: "Bold" });
  const italic = page.getByRole("button", { name: "Italic" });
  const strikethrough = page.getByRole("button", { name: "Strikethrough" });
  const code = page.getByRole("button", { name: "Code" });
  const clearFormatting = page.getByRole("button", { name: "Clear formatting" });
  const undo = page.getByRole("button", { name: "Undo" });
  const redo = page.getByRole("button", { name: "Redo" });

  await expect(topLevelControls).toHaveText([
    "Bold",
    "Italic",
    "Strikethrough",
    "Code",
    "Highlight",
    "Link",
    "Clear formatting",
    "Undo",
    "Redo",
  ]);
  await expect(topLevelControls).toHaveCount(9);
  for (const control of [bold, italic, strikethrough, code]) {
    await expect(control).toBeVisible();
    await expect(control).toHaveAttribute("aria-pressed", "false");
  }

  // Split the initially highlighted safe Link, then apply every property-free
  // Showcase format through one real backward DOM selection spanning blocks.
  await selectEditorText(editor, FIRST_WORD.length, FIRST_WORD.length);
  await page.keyboard.press("Enter");
  await expectUniformShowcaseTree(
    editor,
    [FIRST_WORD, SECOND_PARAGRAPH],
    ["a.breditor-link", "mark.breditor-reference-highlight"],
  );
  await selectParagraphRange(
    editor,
    1,
    SECOND_PARAGRAPH.length,
    0,
    0,
  );

  await bold.click();
  await italic.click();
  await strikethrough.click();
  await code.click();
  await expectUniformShowcaseTree(
    editor,
    [FIRST_WORD, SECOND_PARAGRAPH],
    [
      "a.breditor-link",
      "strong",
      "em",
      "mark.breditor-reference-highlight",
      "s",
      "code",
    ],
  );
  for (const control of [bold, italic, strikethrough, code]) {
    await expect(control).toHaveAttribute("aria-pressed", "true");
  }

  // Each undo removes exactly the latest semantic format and each redo restores
  // it in the same canonical position without disturbing Highlight or Link.
  await undo.click();
  await expectUniformShowcaseTree(
    editor,
    [FIRST_WORD, SECOND_PARAGRAPH],
    [
      "a.breditor-link",
      "strong",
      "em",
      "mark.breditor-reference-highlight",
      "s",
    ],
  );
  await expect(code).toHaveAttribute("aria-pressed", "false");
  await undo.click();
  await expectUniformShowcaseTree(
    editor,
    [FIRST_WORD, SECOND_PARAGRAPH],
    [
      "a.breditor-link",
      "strong",
      "em",
      "mark.breditor-reference-highlight",
    ],
  );
  await expect(strikethrough).toHaveAttribute("aria-pressed", "false");
  await undo.click();
  await expectUniformShowcaseTree(
    editor,
    [FIRST_WORD, SECOND_PARAGRAPH],
    ["a.breditor-link", "strong", "mark.breditor-reference-highlight"],
  );
  await expect(italic).toHaveAttribute("aria-pressed", "false");
  await undo.click();
  await expectUniformShowcaseTree(
    editor,
    [FIRST_WORD, SECOND_PARAGRAPH],
    ["a.breditor-link", "mark.breditor-reference-highlight"],
  );
  await expect(bold).toHaveAttribute("aria-pressed", "false");

  await redo.click();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await redo.click();
  await expect(italic).toHaveAttribute("aria-pressed", "true");
  await redo.click();
  await expect(strikethrough).toHaveAttribute("aria-pressed", "true");
  await redo.click();
  await expectUniformShowcaseTree(
    editor,
    [FIRST_WORD, SECOND_PARAGRAPH],
    [
      "a.breditor-link",
      "strong",
      "em",
      "mark.breditor-reference-highlight",
      "s",
      "code",
    ],
  );
  await expect(code).toHaveAttribute("aria-pressed", "true");

  // Clear all base and extension formats across the backward block selection
  // as one Rust transaction, then restore that exact tree with one undo.
  await clearFormatting.click();
  await expectUniformShowcaseTree(
    editor,
    [FIRST_WORD, SECOND_PARAGRAPH],
    [],
  );
  await expect(clearFormatting).toHaveAttribute("aria-disabled", "true");
  await undo.click();
  await expectUniformShowcaseTree(
    editor,
    [FIRST_WORD, SECOND_PARAGRAPH],
    [
      "a.breditor-link",
      "strong",
      "em",
      "mark.breditor-reference-highlight",
      "s",
      "code",
    ],
  );
  await expect(clearFormatting).toHaveAttribute("aria-disabled", "false");

  await expect(status).toHaveText("All changes saved.", { timeout: 10_000 });

  await page.reload();
  const restored = await openDemo(page);
  await expectUniformShowcaseTree(
    restored.editor,
    [FIRST_WORD, SECOND_PARAGRAPH],
    [
      "a.breditor-link",
      "strong",
      "em",
      "mark.breditor-reference-highlight",
      "s",
      "code",
    ],
  );
  await expect(page.getByRole("button", { name: "Italic" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Link" }).click();
  await expect(page.getByRole("textbox", { name: "Link URL" })).toHaveValue(
    REFERENCE_LINK_URL,
  );
  await expect(
    page.getByRole("checkbox", { name: "Open in new window" }),
  ).toBeChecked();
});

test("safe Link survives structural editing and persisted undo/redo history", async ({
  page,
}) => {
  const { editor, status } = await openDemo(page);
  const undo = page.getByRole("button", { name: "Undo" });
  const redo = page.getByRole("button", { name: "Redo" });

  await expectSafelyLinkedParagraphs(editor, [SAMPLE_TEXT]);

  // Split the existing Link in the middle. Both resulting paragraphs retain
  // its typed properties rather than degrading to an untyped format id.
  await selectEditorText(editor, FIRST_WORD.length, FIRST_WORD.length);
  await page.keyboard.press("Enter");
  await expectSafelyLinkedParagraphs(editor, [FIRST_WORD, SECOND_PARAGRAPH]);

  // Insert multiple paragraphs inside the second linked run. Plain text is
  // deliberately used so inherited formatting comes from the destination.
  await selectParagraphText(editor, 1, 1, 1);
  await pastePlainText(editor, "first\nsecond");
  await expectSafelyLinkedParagraphs(editor, [
    FIRST_WORD,
    " first",
    `second${TARGET_TEXT}`,
  ]);

  // Joining at a block boundary must preserve both sides' safe Link values.
  await selectParagraphText(editor, 2, 0, 0);
  await page.keyboard.press("Backspace");
  await expectSafelyLinkedParagraphs(editor, [
    FIRST_WORD,
    ` firstsecond${TARGET_TEXT}`,
  ]);

  // Leave the cursor before the join so autosave has both an undo and a redo
  // branch to restore, rather than persisting only the current document.
  await expect(undo).toHaveAttribute("aria-disabled", "false");
  await undo.click();
  // Observe the dirty publication before DOM/property assertions consume the
  // short autosave window; otherwise a slow CI worker can already be idle.
  await expect(status).not.toHaveText("All changes saved.");
  await expectSafelyLinkedParagraphs(editor, [
    FIRST_WORD,
    " first",
    `second${TARGET_TEXT}`,
  ]);
  await expect(undo).toHaveAttribute("aria-disabled", "false");
  await expect(redo).toHaveAttribute("aria-disabled", "false");

  await expect(status).toHaveText("All changes saved.", { timeout: 10_000 });

  await page.reload();
  const restored = await openDemo(page);
  const restoredUndo = page.getByRole("button", { name: "Undo" });
  const restoredRedo = page.getByRole("button", { name: "Redo" });
  await expectSafelyLinkedParagraphs(restored.editor, [
    FIRST_WORD,
    " first",
    `second${TARGET_TEXT}`,
  ]);
  await expect(restoredUndo).toHaveAttribute("aria-disabled", "false");
  await expect(restoredRedo).toHaveAttribute("aria-disabled", "false");

  await restoredRedo.click();
  await expectSafelyLinkedParagraphs(restored.editor, [
    FIRST_WORD,
    ` firstsecond${TARGET_TEXT}`,
  ]);
  await expect(restoredUndo).toHaveAttribute("aria-disabled", "false");
  await expect(restoredRedo).toHaveAttribute("aria-disabled", "true");
});

test("cross-paragraph Link changes preserve Highlight and a persisted redo branch", async ({
  page,
}) => {
  const { editor, status } = await openDemo(page);
  const undo = page.getByRole("button", { name: "Undo" });
  const redo = page.getByRole("button", { name: "Redo" });
  const link = page.getByRole("button", { name: "Link" });
  const linkUrl = page.getByRole("textbox", { name: "Link URL" });
  const newWindow = page.getByRole("checkbox", { name: "Open in new window" });
  const applyLink = page.getByRole("button", { name: "Apply Link" });
  const removeLink = page.getByRole("button", { name: "Remove Link" });
  const paragraphs = [FIRST_WORD, SECOND_PARAGRAPH] as const;
  const linkedLayout = [
    {
      text: paragraphs[0],
      links: [
        { text: "Br", href: REFERENCE_LINK_URL },
        { text: "editor", href: CROSS_PARAGRAPH_LINK_URL },
      ],
    },
    {
      text: paragraphs[1],
      links: [
        { text: " sho", href: CROSS_PARAGRAPH_LINK_URL },
        { text: "wcase", href: REFERENCE_LINK_URL },
      ],
    },
  ] as const;
  const removedLayout = [
    {
      text: paragraphs[0],
      links: [{ text: "Br", href: REFERENCE_LINK_URL }],
    },
    {
      text: paragraphs[1],
      links: [{ text: "wcase", href: REFERENCE_LINK_URL }],
    },
  ] as const;

  // Start from the property-preserving split proven above, then address a
  // backward partial range across both Rust-owned paragraphs. The outer
  // Link runs are deliberately left unselected as an end-to-end edge guard.
  await selectEditorText(editor, FIRST_WORD.length, FIRST_WORD.length);
  await page.keyboard.press("Enter");
  await expectSafelyLinkedParagraphs(editor, paragraphs);
  await selectParagraphRange(editor, 1, 4, 0, 2);

  // Form focus intentionally replaces the DOM selection. The typed intent
  // must still use the preserved cross-paragraph semantic selection.
  await link.click();
  await expect(linkUrl).toBeEnabled();
  await expect(linkUrl).toHaveValue(REFERENCE_LINK_URL);
  await expect(newWindow).toBeChecked();
  await linkUrl.fill(CROSS_PARAGRAPH_LINK_INPUT);
  await newWindow.check();
  await expect(applyLink).toBeEnabled();
  await applyLink.click();
  await expectHighlightedLinkLayout(editor, linkedLayout);
  await expect(linkUrl).toHaveValue(CROSS_PARAGRAPH_LINK_INPUT);
  await expect(newWindow).toBeChecked();

  await expect(removeLink).toBeEnabled();
  await removeLink.click();
  await expectHighlightedLinkLayout(editor, removedLayout);
  await expect(linkUrl).toHaveValue("");
  await expect(newWindow).not.toBeChecked();

  // Expanding the selection across linked edges and the unlinked middle must
  // expose the Rust-generated mixed presence state to the React controls.
  await selectParagraphRange(editor, 0, 0, 1, paragraphs[1].length);
  await expect(
    page.getByText("Link is mixed.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(linkUrl).toHaveValue("");
  await expect(newWindow).not.toBeChecked();
  await expect(removeLink).toBeEnabled();

  await undo.click();
  await expectHighlightedLinkLayout(editor, linkedLayout);
  await redo.click();
  await expectHighlightedLinkLayout(editor, removedLayout);

  // Persist the linked document with removal available as redo. Observe the
  // dirty edge first so a slow assertion cannot miss the short autosave delay.
  await undo.click();
  await expect(status).not.toHaveText("All changes saved.");
  await expectHighlightedLinkLayout(editor, linkedLayout);
  await expect(undo).toHaveAttribute("aria-disabled", "false");
  await expect(redo).toHaveAttribute("aria-disabled", "false");
  await expect(status).toHaveText("All changes saved.", { timeout: 10_000 });

  await page.reload();
  const restored = await openDemo(page);
  const restoredUndo = page.getByRole("button", { name: "Undo" });
  const restoredRedo = page.getByRole("button", { name: "Redo" });
  await expectHighlightedLinkLayout(restored.editor, linkedLayout);
  await expect(restoredUndo).toHaveAttribute("aria-disabled", "false");
  await expect(restoredRedo).toHaveAttribute("aria-disabled", "false");

  await restoredRedo.click();
  await expectHighlightedLinkLayout(restored.editor, removedLayout);
  await expect(restoredUndo).toHaveAttribute("aria-disabled", "false");
  await expect(restoredRedo).toHaveAttribute("aria-disabled", "true");
});

test("ordinary keyboard typing continues after a trailing space at a formatted boundary", async ({
  page,
}) => {
  const { editor } = await openDemo(page);
  const bold = page.getByRole("button", { name: "Bold" });
  const undo = page.getByRole("button", { name: "Undo" });
  const redo = page.getByRole("button", { name: "Redo" });

  await selectEditorText(editor, TARGET_START, SAMPLE_TEXT.length);
  await bold.click();
  await undo.click();
  await redo.click();

  await selectEditorText(editor, SAMPLE_TEXT.length, SAMPLE_TEXT.length);
  await page.keyboard.type(" xy", { delay: 25 });

  await expect(editor).toHaveText(SAMPLE_TEXT + " xy");
  await expect(editor.locator("strong")).toHaveText(`${TARGET_TEXT} xy`);
});
