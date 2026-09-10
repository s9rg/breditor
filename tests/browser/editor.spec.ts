import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function openEditor(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForFunction(
    () =>
      window.__breditorHarness?.phase === "ready" ||
      window.__breditorStartupError !== undefined,
  );
  const startupError = await page.evaluate(() => window.__breditorStartupError);
  expect(startupError).toBeUndefined();
  await expect(page.locator("html")).toHaveAttribute("data-breditor-ready", "true");
  await expect(page.getByRole("textbox", { name: "Release gate rich-text editor" }))
    .toHaveAttribute("contenteditable", "true");
}

async function mountReferenceFormatting(
  page: Page,
  toolbarInShadow = false,
): Promise<Readonly<{
  probeId: string;
  editorLabel: string;
  text: string;
}>> {
  return page.evaluate(async (useShadow) => {
    const harness = window.__breditorHarness;
    if (harness === undefined) throw new Error("browser harness is unavailable");
    return harness.mountReferenceFormatting(useShadow);
  }, toolbarInShadow);
}

async function select(page: Page, anchor: number, focus: number): Promise<void> {
  await page.evaluate(
    ([anchorOffset, focusOffset]) =>
      window.__breditorHarness?.select(anchorOffset, focusOffset),
    [anchor, focus] as const,
  );
}

async function beforeInput(
  page: Page,
  inputType: string,
  data: string | null,
): Promise<void> {
  const before = await page.evaluate(() =>
    window.__breditorHarness?.snapshot().document.revision,
  );
  const prevented = await page.evaluate(
    ([type, value]) => window.__breditorHarness?.beforeInput(type, value),
    [inputType, data] as const,
  );
  expect(prevented).toBe(true);
  const after = await page.evaluate(() =>
    window.__breditorHarness?.snapshot().document.revision,
  );
  expect(after).not.toBe(before);
  expect(
    await page.evaluate(() => window.__breditorHarness?.snapshot().status),
  ).toEqual({ phase: "live" });
}

async function insert(page: Page, text: string): Promise<void> {
  await beforeInput(page, "insertText", text);
  await expect(page.getByRole("textbox")).toHaveText(text);
}

async function expectVisibleOutline(
  target: ReturnType<Page["locator"]>,
): Promise<void> {
  const outline = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThan(0);
}

function canonicalSingleParagraphDocument(text: string): string {
  return JSON.stringify({
    format: "breditor/document",
    formatVersion: 1,
    schema: { name: "breditor/base", version: 1 },
    root: {
      kind: "element",
      type: "breditor/document",
      entityId: null,
      properties: {},
      children: [
        {
          kind: "element",
          type: "breditor/paragraph",
          entityId: null,
          properties: {},
          children:
            text.length === 0
              ? []
              : [{ kind: "text", text, formats: [] }],
        },
      ],
    },
  });
}

async function expectPublicExports(
  page: Page,
  text: string,
  snapshot: Readonly<{ lineage: string; revision: string }>,
): Promise<void> {
  const exports = await page.evaluate(() => ({
    plainText: window.__breditorHarness?.exportContent("plainText"),
    documentJson: window.__breditorHarness?.exportContent("documentJson"),
    current: window.__breditorHarness?.snapshot().document,
  }));
  const documentJson = canonicalSingleParagraphDocument(text);

  expect(exports.current).toEqual(snapshot);
  expect(exports.plainText).toEqual({
    ok: true,
    format: "plainText",
    value: text,
    utf8Bytes: new TextEncoder().encode(text).byteLength,
    snapshot,
  });
  expect(exports.documentJson).toEqual({
    ok: true,
    format: "documentJson",
    value: documentJson,
    utf8Bytes: new TextEncoder().encode(documentJson).byteLength,
    snapshot,
  });
}

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

test.afterEach(async ({ page }) => {
  await page.evaluate(() =>
    window.__breditorHarness?.cleanupReferenceFormatting(),
  );
});

