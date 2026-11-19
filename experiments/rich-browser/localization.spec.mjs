import {test,expect} from "@playwright/test";
// Opt-in chrome catalog and RTL chrome against the real Rust/Wasm owner. The Arabic strings are a test-only catalog.
const arabic={lang:"ar",direction:"rtl",
 strings:{richEditorLabel:"محرر النص المنسق",richToolbarLabel:"تنسيق النص",richStatusOutcome:"{outcome} · المراجعة {revision}",
  selectionToolbarLabel:"تنسيق التحديد",contextMenuLabel:"إجراءات المحرر",slashLabel:"الأوامر",slashCount:"الأوامر المتاحة: {count}",slashCountOne:"أمر واحد متاح",
  columnResizeLabel:"تغيير عرض العمود {index} من {count}",columnResizeValue:"{width} بكسل"},
 controls:{undo:{label:"تراجع"},redo:{label:"إعادة"},bold:{label:"عريض"},heading:{label:"عنوان 2"},alt:{label:"النص البديل"}},
 slashItems:{paragraph:{label:"نص"},"heading-1":{label:"عنوان 1"},"heading-2":{label:"عنوان 2"},"heading-3":{label:"عنوان 3"},"bullet-list":{label:"قائمة نقطية"},"numbered-list":{label:"قائمة مرقمة"},table:{label:"جدول"}}};
const pixel="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
/** Remount the demo's exact owner state with the catalog, plus the opt-in tools borrowing that editor. */
async function localize(page){
 await page.evaluate(async({ui,pixel})=>{
  const rich=await import("/rich.js"),demo=window.demo,checkpoint=demo.editor.checkpointJson(),owner=demo.profile.restoreEditor(checkpoint);
  for(const extra of demo.extras)extra.dispose();demo.editor.dispose();
  const editor=rich.mountRichEditor(document.getElementById("editor"),{core:owner,ui,resolveAsset:()=>pixel});
  const items=rich.createRichSlashCommands(rich.defaultToolbar,undefined,editor.uiLocale());
  window.localized={editor,extras:[rich.mountRichSlashCommands(editor,{items}),rich.mountRichSelectionToolbar(editor),rich.mountRichContextMenu(editor),
   rich.mountRichTableColumnResize(document.getElementById("table-resize"),editor,{commit:rich.richTableColumnResizeCommit(editor)})]};
 },{ui:arabic,pixel});
}
const caretAtEnd=(page,block,editor="demo")=>page.evaluate(({block,editor})=>{const target=editor==="demo"?window.demo.editor:window.localized.editor,view=target.view(),root=JSON.parse(view.documentJson).root;let length=0;
 const walk=node=>{if(node.properties?.["breditor/block-id"]===block){length=node.children.reduce((sum,child)=>sum+(child.kind==="text"?child.text.length:0),0);return true;}return node.children?.some(child=>child.kind==="element"&&walk(child));};walk(root);
 const point={block,offset:String(length),affinity:"after"};target.execute({kind:"setSelection",selection:{kind:"text",anchor:point,focus:point}});target.focus();},{block,editor});
test.beforeEach(async({page})=>{await page.goto("/demo");await expect(page.locator("#ready")).toHaveText("Ready — real Rust/Wasm editor");});

test("an RTL UI catalog mirrors the chrome and leaves content direction alone",async({page})=>{
 await localize(page);
 const toolbar=page.getByRole("toolbar",{name:"تنسيق النص"}),surface=page.getByRole("textbox",{name:"محرر النص المنسق"});
 await expect(toolbar).toHaveAttribute("dir","rtl");await expect(toolbar).toHaveAttribute("lang","ar");
 expect(await toolbar.evaluate(node=>getComputedStyle(node).direction)).toBe("rtl");
 expect(await surface.evaluate(node=>[getComputedStyle(node).direction,node.getAttribute("dir"),node.getAttribute("lang")])).toEqual(["ltr",null,null]);
 // The first control sits at the inline start, which is the right edge under RTL chrome.
 const undo=await toolbar.getByRole("button",{name:"تراجع"}).boundingBox(),redo=await toolbar.getByRole("button",{name:"إعادة"}).boundingBox();
 expect(undo.x).toBeGreaterThan(redo.x);
 await expect(toolbar.getByRole("button",{name:"عريض"})).toBeVisible();await expect(toolbar.getByRole("button",{name:"Merge cells"})).toBeVisible();
 await expect(page.getByRole("separator",{name:"تغيير عرض العمود 1 من 2"})).toHaveAttribute("aria-valuetext","380 بكسل");
});

