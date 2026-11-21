import {test,expect} from "@playwright/test";
// Opt-in editor shell over two real Rust/Wasm shared writers (docs/EDITOR_SHELL.md). A menu bar item is the borrowed
// toolbar control: choosing it publishes ONE guarded shared dispatch (one content publication, one Undo step), the peer
// converges, and the help dialog and empty-line block menu work on the shared coordinator unchanged.
test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const {structuralFixture,paragraph}=await import("/structural-fixture.mjs"),shared=window.sharedTools;
  const t=structuralFixture(shared,{children:[paragraph("intro","Intro text"),paragraph("empty"),paragraph("title","Title")]});
  const publications=[];let last=t.a.documentJson();
  t.a.subscribe(event=>{const doc=event.view.documentJson;if(doc!==last){publications.push(event.source);last=doc;}});
  const help=shared.mountSharedShortcutHelp(t.da,{platform:"other"}),bar=shared.mountSharedMenuBar(t.da,{help}),floating=shared.mountSharedFloatingMenu(t.da);
  window.shellTest={...t,help,bar,floating,publications,active:()=>{const a=document.activeElement;return a===t.da.surface?"surface":a?.closest?.("[data-breditor-menubar]")?`menubar:${a.textContent}`:a?.closest?.("[role=dialog]")?"dialog":a?.tagName??"none";}};
 });
});

test("a menu bar command is one guarded shared dispatch: one publication, one Undo, peer converges",async({page})=>{
 expect(await page.evaluate(()=>window.shellTest.bar.state().menus.map(menu=>menu.id))).toContain("format");
 await page.evaluate(()=>{const t=window.shellTest;t.da.select(t.range("intro",0,5));t.da.surface.focus();});
 const depth=await page.evaluate(()=>window.shellTest.a.view().undoDepth);
 await page.keyboard.press("Alt+F9");
 expect(await page.evaluate(()=>window.shellTest.active())).toBe("menubar:Edit");
 await page.keyboard.press("f");expect(await page.evaluate(()=>window.shellTest.active())).toBe("menubar:Format");
 await page.keyboard.press("ArrowDown");
 const format=page.getByRole("menu",{name:"Format"});await expect(format).toBeVisible();
 await page.keyboard.press("b");await expect(format.getByRole("menuitemcheckbox",{name:"Bold"})).toBeFocused();
 await page.keyboard.press("Enter");await expect(format).toBeHidden();
 const after=await page.evaluate(async()=>{const t=window.shellTest;await t.synchronize();const intro=JSON.parse(t.b.documentJson()).root.children[0].children;
  return {publications:t.publications,depth:t.a.view().undoDepth,active:t.active(),peer:intro.map(c=>[c.text,c.formats.length]),same:t.a.documentJson()===t.b.documentJson(),errors:t.errors};});
 expect(after).toEqual({publications:["local"],depth:depth+1,active:"surface",peer:[["Intro",1],[" text",0]],same:true,errors:[]});
 await expect(page.locator('#a [data-shared-action="bold"]').first()).toHaveAttribute("aria-pressed","true");
 const undone=await page.evaluate(async()=>{const t=window.shellTest;t.a.undo();await t.synchronize();return {peer:JSON.parse(t.b.documentJson()).root.children[0].children.map(c=>[c.text,c.formats.length]),publications:t.publications};});
 expect(undone).toEqual({peer:[["Intro text",0]],publications:["local","local"]});
});

test("shared help dialog lists the shared coordinator's chords and the block menu follows the empty paragraph",async({page})=>{
 await page.evaluate(()=>{const t=window.shellTest;t.da.select(t.caret("title",2));t.da.surface.focus();});
 await page.keyboard.press("Alt+Digit0");
 const dialog=page.getByRole("dialog",{name:"Keyboard shortcuts"});await expect(dialog).toBeVisible();
 await expect(dialog.locator('tr[data-shortcut="undo"] kbd')).toHaveText(["Ctrl+Z"]);
 await expect(dialog.locator('tr[data-shortcut="ui:menubar"] kbd')).toHaveText(["Alt+F9"]);
 await page.keyboard.press("Escape");await expect(dialog).toBeHidden();
 expect(await page.evaluate(()=>window.shellTest.active())).toBe("surface");
 const menu=page.getByRole("toolbar",{name:"Insert block"});await expect(menu).toBeHidden();
 await page.evaluate(()=>{const t=window.shellTest;t.da.select(t.caret("empty",0));t.da.surface.focus();t.floating.refresh();});
 await expect(menu).toBeVisible();expect(await page.evaluate(()=>window.shellTest.active())).toBe("surface");
 await page.keyboard.type("Z");await expect(menu).toBeHidden();
 const result=await page.evaluate(async()=>{const t=window.shellTest;await t.synchronize();return {empty:t.textOf(t.b,"empty"),publications:t.publications.length,errors:t.errors};});
 expect(result).toEqual({empty:"Z",publications:1,errors:[]});
});