test("Unicode insertion and scalar-safe backward deletion", async ({ page }) => {
  await select(page, 0, 0);
  await insert(page, "A🙂漢");

  await beforeInput(page, "deleteContentBackward", null);
  await expect(page.getByRole("textbox")).toHaveText("A🙂");
  await beforeInput(page, "deleteContentBackward", null);
  await expect(page.getByRole("textbox")).toHaveText("A");

  const snapshot = await page.evaluate(() =>
    window.__breditorHarness?.snapshot(),
  );
  expect(snapshot?.status.phase).toBe("live");
  expect(BigInt(snapshot?.document.revision ?? "0")).toBeGreaterThan(0n);
});

test("backward selection remains directional and replaces the selected range", async ({
  page,
}) => {
  await select(page, 0, 0);
  await insert(page, "abcdef");
  await select(page, 5, 2);

  await expect
    .poll(() =>
      page.evaluate(() => window.__breditorHarness?.selection()),
    )
    .toEqual({ anchorOffset: 5, focusOffset: 2, direction: "backward" });

  await beforeInput(page, "insertText", "X");
  await expect(page.getByRole("textbox")).toHaveText("abXf");
});

test("native host identity defeats a shadowed tagName on unsafe elements", async ({
  page,
}) => {
  const outcomes = await page.evaluate(async () =>
    Promise.all(
      ["button", "input", "p", "span", "textarea"].map((tagName) =>
        window.__breditorHarness?.probeEditorHost(tagName, "DIV"),
      ),
    ),
  );

  expect(outcomes).toEqual(
    Array.from({ length: 5 }, () => ({
      ok: false,
      code: "browser_editor.invalid_options",
    })),
  );
});

test("an adopted iframe-realm host routes input and tears down cleanly", async ({
  page,
}) => {
  const outcome = await page.evaluate(() => {
    const harness = window.__breditorHarness;
    if (harness === undefined) throw new Error("browser harness is unavailable");
    return harness.probeAdoptedEditorHost();
  });

  expect(outcome).toEqual({
    foreignPrototype: true,
    adoptedOwnerDocument: true,
    firstPhase: "live",
    focusSucceeded: true,
    routedDispatchReturned: false,
    routedDefaultPrevented: true,
    routedText: "x",
    revisionAdvanced: true,
    disposedPhase: "disposed",
    hostEmptyAfterDispose: true,
    postDisposeDispatchReturned: true,
    postDisposeDefaultPrevented: false,
    postDisposeRevisionStable: true,
    reopenPhase: "live",
  });
});

test("native host mutations defeat own setAttribute and append shadows", async ({
  page,
}) => {
  const outcomes = await page.evaluate(async () => {
    const harness = window.__breditorHarness;
    if (harness === undefined) throw new Error("browser harness is unavailable");
    return [
      await harness.probeMutationShadowHosts("noOp"),
      await harness.probeMutationShadowHosts("throw"),
    ];
  });

  for (const outcome of outcomes) {
    expect(outcome).toEqual({
      ok: true,
      code: undefined,
      phase: "live",
      editorAttributes: {
        contenteditable: "true",
        role: "textbox",
        ariaLabel: "Mutation shadow editor",
        ariaMultiline: "true",
        ariaDisabled: "false",
        spellcheck: "true",
        marker: "",
        inert: false,
      },
      toolbarRoot: {
        tagName: "DIV",
        marker: "",
        role: "toolbar",
        ariaLabel: "Editor controls",
        ariaOrientation: "horizontal",
        buttonCount: 3,
      },
    });
  }
});

test("toolbar disposal defeats own remove shadows and permits host reuse", async ({
  page,
}) => {
  const outcomes = await page.evaluate(async () => {
    const harness = window.__breditorHarness;
    if (harness === undefined) throw new Error("browser harness is unavailable");
    return [
      await harness.probeToolbarDisposalShadow("noOp"),
      await harness.probeToolbarDisposalShadow("throw"),
    ];
  });

  for (const outcome of outcomes) {
    expect(outcome).toEqual({
      firstOpen: true,
      firstCode: undefined,
      firstPhase: "live",
      disposedToolbarChildCount: 0,
      detachedOwnedNodeCount: 4,
      ownedNodeCount: 4,
      reopened: true,
      reopenCode: undefined,
      reopenPhase: "live",
      reopenedToolbarRootCount: 1,
      finalToolbarChildCount: 0,
    });
  }
});

