import {test, expect, type Locator, type Page} from "@playwright/test";
import {readFile} from "node:fs/promises";
import {expectAutosavedAction} from "../demo/autosave_observation.js";

const heading = "Make room for your ideas";

async function open(page: Page) {
  await page.goto("/");
  const shell = page.getByRole("region", {name: "Breditor list document editor"});
  await expect(shell).toHaveAttribute("aria-busy", "false");
  return {shell, editor: shell.getByRole("textbox", {name: "Breditor list document", exact: true}),
    status: shell.locator(".editor-status")};
}

async function selectHeading(editor: Locator) {
  await editor.evaluate(host => {
    host.focus();
    const text = host.querySelector("h2")!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, text.textContent!.length, text, 0);
    document.dispatchEvent(new Event("selectionchange"));
  });
}

test("a stale list tab cannot overwrite the winner and its pending redo remains recoverable", async ({page, context}) => {
  const winner = await open(page);
  const stalePage = await context.newPage();
  try {
    const stale = await open(stalePage);
    await selectHeading(winner.editor);
    await expectAutosavedAction(winner.status, () => winner.shell.getByRole("button", {name: "Heading 3", exact: true}).click());
    const savedWinner = await winner.editor.innerHTML();
    await selectHeading(stale.editor);
    await stale.shell.getByRole("button", {name: "Bullet list", exact: true}).click();
    await expect(stale.status).toHaveText("Autosave paused; changes are not saved.");
    await stalePage.getByText("Autosave details", {exact: true}).click();
    await expect(stalePage.getByText("session_checkpoint.conflict", {exact: true})).toBeVisible();
    const listed = await stale.editor.innerHTML();
    await expect(stale.editor.locator(":scope > ul").first().locator("h2")).toHaveText(heading);
    await stale.shell.getByRole("button", {name: "Undo", exact: true}).click();
    await expect(stale.editor.locator(":scope > h2")).toHaveText(heading);
    const pending = stalePage.waitForEvent("download");
    await stale.shell.getByRole("button", {name: "Download session backup", exact: true}).click();
    const path = await (await pending).path();
    if (!path) throw new Error("Stale-tab backup download unavailable");
    const bytes = await readFile(path);
    const backup = JSON.parse(bytes.toString("utf8"));
    expect(backup.formatVersion).toBe(6);
    expect(backup.cursor).toBe(0);
    expect(backup.entries).toHaveLength(1);
    await page.getByLabel("Open session backup").setInputFiles({name: "stale-list.json", mimeType: "application/json", buffer: bytes});
    const recovered = page.getByRole("region", {name: "Recovered Breditor session editor"});
    await expect(recovered).toHaveAttribute("aria-busy", "false");
    await expect(recovered.locator(".editor-status")).toHaveText("Autosave is off.");
    await recovered.getByRole("button", {name: "Redo", exact: true}).click();
    expect(await recovered.getByRole("textbox").innerHTML()).toBe(listed);
    expect(await winner.editor.innerHTML()).toBe(savedWinner);
    await stale.shell.getByRole("button", {name: "Redo", exact: true}).click();
    expect(await stale.editor.innerHTML()).toBe(listed);
    await stalePage.getByRole("button", {name: "Retry saving", exact: true}).click();
    await expect(stale.status).toHaveText("Autosave remains paused; the retry did not complete.");
    await page.reload();
    await expect(winner.shell).toHaveAttribute("aria-busy", "false");
    expect(await winner.editor.innerHTML()).toBe(savedWinner);
    await expect(winner.status).toHaveText("All changes saved.");
    await expect(recovered).toHaveCount(0);
  } finally { await stalePage.close(); }
});
