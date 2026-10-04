import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { expectAutosavedAction } from "../demo/autosave_observation.js";

// Scripted native-event/DOM fixtures exercise the real production owner and
// persistence path. They do not certify an OS IME, trusted input, or its timing.
async function open(page: Page) {
  await page.goto("/");
  const shell = page.getByRole("region", {name: "Breditor list document editor"});
  await expect(shell).toHaveAttribute("aria-busy", "false");
  const editor = page.getByRole("textbox", {name: "Breditor list document", exact: true});
  const status = shell.locator(".editor-status");
  await expect(status).toHaveText("All changes saved.");
  return {shell, editor, status};
}

async function backup(page: Page, shell: Locator): Promise<string> {
  const pending = page.waitForEvent("download");
  await shell.getByRole("button", {name: "Download session backup", exact: true}).click();
  const path = await (await pending).path();
  if (!path) throw new Error("Missing downloaded backup");
  return readFile(path, "utf8");
}

/** Select the first five UTF-16 units backward inside the first numbered item. */
async function selectPrefix(editor: Locator): Promise<void> {
  await editor.evaluate(host => {
    host.focus();
    const text = document.createTreeWalker(host.querySelector("ol li")!, NodeFilter.SHOW_TEXT).nextNode()!;
    document.getSelection()!.setBaseAndExtent(text, 5, text, 0);
    document.dispatchEvent(new Event("selectionchange"));
  });
}

/** DOM-path observations distinguish selection direction, not just range text. */
async function selection(editor: Locator) {
  return editor.evaluate(host => {
    const selected = document.getSelection()!;
    const path = (node: Node | null) => {
      const indices: number[] = [];
      while (node !== host) {
        if (!node?.parentNode) throw new Error("Selection escaped the editor");
        indices.unshift(Array.from(node.parentNode.childNodes).indexOf(node as ChildNode));
        node = node.parentNode;
      }
      return indices;
    };
    return {anchor: path(selected.anchorNode), anchorOffset: selected.anchorOffset,
      focus: path(selected.focusNode), focusOffset: selected.focusOffset};
  });
}

async function begin(editor: Locator, mode: "commit" | "cancel" | "invalid"): Promise<void> {
  await editor.evaluate((host, mode) => {
    const text = document.createTreeWalker(host.querySelector("ol li")!, NodeFilter.SHOW_TEXT).nextNode() as Text;
    const range = new StaticRange({startContainer: text, startOffset: 0, endContainer: text, endOffset: 5});
    host.dispatchEvent(new CompositionEvent("compositionstart", {bubbles: true, data: ""}));
    const input = new InputEvent("beforeinput", {bubbles: true, cancelable: true,
      inputType: "insertCompositionText", data: "漢字🙂", isComposing: true, targetRanges: [range]});
    // Platform constructors differ. Supply ranges for this fixture event only;
    // restore the intrinsic before any asynchronous application work can run.
    const descriptor = Object.getOwnPropertyDescriptor(InputEvent.prototype, "getTargetRanges");
    if (!descriptor?.configurable || typeof descriptor.value !== "function") throw new Error("Missing target-range fixture capability");
    Object.defineProperty(InputEvent.prototype, "getTargetRanges", {...descriptor, value() {
      return this === input ? [range] : Reflect.apply(descriptor.value, this, []);
    }});
    try { host.dispatchEvent(input); }
    finally { Object.defineProperty(InputEvent.prototype, "getTargetRanges", descriptor); }
    if (input.defaultPrevented) throw new Error("Composition was not admitted");
    if (mode !== "cancel") text.replaceData(0, 5, "漢字🙂");
    if (mode === "invalid") host.querySelector("ol")!.setAttribute("start", "99");
    host.dispatchEvent(new CompositionEvent("compositionupdate", {bubbles: true, data: mode === "cancel" ? "" : "漢字🙂"}));
    host.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertCompositionText",
      data: mode === "cancel" ? "" : "漢字🙂", isComposing: true}));
  }, mode);
}

async function end(editor: Locator, data: string): Promise<void> {
  // Playwright's generic dispatchEvent creates Event for this name, which has
  // no native composition data getter and correctly triggers recovery instead.
  await editor.evaluate((host, data) => {
    host.dispatchEvent(new CompositionEvent("compositionend", {bubbles: true, data}));
  }, data);
}