for (const focusShadowMode of ["noOp", "throw"] as const) {
  test(`detached toolbar buttons cannot dispatch through ${focusShadowMode} focus shadows`, async ({
    page,
  }) => {
    const text = `detached ${focusShadowMode} toolbar`;
    await select(page, 0, 0);
    await insert(page, text);
    await select(page, 0, text.length);

    const bold = page.getByRole("button", { name: "Bold" });
    const beforeKeyboardRevision = await page.evaluate(() =>
      window.__breditorHarness?.snapshot().document.revision,
    );
    await page.keyboard.press("Shift+Tab");
    await expect(bold).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.locator("#editor strong")).toHaveText(text);
    const afterKeyboardRevision = await page.evaluate(() =>
      window.__breditorHarness?.snapshot().document.revision,
    );
    expect(BigInt(afterKeyboardRevision ?? "0")).toBeGreaterThan(
      BigInt(beforeKeyboardRevision ?? "0"),
    );

    await bold.click();
    await expect(page.locator("#editor strong")).toHaveCount(0);
    const afterClickRevision = await page.evaluate(() =>
      window.__breditorHarness?.snapshot().document.revision,
    );
    expect(BigInt(afterClickRevision ?? "0")).toBeGreaterThan(
      BigInt(afterKeyboardRevision ?? "0"),
    );

    const outcome = await page.evaluate((mode) => {
      const harness = window.__breditorHarness;
      if (harness === undefined) throw new Error("browser harness is unavailable");
      return harness.probeDetachedToolbarButtonShadow(mode);
    }, focusShadowMode);

    expect(outcome).toMatchObject({
      detachedBeforeShadow: true,
      parentNodeShadowReads: 0,
      isConnectedShadowReads: 0,
      ownerDocumentShadowReads: 0,
      focusShadowCalls: 0,
      dispatchReturned: false,
      clickDefaultPrevented: true,
      beforePhase: "live",
      afterPhase: "live",
    });
    expect(outcome.afterDocument).toEqual(outcome.beforeDocument);
    expect(outcome.beforeDocumentJson).toBeDefined();
    expect(outcome.afterDocumentJson).toBe(outcome.beforeDocumentJson);
    expect(outcome.afterHtml).toBe(outcome.beforeHtml);
  });
}

test("native typing, Backspace, and Delete stay on the semantic command path", async ({
  page,
}) => {
  await select(page, 0, 0);
  const textbox = page.getByRole("textbox");
  const initialRevision = await page.evaluate(() =>
    window.__breditorHarness?.snapshot().document.revision,
  );
  if (initialRevision === undefined) throw new Error("missing initial revision");

  await page.keyboard.type("abcd");
  await expect(textbox).toHaveText("abcd");
  const typedRevision = await page.evaluate(() =>
    window.__breditorHarness?.snapshot().document.revision,
  );
  expect(BigInt(typedRevision ?? "0")).toBeGreaterThan(BigInt(initialRevision));

  await page.keyboard.press("Backspace");
  await expect(textbox).toHaveText("abc");
  const backwardRevision = await page.evaluate(() =>
    window.__breditorHarness?.snapshot().document.revision,
  );
  expect(BigInt(backwardRevision ?? "0")).toBeGreaterThan(BigInt(typedRevision ?? "0"));

  await select(page, 1, 1);
  const selectedRevision = await page.evaluate(() =>
    window.__breditorHarness?.snapshot().document.revision,
  );
  await page.keyboard.press("Delete");
  await expect(textbox).toHaveText("ac");
  const forwardRevision = await page.evaluate(() =>
    window.__breditorHarness?.snapshot().document.revision,
  );
  expect(BigInt(forwardRevision ?? "0")).toBeGreaterThan(BigInt(selectedRevision ?? "0"));
  expect(
    await page.evaluate(() => window.__breditorHarness?.snapshot().status),
  ).toEqual({ phase: "live" });
});

