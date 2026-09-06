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

test("axe finds no automatically detectable accessibility violations", async ({
  page,
}) => {
  const results = await new AxeBuilder({ page }).include("#fixture").analyze();
  expect(results.violations).toEqual([]);
});
