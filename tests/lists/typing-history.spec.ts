import { test, expect } from "@playwright/test";
import { expectAutosavedAction } from "../demo/autosave_observation.js";

for (const position of ["start", "middle", "end"] as const) {
  test(`uninterrupted list typing at ${position} is one undo group`, async ({page}) => {
    await page.goto("/");
    const shell = page.getByRole("region", {name: "Breditor list document editor"});
    await expect(shell).toHaveAttribute("aria-busy", "false");
    const editor = page.getByRole("textbox", {name: "Breditor list document", exact: true});
    const status = shell.locator(".editor-status");
    const original = await editor.innerHTML();
    await editor.locator("ol li p").first().evaluate((node, position) => {
      (node.closest('[contenteditable="true"]') as HTMLElement).focus();
      const text = node.firstChild!;
      const offset = position === "start" ? 0 : position === "middle" ? 5 : text.textContent!.length;
      document.getSelection()!.setBaseAndExtent(text, offset, text, offset);
      document.dispatchEvent(new Event("selectionchange"));
    }, position);
    await expectAutosavedAction(status, () => page.keyboard.type("ABC"));
    const typed = await editor.innerHTML();
    await page.reload();
    await expect(shell).toHaveAttribute("aria-busy", "false");
    await expect(status).toHaveText("All changes saved.");
    expect(await editor.innerHTML()).toBe(typed);
    await expectAutosavedAction(status, () => shell.getByRole("button", {name: "Undo", exact: true}).click());
    expect(await editor.innerHTML()).toBe(original);
    await expect(shell.getByRole("button", {name: "Undo", exact: true})).toBeDisabled();
    await page.reload();
    await expect(shell).toHaveAttribute("aria-busy", "false");
    await expectAutosavedAction(status, () => shell.getByRole("button", {name: "Redo", exact: true}).click());
    expect(await editor.innerHTML()).toBe(typed);
  });
}

test("real caret movement separates list typing groups even after returning to the same offset", async ({page}) => {
  await page.goto("/");
  const shell = page.getByRole("region", {name: "Breditor list document editor"});
  await expect(shell).toHaveAttribute("aria-busy", "false");
  const editor = page.getByRole("textbox", {name: "Breditor list document", exact: true});
  const status = shell.locator(".editor-status");
  const original = await editor.innerHTML();
  await editor.locator("ol li p").first().evaluate(node => {
    (node.closest('[contenteditable="true"]') as HTMLElement).focus();
    document.getSelection()!.setBaseAndExtent(node.firstChild!, 5, node.firstChild!, 5);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await expectAutosavedAction(status, () => page.keyboard.type("ABC"));
  const firstGroup = await editor.innerHTML();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => editor.evaluate(() => document.getSelection()!.focusOffset)).toBe(7);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => editor.evaluate(() => document.getSelection()!.focusOffset)).toBe(8);
  await expectAutosavedAction(status, () => page.keyboard.type("X"));
  const secondGroup = await editor.innerHTML();
  await expectAutosavedAction(status, () => shell.getByRole("button", {name: "Undo", exact: true}).click());
  expect(await editor.innerHTML()).toBe(firstGroup);
  await expectAutosavedAction(status, () => shell.getByRole("button", {name: "Undo", exact: true}).click());
  expect(await editor.innerHTML()).toBe(original);
  for (let i = 0; i < 2; i++) await expectAutosavedAction(status, () => shell.getByRole("button", {name: "Redo", exact: true}).click());
  expect(await editor.innerHTML()).toBe(secondGroup);
});