test("composition settles native DOM into one canonical Unicode commit", async ({
  page,
}) => {
  await select(page, 0, 0);
  await insert(page, "ac");
  await select(page, 1, 1);
  const beforeRevision = await page.evaluate(() =>
    window.__breditorHarness?.snapshot().document.revision,
  );
  if (beforeRevision === undefined) throw new Error("missing pre-composition revision");

  await page.evaluate(() => window.__breditorHarness?.compose("漢"));

  await expect(page.getByRole("textbox")).toHaveText("a漢c");
  await expect
    .poll(() =>
      page.evaluate(() => window.__breditorHarness?.snapshot()),
    )
    .toMatchObject({ status: { phase: "live" } });
  await expect
    .poll(() =>
      page.evaluate(() => window.__breditorHarness?.snapshot().document.revision),
    )
    .toBe((BigInt(beforeRevision) + 1n).toString());

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("textbox")).toHaveText("ac");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.getByRole("textbox")).toHaveText("a漢c");
});

test("Bold, Undo, and Redo share the toolbar command history", async ({ page }) => {
  await select(page, 0, 0);
  await insert(page, "strong text");
  await select(page, 7, 11);

  const bold = page.getByRole("button", { name: "Bold" });
  const undo = page.getByRole("button", { name: "Undo" });
  const redo = page.getByRole("button", { name: "Redo" });
  await expect(bold).toHaveAttribute("aria-disabled", "false");
  await bold.click();
  await expect(page.locator("#editor strong")).toHaveText("text");
  await expect(bold).toHaveAttribute("aria-pressed", "true");

  await expect(undo).toHaveAttribute("aria-disabled", "false");
  await undo.click();
  await expect(page.locator("#editor strong")).toHaveCount(0);
  expect(
    await page.evaluate(() => window.__breditorHarness?.snapshot().status),
  ).toEqual({ phase: "live" });

  await expect(redo).toHaveAttribute("aria-disabled", "false");
  await redo.click();
  await expect(page.locator("#editor strong")).toHaveText("text");

  await select(page, 0, 11);
  await expect(bold).toHaveAttribute("aria-pressed", "mixed");
});

test("copy, cut, and paste use guarded synchronous clipboard semantics", async ({
  page,
}) => {
  await select(page, 0, 0);
  await insert(page, "Hello 🙂 world");
  await select(page, 0, 5);

  const copied = await page.evaluate(() =>
    window.__breditorHarness?.clipboard("copy"),
  );
  expect(copied).toMatchObject({ defaultPrevented: true, plainText: "Hello" });
  expect(copied?.html).toContain("Hello");
  await expect(page.getByRole("textbox")).toHaveText("Hello 🙂 world");

  const cut = await page.evaluate(() =>
    window.__breditorHarness?.clipboard("cut"),
  );
  expect(cut).toMatchObject({ defaultPrevented: true, plainText: "Hello" });
  await expect(page.getByRole("textbox")).toHaveText(" 🙂 world");

  await select(page, 9, 9);
  const pasted = await page.evaluate(() =>
    window.__breditorHarness?.clipboard("paste", {
      plainText: " PLAIN",
      html: "<strong> HTML</strong>",
    }),
  );
  expect(pasted?.defaultPrevented).toBe(true);
  await expect(page.getByRole("textbox")).toHaveText(" 🙂 world PLAIN");
  expect(
    await page.evaluate(() => window.__breditorHarness?.snapshot().status),
  ).toEqual({ phase: "live" });

  await select(page, 15, 15);
  const htmlOnly = await page.evaluate(() =>
    window.__breditorHarness?.clipboard("paste", {
      html: "<p> HTML <strong>only</strong></p>",
    }),
  );
  expect(htmlOnly?.defaultPrevented).toBe(true);
  expect(
    await page.evaluate(() => window.__breditorHarness?.snapshot().status),
  ).toEqual({ phase: "live" });
  await expect(page.getByRole("textbox")).toHaveText(
    " 🙂 world PLAIN HTML only",
  );
  await expect(page.locator("#editor strong")).toHaveCount(0);
});

