import {test,expect} from "@playwright/test";
async function caret(page,side,block,end){
 const surface=page.locator(`#${side} .breditor-shared-surface`);await surface.focus();await surface.locator(`[data-rich-text="${block}"]`).evaluate((element,end)=>{const range=document.createRange();range.selectNodeContents(element);range.collapse(!end);const selection=document.getSelection();selection.removeAllRanges();selection.addRange(range);},end);
}

test("both demo contents lists follow an edited heading and the writer's Undo", async ({page}) => {
 await page.goto("/demo");
 await page.getByRole("link", {name: "Try the table of contents"}).click();
 await expect(page.locator("#contents-ready")).toHaveText("Ready");
 const contents = writer => page.locator(`#${writer}`).getByRole("navigation", {name: "On this page"});
 await contents("a").getByRole("button", {name: "Recovery", exact: true}).click();
 await page.keyboard.insertText("Offline ");
 for (const writer of ["a", "b"]) {
  await expect(contents(writer).getByRole("button", {name: "Offline Recovery"})).toBeEnabled();
 }
 await page.locator("#a").getByRole("button", {name: "Undo", exact: true}).click();
 await expect(contents("b").getByRole("button", {name: "Recovery", exact: true})).toBeEnabled();
 await expect(contents("a").getByRole("button", {name: "Offline Recovery"})).toHaveCount(0);
});

test("the shared code example colors a typed change for both writers", async ({page}) => {
 await page.goto("/demo");
 await page.getByRole("link", {name: "Try code highlighting"}).click();
 await expect(page.locator("#code-ready")).toHaveText("Ready");
 await caret(page, "a", "retry", true);
 await page.keyboard.press("Enter");
 await page.keyboard.insertText("// Shared example");
 for (const writer of ["a", "b"]) {
  await expect(page.locator(`#${writer} pre[data-language]`)).toContainText("// Shared example");
 }
 await expect.poll(() => page.evaluate(() => [...CSS.highlights]
  .filter(([name]) => name.startsWith("breditor-syntax-") && name.endsWith("-comment"))
  .flatMap(([, ranges]) => [...ranges].filter(range => range.toString() === "// Shared example"))
  .length)).toBe(2);
});

test("combined demo saves both offline writers reconnects and reloads selective history",async({page})=>{
 await page.goto("/demo");await expect(page.locator("#state")).toHaveText("Connected · A saved · B saved");
 await page.locator("#connection").click();await caret(page,"a","p",true);await page.keyboard.type(" demoA");await caret(page,"b","caption",false);await page.keyboard.type("demoB ");
 await expect(page.locator("#state")).toHaveText("Disconnected · A saved · B saved");await expect(page.locator('#b [data-rich-text="p"]')).toHaveText("a🙂b");
 await page.locator("#connection").click();await expect(page.locator("#state")).toHaveText("Connected · A saved · B saved");
 await expect(page.locator('#b [data-rich-text="p"]')).toHaveText("a🙂b demoA");await expect(page.locator('#a [data-rich-text="caption"]')).toHaveText("demoB xy🙂");
 await page.reload();await expect(page.locator("#state")).toHaveText("Connected · A saved · B saved");await expect(page.locator('#a [data-rich-text="p"]')).toHaveText("a🙂b demoA");
 await page.locator('#a .breditor-shared-toolbar [data-shared-action="undo"]').click();await expect(page.locator('#b [data-rich-text="p"]')).toHaveText("a🙂b demo");await expect(page.locator('#b [data-rich-text="caption"]')).toHaveText("demoB xy🙂");
 await page.locator('#a .breditor-shared-toolbar [data-shared-action="redo"]').click();await expect(page.locator('#b [data-rich-text="p"]')).toHaveText("a🙂b demoA");await expect(page.locator("#state")).toHaveText("Connected · A saved · B saved");
});

test("a shared wide table retains its scroll offset when a peer edits a cell", async ({page}) => {
 await page.setViewportSize({width: 430, height: 900});
 await page.goto("/demo");
 await expect(page.locator("#state")).toHaveText("Connected · A saved · B saved");
 const region = page.locator("#b [data-rich-table-scroll='t']");
 await page.evaluate(() => window.demoEditors.a.execute({
  commands: [{kind: "resize_column", data: {block: "table-block", column: "c", width: 680}}],
 }, false));
 await expect.poll(() => region.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
 const depth = await page.evaluate(() => window.demoEditors.b.view().undoDepth);
 await page.locator("#b").getByRole("button", {name: "Scroll table 1 right"}).focus();
 await page.keyboard.press("ArrowRight");
 await expect.poll(() => region.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
 const offset = await region.evaluate(element => element.scrollLeft);
 expect(await page.evaluate(() => window.demoEditors.b.view().undoDepth)).toBe(depth);
 await page.evaluate(() => window.demoEditors.a.execute({
  commands: [{kind: "insert_text", data: {block: "p", offset: 0, text: "Wide "}}],
 }, false));
 await expect(region.locator("[data-rich-text='p']")).toHaveText("Wide a🙂b");
 await expect.poll(() => region.evaluate(element => element.scrollLeft)).toBe(offset);
});