test("scripted list-heading composition commits once and retains exact history through V6 reload", async ({page}) => {
  let {shell, editor, status} = await open(page);
  await selectPrefix(editor);
  await expectAutosavedAction(status, () => shell.getByRole("button", {name: "Heading 3", exact: true}).click());
  await expectAutosavedAction(status, () => shell.getByRole("button", {name: "Bold", exact: true}).click());
  await selectPrefix(editor);
  await expect(status).toHaveText("All changes saved.");
  const original = await editor.innerHTML(), originalSelection = await selection(editor);
  // Observe before opening the lease: composition admission may itself dirty
  // the checkpoint, whose save must remain deferred until settlement.
  await expectAutosavedAction(status, async () => {
    await begin(editor, "commit");
    await expect(editor.locator("ol li h3 strong")).toHaveText("漢字🙂");
    await expect(editor.locator("ol")).toHaveAttribute("start", "3");

    // A second view reads the durable slot while provisional DOM remains leased.
    // No provisional composition text or structural state may become durable.
    const peer = await page.context().newPage();
    try {
      const durable = await open(peer);
      expect(await durable.editor.innerHTML()).toBe(original);
    } finally { await peer.close(); }
    await end(editor, "漢字🙂");
  });
  const committed = await editor.innerHTML(), committedSelection = await selection(editor);
  await editor.evaluate(host => host.dispatchEvent(new InputEvent("input", {
    bubbles: true, inputType: "insertCompositionText", data: "漢字🙂", isComposing: false,
  })));
  expect(await editor.innerHTML()).toBe(committed);
  const committedBackup = await backup(page, shell);
  expect(JSON.parse(committedBackup).formatVersion).toBe(6);
  ({shell, editor, status} = await open(page));
  expect(await backup(page, shell)).toBe(committedBackup);
  expect(await editor.innerHTML()).toBe(committed);
  await expectAutosavedAction(status, () => shell.getByRole("button", {name: "Undo", exact: true}).click());
  expect(await editor.innerHTML()).toBe(original);
  expect(await selection(editor)).toEqual(originalSelection);
  const undoneBackup = await backup(page, shell);
  ({shell, editor, status} = await open(page));
  expect(await backup(page, shell)).toBe(undoneBackup);
  await expectAutosavedAction(status, () => shell.getByRole("button", {name: "Redo", exact: true}).click());
  expect(await editor.innerHTML()).toBe(committed);
  expect(await selection(editor)).toEqual(committedSelection);
});

for (const mode of ["cancel", "invalid"] as const) {
  test(`scripted list composition ${mode} restores the base without adding history`, async ({page}) => {
    let {shell, editor, status} = await open(page);
    await selectPrefix(editor);
    const original = await editor.innerHTML(), originalSelection = await selection(editor);
    await begin(editor, mode);
    await end(editor, mode === "cancel" ? "" : "漢字🙂");
    await expect.poll(() => editor.innerHTML()).toBe(original);
    await expect.poll(() => selection(editor)).toEqual(originalSelection);
    await expect(shell.getByRole("button", {name: "Undo", exact: true})).toBeDisabled();
    await expect(status).toHaveText("All changes saved.");
    // Continue in this owner before reload: a fresh owner could hide a lease
    // that failed to release after cancellation or canonical DOM recovery.
    await selectPrefix(editor);
    await expectAutosavedAction(status, () => page.keyboard.type("R"));
    await expect(editor.locator("ol li p").first()).toHaveText("R a first draft");
    await expectAutosavedAction(status, () => shell.getByRole("button", {name: "Undo", exact: true}).click());
    expect(await editor.innerHTML()).toBe(original);
    await expect(shell.getByRole("button", {name: "Undo", exact: true})).toBeDisabled();
    const saved = await backup(page, shell);
    ({shell, editor, status} = await open(page));
    expect(await backup(page, shell)).toBe(saved);
    expect(await editor.innerHTML()).toBe(original);
    await expect(shell.getByRole("button", {name: "Undo", exact: true})).toBeDisabled();
    await expectAutosavedAction(status, () => shell.getByRole("button", {name: "Redo", exact: true}).click());
    await expect(editor.locator("ol li p").first()).toHaveText("R a first draft");
  });
}