test("an explicit checkpoint survives a real page reload", async ({ page }) => {
  await select(page, 0, 0);
  const persistedText = "persisted across reload 🙂";
  await insert(page, persistedText);
  const before = await page.evaluate(() =>
    window.__breditorHarness?.snapshot().document,
  );
  if (before === undefined) throw new Error("missing pre-reload snapshot");
  await expectPublicExports(page, persistedText, before);
  const flush = await page.evaluate(() => window.__breditorHarness?.flush());
  expect(flush).toEqual({ status: "committed" });

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-breditor-ready", "true");
  await expect(page.getByRole("textbox")).toHaveText("persisted across reload 🙂");
  const after = await page.evaluate(() =>
    window.__breditorHarness?.snapshot().document,
  );
  expect(after).toEqual(before);
  if (after === undefined) throw new Error("missing restored snapshot");
  await expectPublicExports(page, persistedText, after);

  const undo = page.getByRole("button", { name: "Undo" });
  const redo = page.getByRole("button", { name: "Redo" });
  await expect(undo).toHaveAttribute("aria-disabled", "false");
  await undo.click();
  await expect(page.getByRole("textbox")).toHaveText("");
  await expect(redo).toHaveAttribute("aria-disabled", "false");
  await redo.click();
  await expect(page.getByRole("textbox")).toHaveText(
    "persisted across reload 🙂",
  );
});

test("toolbar keyboard navigation, names, focus, and pressed state are accessible", async ({
  page,
}) => {
  await select(page, 0, 0);
  await insert(page, "keyboard bold");
  await select(page, 0, 13);

  const toolbar = page.getByRole("toolbar", { name: "Editor controls" });
  const bold = page.getByRole("button", { name: "Bold" });
  const undo = page.getByRole("button", { name: "Undo" });
  const redo = page.getByRole("button", { name: "Redo" });
  await expect(toolbar).toHaveAttribute("aria-orientation", "horizontal");
  await expect(bold).toHaveAttribute("tabindex", "0");
  await expect(bold).toHaveAttribute("aria-pressed", "false");

  // `select` focuses the editor. Shift+Tab reaches the preceding roving tab
  // stop using the browser's real sequential keyboard-focus algorithm.
  await page.keyboard.press("Shift+Tab");
  await expect(bold).toBeFocused();
  await expectVisibleOutline(bold);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("textbox")).toBeFocused();
  await expectVisibleOutline(page.getByRole("textbox"));

  await select(page, 0, 13);
  await page.keyboard.press("Shift+Tab");
  await expect(bold).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(undo).toBeFocused();
  await expect(undo).toHaveAttribute("tabindex", "0");
  await page.keyboard.press("End");
  await expect(redo).toBeFocused();
  await page.keyboard.press("Home");
  await expect(bold).toBeFocused();
  await page.keyboard.press("Space");

  await expect(page.locator("#editor strong")).toHaveText("keyboard bold");
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(bold).toBeFocused();
  await expectVisibleOutline(bold);
});

