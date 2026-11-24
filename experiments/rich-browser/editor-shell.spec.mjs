import {test,expect} from "@playwright/test";
// Opt-in editor shell (docs/EDITOR_SHELL.md) over the real Rust/Wasm V4 owner: a WAI-ARIA menu bar of admitted
// controls, the Alt+0 keyboard shortcut help dialog, the empty-line block menu and the balloon-block preset.
// Every item runs the borrowed toolbar control: one native command, one Undo step, focus back to the text.
test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const api=await import("/rich.js");
  const text=value=>value?[{kind:"text",text:value,formats:[]}]:[];
  const node=(type,id,children=[],extra={})=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":id,...Object.fromEntries(Object.entries(extra).map(([k,v])=>[`breditor/${k}`,v]))},children});
  const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[node("paragraph","p",text("Hello shell")),node("paragraph","e"),node("paragraph","tail",text("Tail"))]};
  const canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:{name:"example/shell",version:4},extensions:[]}));
  const presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson()),binding=profile.descriptor();
  const host=document.createElement("main");host.style.cssText="max-width:720px;margin:40px";document.body.append(host);window.errors=[];
  const core=profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(root)}));
  window.editor=api.mountRichEditor(host,{core,inlinePresentation:presentation,toolbar:api.createRichToolbarV4(core,presentation),onError:error=>window.errors.push(String(error))});window.core=core;
  const blocks=()=>JSON.parse(core.view().documentJson).root.children.map(block=>{const own=block.children.filter(c=>c.kind==="text");return `${block.type.replace("breditor/","")}:${own.map(c=>c.text+(c.formats.length?`[${c.formats.map(f=>f.type.replace("breditor/","")).join(",")}]`:"")).join("|")}${block.children.some(c=>c.kind==="element")?`{${block.children.filter(c=>c.kind==="element").map(c=>c.type.replace("breditor/","")).join(",")}}`:""}`;});
  const select=(block,start,end=start)=>window.editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}}},true);
  window.shell={api,blocks,select,depth:()=>core.view().undoDepth,active:()=>{const a=document.activeElement;return a===window.editor.surface?"surface":a?.closest?.("[data-breditor-menubar]")?`menubar:${a.textContent}`:a?.closest?.("[role=dialog]")?"dialog":a?.closest?.("[data-breditor-context-ui]")?`floating:${a.textContent}`:a?.tagName??"none";}};
 });
});

