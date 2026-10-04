import {test, expect, type Locator, type Page} from "@playwright/test";
import {readFile} from "node:fs/promises";
import {expectAutosavedAction} from "../demo/autosave_observation.js";

const heading = "Make room for your ideas";
const paragraph = "Headings, flat lists, and inline formatting share one Rust history. Try an edit, undo it, and reload. 🙂";

// Selection setup is scripted; these tests qualify the integrated structural
// history/persistence contract, not native mouse selection or assistive input.
async function download(page: Page, shell: Locator): Promise<string> {
  const pending = page.waitForEvent("download");
  await shell.getByRole("button", {name: "Download session backup", exact: true}).click();
  const path = await (await pending).path();
  if (path === null) throw new Error("Session download is unavailable");
  return readFile(path, "utf8");
}

for (const backward of [false, true]) {
  test(`${backward ? "backward" : "forward"} structural range excludes the next block through reload and recovery`, async ({page}) => {
    await page.goto("/");
    const shell = page.getByRole("region", {name: "Breditor list document editor"});
    const editor = shell.getByRole("textbox", {name: "Breditor list document", exact: true});
    const status = shell.locator(".editor-status");
    await expect(shell).toHaveAttribute("aria-busy", "false");
    const original = await editor.innerHTML();
    await editor.evaluate((host, backward) => {
      host.focus();
      const first = host.children[0]!.firstChild!;
      const next = host.children[1]!.firstChild!;
      document.getSelection()!.setBaseAndExtent(backward ? next : first, 0, backward ? first : next, 0);
      document.dispatchEvent(new Event("selectionchange"));
    }, backward);
    const expected = {
      anchorText: backward ? paragraph : heading,
      focusText: backward ? heading : paragraph,
      anchorOffset: 0, focusOffset: 0,
      anchorOwned: true, focusOwned: true,
      anchorType: 3, focusType: 3,
    };
    const assertSelection = async (owner = editor) => expect.poll(() => owner.evaluate((host) => {
      const selection = document.getSelection()!;
      return {anchorText: selection.anchorNode?.textContent, focusText: selection.focusNode?.textContent,
        anchorOffset: selection.anchorOffset, focusOffset: selection.focusOffset,
        anchorOwned: host.contains(selection.anchorNode), focusOwned: host.contains(selection.focusNode),
        anchorType: selection.anchorNode?.nodeType, focusType: selection.focusNode?.nodeType};
    })).toEqual(expected);
    await assertSelection();
    for (const action of ["Heading 3", "Bullet list", "Numbered list"]) {
      await expectAutosavedAction(status, () => shell.getByRole("button", {name: action, exact: true}).click());
      await assertSelection();
      await expect(editor.locator(":scope > p").first()).toHaveText(paragraph);
    }
    await expect(editor.locator(":scope > ol").first().locator(":scope > li")).toHaveCount(1);
    await expect(editor.locator(":scope > ol").first().locator("h3")).toHaveText(heading);
    const changed = await editor.innerHTML();
    await page.reload();
    await expect(shell).toHaveAttribute("aria-busy", "false");
    await assertSelection();
    expect(await editor.innerHTML()).toBe(changed);
    for (let i = 0; i < 3; i++) {
      await expectAutosavedAction(status, () => shell.getByRole("button", {name: "Undo", exact: true}).click());
      await assertSelection();
    }
    expect(await editor.innerHTML()).toBe(original);
    const saved = await download(page, shell);
    await page.reload();
    await expect(shell).toHaveAttribute("aria-busy", "false");
    await assertSelection();
    expect(await download(page, shell)).toBe(saved);
    for (let i = 0; i < 3; i++) {
      await expectAutosavedAction(status, () => shell.getByRole("button", {name: "Redo", exact: true}).click());
      await assertSelection();
    }
    expect(await editor.innerHTML()).toBe(changed);
    await page.getByLabel("Open session backup").setInputFiles({name: "directional-history.json", mimeType: "application/json", buffer: Buffer.from(saved)});
    const recovered = page.getByRole("region", {name: "Recovered Breditor session editor"});
    await expect(recovered).toHaveAttribute("aria-busy", "false");
    await expect(recovered.locator(".editor-status")).toHaveText("Autosave is off.");
    expect(await download(page, recovered)).toBe(saved);
    for (let i = 0; i < 3; i++) {
      await recovered.getByRole("button", {name: "Redo", exact: true}).click();
      await assertSelection(recovered.getByRole("textbox"));
    }
    expect(await recovered.getByRole("textbox").innerHTML()).toBe(changed);
    expect(await editor.innerHTML()).toBe(changed);
  });
}