test("the native Link form preserves selection, formatting, focus, and responsive accessibility", async ({
  page,
  browserName,
}) => {
  const mounted = await mountReferenceFormatting(page);
  const rootSelector =
    `[data-breditor-reference-formatting-probe="${mounted.probeId}"]`;
  const root = page.locator(rootSelector);
  const editor = root.getByRole("textbox", { name: mounted.editorLabel });
  const toolbar = root.getByRole("toolbar", { name: "Editor controls" });
  const bold = toolbar.getByRole("button", { name: "Bold", exact: true });
  const highlight = toolbar.getByRole("button", {
    name: "Highlight",
    exact: true,
  });
  const link = toolbar.getByRole("button", { name: "Link", exact: true });
  const undo = toolbar.getByRole("button", { name: "Undo", exact: true });
  const redo = toolbar.getByRole("button", { name: "Redo", exact: true });
  const panel = root.locator("form[data-breditor-toolbar-panel]");

  await expect(editor).toHaveText(mounted.text);
  await expect(root.locator("mark.breditor-reference-highlight")).toHaveText(
    mounted.text,
  );
  await expect(root.locator("a.breditor-link")).toHaveCount(0);
  await expect(toolbar.locator('button[tabindex="0"]')).toHaveCount(1);
  await expect(bold).toHaveAttribute("tabindex", "0");
  await expect(link).toHaveAttribute("tabindex", "-1");
  await expect(link).toHaveAttribute(
    "data-breditor-control-kind",
    "inline-format-form",
  );
  await expect(link).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toBeHidden();
  await expect(toolbar.locator("[data-breditor-toolbar-panel]")).toHaveCount(0);
  expect(
    await panel.evaluate((element) => ({
      parentIsToolbarHost:
        element.parentElement?.hasAttribute(
          "data-breditor-reference-formatting-toolbar",
        ) ?? false,
      previousSiblingRole: element.previousElementSibling?.getAttribute("role"),
    })),
  ).toEqual({ parentIsToolbarHost: true, previousSiblingRole: "toolbar" });

  const closedAxe = await new AxeBuilder({ page }).include(rootSelector).analyze();
  expect(closedAxe.violations).toEqual([]);

  // The mount helper leaves the editor selection live. Native reverse Tab and
  // roving ArrowRight navigation reach the composite Link launcher.
  await expect(editor).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(bold).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(highlight).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(link).toBeFocused();
  await expect(link).toHaveAttribute("tabindex", "0");
  await expect(bold).toHaveAttribute("tabindex", "-1");

  await page.keyboard.press("Enter");
  await expect(link).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toBeVisible();
  const url = panel.getByLabel("Link URL", { exact: true });
  const newWindow = panel.getByLabel("Open in new window", { exact: true });
  const apply = panel.getByRole("button", { name: "Apply Link", exact: true });
  const remove = panel.getByRole("button", { name: "Remove Link", exact: true });
  await expect(url).toBeFocused();
  await expect(url).toHaveAttribute("required", "");
  await expect(url).toHaveAttribute("data-breditor-property", /.+/u);

  const openAxe = await new AxeBuilder({ page }).include(rootSelector).analyze();
  expect(openAxe.violations).toEqual([]);

  const keyOutcomes = await url.evaluate((element) =>
    ["ArrowLeft", "ArrowRight", "Home", "End"].map((key) => {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      const dispatched = element.dispatchEvent(event);
      return {
        key,
        defaultPrevented: event.defaultPrevented,
        dispatched,
        retainedFocus: document.activeElement === element,
      };
    }),
  );
  expect(keyOutcomes).toEqual(
    ["ArrowLeft", "ArrowRight", "Home", "End"].map((key) => ({
      key,
      defaultPrevented: false,
      dispatched: true,
      retainedFocus: true,
    })),
  );

  const href = "https://example.test/cross-browser?q=safe";
  await url.fill(href);
  for (const key of ["Home", "ArrowRight", "End"]) {
    await page.keyboard.press(key);
    await expect(url).toBeFocused();
    await expect(url).toHaveValue(href);
  }

  // The browser's native sequential focus order owns the panel: URL,
  // checkbox, then the first enabled form action. WebKit models Safari's
  // default macOS preference, where Option+Tab includes every native control.
  const panelTab = browserName === "webkit" ? "Alt+Tab" : "Tab";
  await page.keyboard.press(panelTab);
  await expect(newWindow).toBeFocused();
  await page.keyboard.press("Space");
  await expect(newWindow).toBeChecked();
  await page.keyboard.press(panelTab);
  await expect(apply).toBeFocused();
  const pageUrl = page.url();
  await url.focus();
  await apply.click();
  expect(page.url()).toBe(pageUrl);

  const safeLink = root.locator("a.breditor-link");
  await expect(safeLink).toHaveAttribute("href", href);
  await expect(safeLink).toHaveAttribute("target", "_blank");
  await expect(safeLink).toHaveAttribute("rel", "noopener noreferrer");
  await expect(
    safeLink.locator("mark.breditor-reference-highlight"),
  ).toHaveText(mounted.text);
  await expect(panel.locator("[data-breditor-toolbar-form-feedback]")).toHaveText(
    "Link applied.",
  );
  await expect(url).toBeFocused();

  await expect(undo).toHaveAttribute("aria-disabled", "false");
  await undo.click();
  await expect(safeLink).toHaveCount(0);
  await expect(url).toBeFocused();
  await expect(root.locator("mark.breditor-reference-highlight")).toHaveText(
    mounted.text,
  );
  await expect(redo).toHaveAttribute("aria-disabled", "false");
  await redo.click();
  await expect(safeLink).toHaveAttribute("href", href);
  await expect(url).toBeFocused();
  await expect(remove).toBeEnabled();
  await url.focus();
  await remove.click();
  await expect(safeLink).toHaveCount(0);
  await expect(root.locator("mark.breditor-reference-highlight")).toHaveText(
    mounted.text,
  );
  await expect(url).toBeFocused();

  await url.fill("https://draft.example.test/private");
  await newWindow.check();
  await url.focus();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(link).toHaveAttribute("aria-expanded", "false");
  await expect(link).toBeFocused();
  await expect(url).toHaveValue("");
  await expect(newWindow).not.toBeChecked();

  await page.keyboard.press("Enter");
  await expect(panel).toBeVisible();
  await expect(url).toBeFocused();
  await expect(url).toHaveValue("");
  await expect(newWindow).not.toBeChecked();

  await page.setViewportSize({ width: 320, height: 800 });
  const panelLayout = await panel.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      left: bounds.left,
      right: bounds.right,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
  expect(panelLayout.left).toBeGreaterThanOrEqual(0);
  expect(panelLayout.right).toBeLessThanOrEqual(panelLayout.viewportWidth);
  expect(panelLayout.scrollWidth).toBeLessThanOrEqual(panelLayout.clientWidth);

  await page.keyboard.press("Escape");
  await expect(link).toBeFocused();
  const firstPanelId = await panel.getAttribute("id");
  expect(firstPanelId).toMatch(/^breditor-toolbar-panel-[0-9]+$/u);
  expect(await link.getAttribute("aria-controls")).toBe(firstPanelId);

  const second = await mountReferenceFormatting(page);
  const secondRoot = page.locator(
    `[data-breditor-reference-formatting-probe="${second.probeId}"]`,
  );
  const secondLink = secondRoot.getByRole("button", {
    name: "Link",
    exact: true,
  });
  const secondPanel = secondRoot.locator("form[data-breditor-toolbar-panel]");
  const secondPanelId = await secondPanel.getAttribute("id");
  expect(secondPanelId).toMatch(/^breditor-toolbar-panel-[0-9]+$/u);
  expect(secondPanelId).not.toBe(firstPanelId);
  expect(await secondLink.getAttribute("aria-controls")).toBe(secondPanelId);

  await page.evaluate((probeId) => {
    window.__breditorHarness?.cleanupReferenceFormatting(probeId);
  }, second.probeId);
  await expect(secondRoot).toHaveCount(0);
  await expect(root).toHaveCount(1);
});