test("menu bar: Alt+F9, arrows and typeahead run one admitted command with one Undo step",async({page})=>{
 await page.evaluate(()=>{window.shell.help=window.shell.api.mountRichShortcutHelp(window.editor,{platform:"other"});window.shell.bar=window.shell.api.mountRichMenuBar(window.editor,{help:window.shell.help});window.shell.select("p",0,5);});
 const bar=page.getByRole("menubar",{name:"Editor menu"});
 await expect(bar.getByRole("menuitem",{name:"Edit",exact:true})).toBeVisible();
 expect(await page.evaluate(()=>window.shell.bar.state().menus.map(menu=>menu.id))).toEqual(["edit","insert","format","table","help"]);
 await page.keyboard.press("Alt+F9");
 expect(await page.evaluate(()=>window.shell.active())).toBe("menubar:Edit");
 await page.keyboard.press("ArrowRight");await page.keyboard.press("ArrowRight");
 expect(await page.evaluate(()=>window.shell.active())).toBe("menubar:Format");
 await page.keyboard.press("ArrowDown");
 const format=page.getByRole("menu",{name:"Format"});await expect(format).toBeVisible();
 await expect(bar.getByRole("menuitem",{name:"Format",exact:true})).toHaveAttribute("aria-expanded","true");
 // Pressed-state controls are menuitemcheckbox with aria-checked mirrored from the Rust-derived toolbar state.
 const bold=format.getByRole("menuitemcheckbox",{name:"Bold"});await expect(bold).toHaveAttribute("aria-checked","false");
 await expect(bold).toBeFocused();
 await page.keyboard.press("i");await expect(format.getByRole("menuitemcheckbox",{name:"Italic"})).toBeFocused();
 await page.keyboard.press("ArrowUp");await expect(bold).toBeFocused();
 const before=await page.evaluate(()=>window.shell.depth());
 await page.keyboard.press("Enter");
 await expect(format).toBeHidden();
 expect(await page.evaluate(()=>({blocks:window.shell.blocks(),depth:window.shell.depth(),active:window.shell.active(),errors:window.errors}))).toEqual({blocks:["paragraph:Hello[strong]| shell","paragraph:","paragraph:Tail"],depth:before+1,active:"surface",errors:[]});
 await expect(page.locator('[data-breditor-rich] > .breditor-rich-toolbar [data-rich-action="bold"]')).toHaveAttribute("aria-pressed","true");
 // Undo from the Edit menu is the same history command: one step restores the plain text.
 // The bar remembers its last menu (roving tab stop); Home returns to Edit.
 await page.keyboard.press("Alt+F9");expect(await page.evaluate(()=>window.shell.active())).toBe("menubar:Format");await page.keyboard.press("Home");await page.keyboard.press("ArrowDown");
 const edit=page.getByRole("menu",{name:"Edit"});await expect(edit).toBeVisible();
 await expect(edit.getByRole("menuitem",{name:"Undo"})).toBeFocused();
 await page.keyboard.press("Enter");
 expect(await page.evaluate(()=>({blocks:window.shell.blocks(),active:window.shell.active()}))).toEqual({blocks:["paragraph:Hello shell","paragraph:","paragraph:Tail"],active:"surface"});
 // Escape from a menu goes to its bar item, Escape again back to the text with the Rust selection restored.
 await page.keyboard.press("Alt+F9");await page.keyboard.press("ArrowDown");await page.keyboard.press("ArrowRight");
 await expect(page.getByRole("menu",{name:"Insert"})).toBeVisible();
 await page.keyboard.press("Escape");expect(await page.evaluate(()=>window.shell.active())).toBe("menubar:Insert");
 await page.keyboard.press("Escape");expect(await page.evaluate(()=>window.shell.active())).toBe("surface");
 await page.keyboard.type("Hi");
 expect(await page.evaluate(()=>window.shell.blocks()[0])).toBe("paragraph:Hi shell");
});

test("menu bar disabled state follows Rust action state and the pointer toggles menus",async({page})=>{
 await page.evaluate(()=>{window.shell.bar=window.shell.api.mountRichMenuBar(window.editor,{menus:[{id:"edit",controls:["undo","redo"]},{id:"format",controls:["bold","italic"]}]});window.shell.select("p",1);});
 const bar=page.getByRole("menubar");
 await bar.getByRole("menuitem",{name:"Edit"}).click();
 const undo=page.getByRole("menu",{name:"Edit"}).getByRole("menuitem",{name:"Undo"});
 await expect(undo).toHaveAttribute("aria-disabled","true");await expect(undo).toBeDisabled();
 await bar.getByRole("menuitem",{name:"Format",exact:true}).hover();
 await expect(page.getByRole("menu",{name:"Format"})).toBeVisible();await expect(page.getByRole("menu",{name:"Edit"})).toBeHidden();
 await page.mouse.click(5,5);await expect(page.getByRole("menu",{name:"Format"})).toBeHidden();
 await page.evaluate(()=>{window.editor.surface.focus();window.shell.select("p",1);});await page.keyboard.type("x");
 await bar.getByRole("menuitem",{name:"Edit"}).click();
 await expect(undo).not.toHaveAttribute("aria-disabled","true");await expect(undo).toBeEnabled();
 expect(await page.evaluate(()=>window.errors)).toEqual([]);
});

