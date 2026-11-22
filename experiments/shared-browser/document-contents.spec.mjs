import {expect, test} from "@playwright/test";

test("a remote heading edit refreshes both contents views and keeps exact heading identity", async ({page}) => {
 await page.goto("/");
 await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async () => {
  const {mountRichWritingTools} = await import("/rich.js");
  const {structuralFixture} = await import("/structural-fixture.mjs");
  const heading = (id, level, text) => ({
   kind: "element", type: "breditor/heading", entityId: null,
   properties: {"breditor/block-id": id, "breditor/level": level},
   children: [{kind: "text", text, formats: []}],
  });
  const fixture = structuralFixture(window.sharedTools, {children: [heading("title", 2, "Guide"), heading("step", 3, "Steps")]});
  for (const [name, editor] of [["A", fixture.da], ["B", fixture.db]]) {
   const mount = document.createElement("div");
   editor.surface.before(mount);
   mountRichWritingTools(mount, editor, {presentation: "contents", label: `Writer ${name} contents`});
  }
  window.contentsTest = fixture;
 });
 const navB = page.getByRole("navigation", {name: "Writer B contents"});
 await expect(navB.locator("ol > li > ol")).toContainText("Steps");
 const entry = navB.getByRole("button", {name: "Steps"});
 await entry.focus();
 await expect(entry).toBeFocused();
 await page.evaluate(async () => {
  const {a, synchronize} = window.contentsTest;
  a.dispatch({commands: [{kind: "insert_text", data: {block: "step", offset: 0, text: "First "}}]});
  await synchronize();
 });
 for (const writer of ["A", "B"]) {
  const nav = page.getByRole("navigation", {name: `Writer ${writer} contents`});
  await expect(nav.getByRole("button", {name: "First Steps"})).toBeEnabled();
 }
 const depth = await page.evaluate(() => window.contentsTest.b.view().undoDepth);
 await expect(navB.getByRole("button", {name: "First Steps"})).toBeFocused();
 await page.keyboard.press("Enter");
 await expect.poll(() => page.evaluate(() => window.contentsTest.b.view().selection?.focus.block)).toBe("step");
 expect(await page.evaluate(() => window.contentsTest.b.view().undoDepth)).toBe(depth);
 expect(await page.evaluate(() => window.contentsTest.errors)).toEqual([]);
});