test("the native Link toolbar works from an open ShadowRoot without browser URL admission", async ({
  page,
}) => {
  const mounted = await mountReferenceFormatting(page, true);
  const root = page.locator(
    `[data-breditor-reference-formatting-probe="${mounted.probeId}"]`,
  );
  const editor = root.getByRole("textbox", { name: mounted.editorLabel });
  const toolbar = root.getByRole("toolbar", { name: "Editor controls" });
  const link = toolbar.getByRole("button", { name: "Link", exact: true });
  await link.focus();
  await page.keyboard.press("Enter");

  const panel = root.locator("form[data-breditor-toolbar-panel]");
  const url = panel.getByLabel("Link URL", { exact: true });
  const apply = panel.getByRole("button", { name: "Apply Link", exact: true });
  const remove = panel.getByRole("button", { name: "Remove Link", exact: true });
  await expect(panel).toBeVisible();
  await expect(url).toBeFocused();
  expect(
    await url.evaluate((element) => {
      const rootNode = element.getRootNode();
      return rootNode instanceof ShadowRoot && rootNode.activeElement === element;
    }),
  ).toBe(true);

  await url.fill("not a url");
  const pageUrl = page.url();
  await apply.click();
  expect(page.url()).toBe(pageUrl);
  await expect(
    panel.locator("[data-breditor-toolbar-form-feedback]"),
  ).toHaveText("Link applied.");
  await expect(url).toBeFocused();
  const inertLink = editor.locator("a.breditor-link");
  await expect(inertLink).toHaveCount(1);
  await expect(inertLink).not.toHaveAttribute("href", /.+/u);
  await expect(inertLink).toHaveText(mounted.text);

  await remove.click();
  await expect(editor.locator("a.breditor-link")).toHaveCount(0);
  await url.fill("https://example.test/shadow-toolbar");
  await page.keyboard.press("Enter");
  await expect(editor.locator("a.breditor-link")).toHaveAttribute(
    "href",
    "https://example.test/shadow-toolbar",
  );
  await expect(editor).toHaveAttribute("contenteditable", "true");
  await expect(url).toBeFocused();
});