for(const presentation of ["menu bar","context menu"]){
 test(`${presentation}: Tab reaches the Link URL and Enter applies without a pointer`,async({page})=>{
  await page.evaluate(presentation=>{
   const {api}=window.shell;
   if(presentation==="menu bar")api.mountRichMenuBar(window.editor,{menus:[{id:"format",controls:["link"]}]});
   else api.mountRichContextMenu(window.editor,{controls:["link"]});
   window.shell.select("p",0,5);
  },presentation);
  if(presentation==="menu bar"){
   await page.keyboard.press("Alt+F9");
   await page.keyboard.press("ArrowDown");
  }else await page.keyboard.press("Shift+F10");
  const menu=page.getByRole("menu",{name:presentation==="menu bar"?"Format":"Editor actions"});
  await expect(menu.getByRole("menuitem",{name:"Link formatting"})).toBeFocused();
  await page.keyboard.press("Enter");
  const url=menu.getByRole("textbox",{name:"Link URL"});
  await expect(url).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(url).toBeFocused();
  await page.keyboard.type("https://example.test/keyboard");
  const before=await page.evaluate(()=>window.shell.depth());
  await page.keyboard.press("Enter");
  const link=page.locator('[data-rich-text="p"] a');
  await expect(link).toHaveText("Hello");
  await expect(link).toHaveAttribute("href","https://example.test/keyboard");
  await expect(menu).toBeHidden();
  expect(await page.evaluate(()=>({depth:window.shell.depth(),active:window.shell.active(),errors:window.errors})))
   .toEqual({depth:before+1,active:"surface",errors:[]});
 });
}

test("Alt+0 opens the modal shortcut help built from the active registry; Escape returns to the text",async({page})=>{
 await page.evaluate(()=>{window.shell.help=window.shell.api.mountRichShortcutHelp(window.editor,{platform:"other"});window.shell.api.mountRichSelectionToolbar(window.editor);window.shell.select("tail",2);});
 await page.keyboard.press("Alt+Digit0");
 const dialog=page.getByRole("dialog",{name:"Keyboard shortcuts"});await expect(dialog).toBeVisible();await expect(dialog).toBeFocused();
 await expect(dialog).toHaveAttribute("aria-modal","true");
 const row=id=>dialog.locator(`tr[data-shortcut="${id}"]`);
 await expect(row("control:bold")).toContainText("Ctrl+B");await expect(row("control:link")).toContainText("Ctrl+K");
 await expect(row("redo").locator("kbd")).toHaveText(["Ctrl+Y","Ctrl+Shift+Z"]);
 await expect(row("ui:help")).toContainText("Alt+0");await expect(row("ui:selection-toolbar")).toContainText("Alt+F10");
 await expect(dialog.getByRole("heading",{level:3})).toHaveText(["History","Text formatting","Blocks","Navigation and selection","Commands","Editor interface"]);
 expect(await page.evaluate(()=>[...document.querySelectorAll("[role=dialog] tr")].map(r=>r.dataset.shortcut).sort().join()===window.shell.help.entries().map(e=>e.id).sort().join())).toBe(true);
 // Focus stays trapped in the modal.
 await page.keyboard.press("Tab");await page.keyboard.press("Tab");await expect(dialog.getByRole("button",{name:"Close"})).toBeFocused();
 await page.keyboard.press("Tab");expect(await page.evaluate(()=>window.shell.active())).toBe("dialog");
 await page.keyboard.press("Shift+Tab");await expect(dialog.getByRole("button",{name:"Close"})).toBeFocused();
 await page.keyboard.press("Escape");await expect(dialog).toBeHidden();
 expect(await page.evaluate(()=>window.shell.active())).toBe("surface");
 await page.keyboard.type("!");
 expect(await page.evaluate(()=>({blocks:window.shell.blocks(),errors:window.errors}))).toEqual({blocks:["paragraph:Hello shell","paragraph:","paragraph:Ta!il"],errors:[]});
 // Apple display uses symbols with spelled-out accessible names.
 await page.evaluate(()=>{window.shell.help.dispose();window.shell.help=window.shell.api.mountRichShortcutHelp(window.editor,{platform:"apple"});window.shell.help.open();});
 await expect(row("redo").locator("kbd")).toHaveText(["⌘Y","⇧⌘Z"]);
 await expect(row("redo").locator("kbd").last()).toHaveAttribute("aria-label","Shift+Command+Z");
 await dialog.getByRole("button",{name:"Close"}).click();await expect(dialog).toBeHidden();
});

