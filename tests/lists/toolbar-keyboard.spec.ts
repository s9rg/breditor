import {test, expect, type Locator, type Page} from "@playwright/test";
import {expectAutosavedAction} from "../demo/autosave_observation.js";

const heading = "Make room for your ideas";

async function open(page: Page) {
  await page.goto("/");
  const shell = page.getByRole("region", {name: "Breditor list document editor"});
  await expect(shell).toHaveAttribute("aria-busy", "false");
  const editor = shell.getByRole("textbox", {name: "Breditor list document", exact: true});
  const toolbar = shell.getByRole("toolbar");
  return {shell, editor, toolbar, status: shell.locator(".editor-status")};
}

// Scripted initial selection/focus; subsequent navigation and activation use
// browser keyboard events. This is not physical keyboard or screen-reader proof.
async function selectBackward(editor: Locator) {
  await editor.evaluate(host => {
    host.focus();
    const text = host.querySelector("h2")!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, text.textContent!.length, text, 0);
    document.dispatchEvent(new Event("selectionchange"));
  });
}

async function expectBackward(editor: Locator) {
  await expect.poll(() => editor.evaluate(host => {
    const selection = document.getSelection()!;
    return {
      anchorOwned: host.contains(selection.anchorNode), focusOwned: host.contains(selection.focusNode),
      anchorText: selection.anchorNode?.textContent, focusText: selection.focusNode?.textContent,
      anchorOffset: selection.anchorOffset, focusOffset: selection.focusOffset,
    };
  })).toEqual({anchorOwned: true, focusOwned: true, anchorText: heading, focusText: heading,
    anchorOffset: heading.length, focusOffset: 0});
}

async function returnToEditor(page: Page, editor: Locator) {
  // WebKit removes the visible range while a toolbar button owns focus.
  // Check actual keyboard return, without installing a replacement selection.
  await page.keyboard.press("End");
  await page.keyboard.press("Tab");
  await expect(editor).toBeFocused();
  await expectBackward(editor);
}

test("composed list toolbar roves through every control with one tab stop and inert disabled actions", async ({page}) => {
  const {shell, editor, toolbar} = await open(page);
  await selectBackward(editor);
  const original = await editor.innerHTML();
  const buttons = toolbar.getByRole("button");
  await expect(buttons).toHaveCount(21);
  await buttons.first().focus();
  for (let i = 0; i < 21; i++) {
    await expect(buttons.nth(i)).toBeFocused();
    await expect(toolbar.locator('button[tabindex="0"]')).toHaveCount(1);
    await expect(buttons.nth(i)).toHaveAttribute("tabindex", "0");
    await page.keyboard.press("ArrowRight");
  }
  await expect(buttons.first()).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(buttons.last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(buttons.first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(buttons.nth(1)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(buttons.first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(buttons.last()).toBeFocused();
  await expect(buttons.last()).toHaveAccessibleName("Redo");
  await expect(buttons.last()).toHaveAttribute("aria-disabled", "true");
  // Disabled controls remain focusable for discoverability but cannot dispatch.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await expect(buttons.last()).toBeFocused();
  expect(await editor.innerHTML()).toBe(original);
  await expect(toolbar.getByRole("button", {name: "Undo", exact: true})).toHaveAttribute("aria-disabled", "true");
  await expect(shell.locator("details code")).toHaveCount(0);
  // Tab leaves the composite instead of walking the other twenty buttons.
  await page.keyboard.press("Tab");
  await expect(editor).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(buttons.last()).toBeFocused();
});

for (const key of ["Enter", "Space"]) {
  test(`toolbar ${key} activation retains backward selection through structural history`, async ({page}) => {
    const {shell, editor, toolbar, status} = await open(page);
    await selectBackward(editor);
    const original = await editor.innerHTML();
    const controls = ["Heading 3", "Bullet list", "Numbered list", "Remove list"];
    const snapshots = [original];
    for (const name of controls) {
      const button = toolbar.getByRole("button", {name, exact: true});
      await button.focus();
      await expectAutosavedAction(status, () => page.keyboard.press(key));
      await expect(button).toBeFocused();
      await returnToEditor(page, editor);
      await expect(editor.locator("h3")).toHaveText(heading);
      snapshots.push(await editor.innerHTML());
    }
    await expect(editor.locator(":scope > h3")).toHaveText(heading);
    const undo = toolbar.getByRole("button", {name: "Undo", exact: true});
    for (let i = controls.length - 1; i >= 0; i--) {
      await undo.focus();
      await expectAutosavedAction(status, () => page.keyboard.press(key));
      await expect(undo).toBeFocused();
      await returnToEditor(page, editor);
      expect(await editor.innerHTML()).toBe(snapshots[i]);
    }
    await expect(undo).toHaveAttribute("aria-disabled", "true");
    const redo = toolbar.getByRole("button", {name: "Redo", exact: true});
    for (let i = 1; i < snapshots.length; i++) {
      await redo.focus();
      await expectAutosavedAction(status, () => page.keyboard.press(key));
      await expect(redo).toBeFocused();
      await returnToEditor(page, editor);
      expect(await editor.innerHTML()).toBe(snapshots[i]);
    }
    await expect(redo).toHaveAttribute("aria-disabled", "true");
    await expect(shell.locator("details code")).toHaveCount(0);
  });
}

test("declared extension shortcuts edit a list heading and retain their redo branch after reload", async ({page}) => {
  const {shell, editor, toolbar, status} = await open(page);
  await selectBackward(editor);
  await expectAutosavedAction(status, () => toolbar.getByRole("button", {name: "Bullet list", exact: true}).click());
  const listed = await editor.innerHTML();
  const italic = toolbar.getByRole("button", {name: "Italic", exact: true});
  const undo = toolbar.getByRole("button", {name: "Undo", exact: true});
  const redo = toolbar.getByRole("button", {name: "Redo", exact: true});
  const advertised = await italic.getAttribute("aria-keyshortcuts");
  expect(advertised).toMatch(/^(Meta|Control)\+I$/u);
  const primary = advertised!.split("+")[0]!;
  await expect(undo).toHaveAttribute("aria-keyshortcuts", `${primary}+Z`);
  await expect(redo).toHaveAttribute("aria-keyshortcuts", `${primary}+Y ${primary}+Shift+Z`);
  await expect(editor).toBeFocused();
  await expectAutosavedAction(status, () => page.keyboard.press(`${primary}+i`));
  await expect(editor.locator("ul li h2 em")).toHaveText(heading);
  await expect(italic).toHaveAttribute("aria-pressed", "true");
  await expectBackward(editor);
  const formatted = await editor.innerHTML();
  await expectAutosavedAction(status, () => page.keyboard.press(`${primary}+z`));
  expect(await editor.innerHTML()).toBe(listed);
  await expect(italic).toHaveAttribute("aria-pressed", "false");
  await expectBackward(editor);
  await page.reload();
  await expect(shell).toHaveAttribute("aria-busy", "false");
  expect(await editor.innerHTML()).toBe(listed);
  await expect(redo).toHaveAttribute("aria-disabled", "false");
  await editor.focus();
  await expectBackward(editor);
  await expectAutosavedAction(status, () => page.keyboard.press(`${primary}+Shift+z`));
  expect(await editor.innerHTML()).toBe(formatted);
  await expect(italic).toHaveAttribute("aria-pressed", "true");
  await expectBackward(editor);
  await expect(shell.locator("details code")).toHaveCount(0);
});