test("the packaged reference Highlight profile survives the complete browser path", async ({
  page,
}) => {
  const outcome = await page.evaluate(() => {
    const harness = window.__breditorHarness;
    if (harness === undefined) throw new Error("browser harness is unavailable");
    return harness.probeReferenceHighlight();
  });

  expect(outcome).toMatchObject({
    initialHtml: "<p>Cross-browser Highlight</p>",
    stateId: "example/highlight-control",
    initialPressed: "false",
    intentStatus: "committed",
    intentId: "example/toggle-highlight-intent",
    highlightedHtml:
      '<p><mark class="breditor-reference-highlight">Cross-browser Highlight</mark></p>',
    highlightedPressed: "true",
    mixedHtml:
      '<p><strong><mark class="breditor-reference-highlight">Cross-browser Highlight</mark></strong></p>',
    copiedPlainText: "Cross-browser Highlight",
    undoHtml:
      '<p><mark class="breditor-reference-highlight">Cross-browser Highlight</mark></p>',
    redoHtml:
      '<p><strong><mark class="breditor-reference-highlight">Cross-browser Highlight</mark></strong></p>',
    unformattedHtml: "<p>Cross-browser Highlight</p>",
    unformattedPressed: "false",
    pasteDefaultPrevented: true,
    pastedHtml: "<p>Pasted plain</p>",
    flushStatus: "committed",
    persistedHtml:
      '<p><strong><mark class="breditor-reference-highlight">Pasted plain</mark></strong></p>',
    firstPhaseBeforeDispose: "live",
    firstPhaseAfterDispose: "disposed",
    firstEditorEmptyAfterDispose: true,
    firstToolbarEmptyAfterDispose: true,
    restoredHtml:
      '<p><strong><mark class="breditor-reference-highlight">Pasted plain</mark></strong></p>',
    restoredHighlightPressed: "true",
    restoredBoldPressed: "true",
    restoredUndoHtml:
      '<p><mark class="breditor-reference-highlight">Pasted plain</mark></p>',
    restoredRedoHtml:
      '<p><strong><mark class="breditor-reference-highlight">Pasted plain</mark></strong></p>',
    restoredPhase: "live",
    finalPhase: "disposed",
    finalEditorEmpty: true,
    finalToolbarEmpty: true,
  });
  expect(outcome.copiedHtml).toContain(
    '<strong><mark class="breditor-reference-highlight">Cross-browser Highlight</mark></strong>',
  );
  expect(outcome.restoredDocument).toEqual(outcome.persistedDocument);

  const mixed = JSON.parse(outcome.mixedDocumentJson) as {
    formatVersion: unknown;
    root: {
      children: Array<{
        children: Array<{ formats: Array<{ type: unknown; properties: unknown }> }>;
      }>;
    };
  };
  expect(mixed.formatVersion).toBe(2);
  expect(mixed.root.children[0]?.children[0]?.formats).toEqual([
    { type: "breditor/strong", properties: {} },
    { type: "example/highlight", properties: {} },
  ]);

  const pasted = JSON.parse(outcome.pastedDocumentJson) as {
    formatVersion: unknown;
    schemaFingerprint: unknown;
    root: { children: Array<{ children: Array<{ formats: unknown[] }> }> };
  };
  expect(pasted.formatVersion).toBe(2);
  expect(pasted.schemaFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u);
  expect(pasted.root.children[0]?.children[0]?.formats).toEqual([]);
});

test("axe finds no automatically detectable accessibility violations", async ({
  page,
}) => {
  const results = await new AxeBuilder({ page }).include("#fixture").analyze();
  expect(results.violations).toEqual([]);
});