test("empty-line block menu: appears at an empty paragraph, never steals typing, Alt+F10 reaches it",async({page})=>{
 await page.evaluate(()=>{window.shell.floating=window.shell.api.mountRichFloatingMenu(window.editor);});
 const menu=page.getByRole("toolbar",{name:"Insert block"});
 await page.locator('[data-rich-text="tail"]').click();await expect(menu).toBeHidden();
 await page.locator('[data-rich-text="e"]').click();await expect(menu).toBeVisible();
 expect(await page.evaluate(()=>window.shell.active())).toBe("surface");
 // Positioned beside the caret line of the empty paragraph, inside the viewport.
 const [box,line]=await Promise.all([menu.boundingBox(),page.locator('[data-rich-text="e"]').boundingBox()]);
 expect(box.x).toBeGreaterThan(line.x);expect(box.y).toBeLessThan(line.y+line.height);expect(box.y+box.height).toBeGreaterThan(line.y);
 // Typing goes into the paragraph and hides the menu.
 await page.keyboard.type("Typed");
 await expect(menu).toBeHidden();
 expect(await page.evaluate(()=>window.shell.blocks())).toEqual(["paragraph:Hello shell","paragraph:Typed","paragraph:Tail"]);
 for(let i=0;i<5;i++)await page.keyboard.press("Backspace");
 await expect(menu).toBeVisible();
 // Keyboard: Alt+F10 focuses its first control; choosing a list is one command and one Undo step.
 await page.keyboard.press("Alt+F10");
 expect(await page.evaluate(()=>window.shell.active())).toMatch(/^floating:/);
 const controls=await page.evaluate(()=>window.shell.floating.state().controls);
 expect(controls).toContain("bullet");
 await page.evaluate(()=>document.querySelector('[data-breditor-context-ui=floating-menu] [data-rich-action="bullet"]').focus());
 const before=await page.evaluate(()=>window.shell.depth());
 await page.keyboard.press("Enter");
 expect(await page.evaluate(()=>({second:window.shell.blocks()[1],depth:window.shell.depth(),active:window.shell.active()}))).toEqual({second:"bullet-list:{list-item}",depth:before+1,active:"surface"});
 await page.keyboard.press("Escape");await expect(menu).toBeHidden();
 await page.keyboard.type("A");
 await expect(menu).toBeHidden();
 expect(await page.evaluate(()=>window.errors)).toEqual([]);
});

test("balloon-block preset hides the fixed toolbar and keeps the floating selection toolbar working",async({page})=>{
 await page.evaluate(()=>{window.shell.layout=window.shell.api.mountRichBalloonBlockLayout(window.editor);});
 await expect(page.locator("[data-breditor-rich] > .breditor-rich-toolbar")).toBeHidden();
 await page.evaluate(()=>window.shell.select("p",6,11));
 const balloon=page.getByRole("toolbar",{name:"Selection formatting"});
 await expect(balloon).toBeVisible();
 await balloon.getByRole("button",{name:"Italic"}).click();
 expect(await page.evaluate(()=>({first:window.shell.blocks()[0],active:window.shell.active()}))).toEqual({first:"paragraph:Hello |shell[breditor-inline/italic]",active:"surface"});
 await page.keyboard.press("Control+Z");
 expect(await page.evaluate(()=>window.shell.blocks()[0])).toBe("paragraph:Hello shell");
 await page.evaluate(()=>window.shell.layout.dispose());
 await expect(page.locator("[data-breditor-rich] > .breditor-rich-toolbar")).toBeVisible();
});
