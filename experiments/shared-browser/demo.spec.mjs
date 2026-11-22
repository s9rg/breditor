import AxeBuilder from "@axe-core/playwright";
import {test,expect} from "@playwright/test";
async function caret(page,side,block,end){
 const surface=page.locator(`#${side} .breditor-shared-surface`);await surface.focus();await surface.locator(`[data-rich-text="${block}"]`).evaluate((element,end)=>{const range=document.createRange();range.selectNodeContents(element);range.collapse(!end);const selection=document.getSelection();selection.removeAllRanges();selection.addRange(range);},end);
}

test("both demo contents lists follow an edited heading and the writer's Undo", async ({page}) => {
 await page.goto("/demo");
 await page.getByRole("link", {name: "Try the table of contents"}).click();
 // A cold navigation loads the shared Wasm and module graph before exposing both editors.
 await expect(page.locator("#contents-ready")).toHaveText("Ready", {timeout: 15_000});
 const contents = writer => page.locator(`#${writer}`).getByRole("navigation", {name: `Writer ${writer.toUpperCase()} contents`});
 await contents("a").getByRole("button", {name: "Recovery", exact: true}).click();
 await page.keyboard.insertText("Offline ");
 for (const writer of ["a", "b"]) {
  await expect(contents(writer).getByRole("button", {name: "Offline Recovery"})).toBeEnabled();
 }
 await contents("b").getByRole("button", {name: "Restore a checkpoint"}).click();
 await expect(contents("b").getByRole("button", {name: "Restore a checkpoint"})).toHaveAttribute("aria-current", "location");
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

test("the demo has accessible landmarks and skips to editing with the keyboard", async ({page, browserName}) => {
 await page.goto("/demo");
 await expect(page.locator("#state")).toContainText("Connected");
 const skip = page.getByRole("link", {name: "Skip to editors"});
 // The default macOS WebKit keyboard setting reaches links with Option+Tab.
 await page.keyboard.press(browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab");
 await expect(skip).toBeFocused();
 await expect(skip).toBeInViewport();
 await page.keyboard.press("Enter");
 await expect(page.getByRole("main")).toBeFocused();
 const audit = await new AxeBuilder({page}).analyze();
 expect(audit.violations).toEqual([]);
});

test("the contents and code demos expose accessible landmarks", async ({page}) => {
 for (const [path, ready] of [["contents", "#contents-ready"], ["code", "#code-ready"]]) {
  await page.goto(`/${path}`);
  await expect(page.locator(ready)).toHaveText("Ready");
  const audit = await new AxeBuilder({page}).analyze();
  expect(audit.violations).toEqual([]);
 }
});

test("both code demo writers fit a phone viewport without losing editable controls",async({page})=>{
 await page.setViewportSize({width:320,height:780});
 await page.goto("/code");
 await expect(page.locator("#code-ready")).toHaveText("Ready");
 for(const name of ["Writer A","Writer B"]){
  const editor=page.getByRole("region",{name});
  const code=editor.locator("pre[data-language]").first();
  await code.scrollIntoViewIfNeeded();
  await code.click();
  const language=editor.getByRole("textbox",{name:"Code language"});
  await expect(language).toBeEnabled();
  await language.scrollIntoViewIfNeeded();
  await expect(language).toBeInViewport();
  expect(await code.evaluate(element=>element.clientWidth)).toBeGreaterThanOrEqual(240);
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(320);
});

test("the shared contents demo exposes named writer regions after its keyboard skip link",async({page,browserName})=>{
 await page.goto("/contents");
 await expect(page.locator("#contents-ready")).toHaveText("Ready");
 await page.keyboard.press(browserName==="webkit"&&process.platform==="darwin"?"Alt+Tab":"Tab");
 await expect(page.getByRole("link",{name:"Skip to contents editors"})).toBeFocused();
 await page.keyboard.press("Enter");
 await expect(page.getByRole("main")).toBeFocused();
 for(const name of ["Writer A","Writer B"]){
  await expect(page.getByRole("region",{name,exact:true}).getByRole("navigation",{name:`${name} contents`})).toBeVisible();
 }
});