test("RTL floating chrome opens toward inline-start and uses the catalog",async({page})=>{
 await localize(page);
 const cell=page.locator('[data-rich-block="demo-p2"]');await cell.dblclick({position:{x:12,y:8}});
 const floating=page.getByRole("toolbar",{name:"تنسيق التحديد"});await expect(floating).toBeVisible();await expect(floating).toHaveAttribute("dir","rtl");
 await floating.getByRole("button",{name:"عريض"}).click();await expect(cell.locator("strong")).toHaveCount(1);
 const box=await cell.boundingBox(),x=Math.round(box.x+150),y=Math.round(box.y+8);await page.mouse.click(x,y,{button:"right"});
 const menu=page.getByRole("menu",{name:"إجراءات المحرر"});await expect(menu).toBeVisible();await expect(menu.getByRole("menuitem",{name:"تراجع"})).toBeFocused();
 const rect=await menu.boundingBox();expect(Math.abs(rect.x+rect.width-x)).toBeLessThanOrEqual(1);
 await page.keyboard.press("Escape");await expect(menu).toBeHidden();
});

test("the slash menu filters and runs localized standard items",async({page,browserName})=>{
 await localize(page);await caretAtEnd(page,"demo-footer","localized");await page.keyboard.type(" /");
 const listbox=page.getByRole("listbox",{name:"الأوامر"});await expect(listbox).toBeVisible();
 await expect(page.locator("[data-breditor-slash]")).toHaveAttribute("dir","rtl");
 // Playwright's Firefox delivers non-layout characters as IME composition, which ends a slash session by
 // design; there the localized items are reached through their stable id prefix instead.
 const query=browserName==="firefox"?"hea":"عنوان";
 await page.keyboard.type(query);await expect(listbox.getByRole("option")).toHaveText(["عنوان 1","عنوان 2","عنوان 3"]);
 await expect(page.locator("[data-slash-status]")).toHaveText("الأوامر المتاحة: 3");
 await page.keyboard.press("ArrowDown");await page.keyboard.press("Enter");
 const footer=page.locator('[data-rich-block="demo-footer"]');await expect(footer).toHaveJSProperty("tagName","H2");await expect(footer).not.toContainText(`/${query}`);
 await expect(page.locator(".breditor-rich-status")).toHaveText(/^content · المراجعة \d+$/);
});

test("mixed-direction text keeps the Rust selection on the native bidi caret",async({page})=>{
 const footer=page.locator('[data-rich-block="demo-footer"]');await caretAtEnd(page,"demo-footer");
 const before=await footer.evaluate(node=>node.textContent.length);
 await page.keyboard.type(" abc مرحبا بالعالم def");
 const added=" abc مرحبا بالعالم def",total=before+added.length;
 await expect(footer).toContainText(added);
 // DOM offsets of the native selection within the block, compared with the Rust selection after each key.
 const read=()=>page.evaluate(()=>{const block=document.querySelector('[data-rich-block="demo-footer"]'),selection=getSelection();
  const offset=(node,at)=>{const range=document.createRange();range.selectNodeContents(block);range.setEnd(node,at);return range.toString().length;};
  const rust=window.demo.editor.view().selection;return {dom:[offset(selection.anchorNode,selection.anchorOffset),offset(selection.focusNode,selection.focusOffset)],rust:[Number(rust.anchor.offset),Number(rust.focus.offset)]};});
 let state=await read();expect(state.rust).toEqual([total,total]);
 for(let step=0;step<14;step++){
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async()=>{state=await read();return JSON.stringify(state.rust)===JSON.stringify(state.dom);}).toBe(true);
 }
 // Native bidi movement is visual; logical offsets still match and stay inside the typed run.
 expect(state.rust[1]).toBeGreaterThanOrEqual(before);expect(state.rust[1]).toBeLessThan(total);
 // The footer wraps, so End would stop at a visual line end; place the caret at the logical end instead.
 await caretAtEnd(page,"demo-footer");await page.keyboard.press("Shift+ArrowLeft");await page.keyboard.press("Shift+ArrowLeft");await page.keyboard.press("Shift+ArrowLeft");
 await expect.poll(async()=>{state=await read();return JSON.stringify(state.rust)===JSON.stringify(state.dom);}).toBe(true);
 expect(state.rust).toEqual([total,total-3]);
 await page.keyboard.type("XYZ");await expect(footer).toContainText(" abc مرحبا بالعالم XYZ");
 // A Rust selection over the whole Arabic run paints the exact native range, and typing replaces it.
 await page.evaluate(({start,end})=>{const editor=window.demo.editor;editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"demo-footer",offset:String(start),affinity:"after"},focus:{block:"demo-footer",offset:String(end),affinity:"after"}}});editor.focus();},{start:before+5,end:before+18});
 const selected=await page.evaluate(()=>getSelection().toString());expect(selected).toBe("مرحبا بالعالم");
 await page.keyboard.type("سلام");await expect(footer).toContainText(" abc سلام XYZ");
 // Firefox commits this as one composition, which the owner publishes after compositionend.
 await expect.poll(()=>page.evaluate(()=>window.demo.editor.view().documentJson)).toContain(" abc سلام XYZ");
});
