import {test,expect} from "@playwright/test";
// Opt-in chrome catalog and RTL chrome against the real Rust/Wasm owner. The Arabic strings are a test-only catalog.
const arabic={lang:"ar",direction:"rtl",
 strings:{richEditorLabel:"محرر النص المنسق",richToolbarLabel:"تنسيق النص",richStatusOutcome:"{outcome} · المراجعة {revision}",
  selectionToolbarLabel:"تنسيق التحديد",contextMenuLabel:"إجراءات المحرر",slashLabel:"الأوامر",slashCount:"الأوامر المتاحة: {count}",slashCountOne:"أمر واحد متاح",
  columnResizeLabel:"تغيير عرض العمود {index} من {count}",columnResizeValue:"{width} بكسل",
  panelEditorClosed:"المحرر مغلق",panelReadOnly:"للقراءة فقط",
  searchLabel:"بحث واستبدال",searchFind:"بحث",searchRegex:"تعبير نمطي",searchMatchCase:"مطابقة حالة الأحرف",searchWholeWords:"كلمات كاملة",searchWrap:"التفاف",
  searchReplaceWith:"استبدال بـ",searchExpandCaptures:"توسيع المجموعات",searchPrevious:"السابق",searchNext:"التالي",searchReplace:"استبدال",searchReplaceAll:"استبدال الكل",searchClose:"إغلاق",
  searchCount:"النتائج: {count}",searchPosition:"{index} من {count}",searchPending:"جارٍ تطبيق إجراء البحث",
  writingLabel:"أدوات الكتابة",writingOutlineLabel:"مخطط العناوين",writingCountWords:"مقاطع الكلمات",writingCountGraphemes:"الأحرف (وحدات الكتابة)",writingCountScalars:"قيم يونيكود",
  writingCountUtf16:"وحدات UTF-16",writingCountUtf8:"بايتات UTF-8",writingCountBlocks:"كتل النص",writingHeading:"ع{level} {label}",writingPages:"العناوين {start}–{end} من {total}",
  writingPrevious:"العناوين السابقة",writingNext:"العناوين التالية",writingRefresh:"تحديث",writingAccepted:"المستند المعتمد · المراجعة {revision}",writingPending:"جارٍ الانتقال إلى العنوان المعروض"},
 refusals:{"breditor_rich.search_query":"نص البحث غير صالح."},
 controls:{undo:{label:"تراجع"},redo:{label:"إعادة"},bold:{label:"عريض"},heading:{label:"عنوان 2"},alt:{label:"النص البديل"}},
 slashItems:{paragraph:{label:"نص"},"heading-1":{label:"عنوان 1"},"heading-2":{label:"عنوان 2"},"heading-3":{label:"عنوان 3"},"bullet-list":{label:"قائمة نقطية"},"numbered-list":{label:"قائمة مرقمة"},table:{label:"جدول"}}};
const pixel="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
/** Mount the search panel and writing tools beside the localized editor; both read `editor.uiLocale()`. */
async function localizePanels(page){
 await localize(page);
 await page.evaluate(async()=>{
  const rich=await import("/rich.js"),editor=window.localized.editor,anchor=document.getElementById("editor"),search=document.createElement("div"),writing=document.createElement("div");
  search.id="search-host";writing.id="writing-host";anchor.after(search,writing);
  window.localized.extras.push(rich.mountRichSearchPanel(search,editor,{debounceMs:0}),rich.mountRichWritingTools(writing,editor,{debounceMs:0}));
 });
}
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
test.beforeEach(async({page})=>{await page.goto("/demo",{waitUntil:"commit"});await expect(page.locator("#ready")).toHaveText("Ready — real Rust/Wasm editor");});

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

test("the search panel mirrors under RTL chrome, keeps logical tab order and searches through Rust",async({page,browserName})=>{
 await localizePanels(page);
 const panel=page.getByRole("search",{name:"بحث واستبدال"});await expect(panel).toBeVisible();
 await expect(panel).toHaveAttribute("dir","rtl");await expect(panel).toHaveAttribute("lang","ar");
 expect(await panel.evaluate(node=>getComputedStyle(node).direction)).toBe("rtl");
 expect(await page.getByRole("textbox",{name:"محرر النص المنسق"}).evaluate(node=>[getComputedStyle(node).direction,node.getAttribute("dir")])).toEqual(["ltr",null]);
 const find=panel.getByRole("textbox",{name:"بحث"}),regex=panel.getByRole("checkbox",{name:"تعبير نمطي"});
 // The first field sits at the inline start (right), so the next one in logical order is to its left on the same row.
 const [findBox,regexBox]=[await find.boundingBox(),await regex.boundingBox()];
 expect(Math.abs(findBox.y+findBox.height/2-(regexBox.y+regexBox.height/2))).toBeLessThan(findBox.height);expect(findBox.x).toBeGreaterThan(regexBox.x);
 const previous=await panel.getByRole("button",{name:"السابق"}).boundingBox(),next=await panel.getByRole("button",{name:"التالي"}).boundingBox();
 if(Math.abs(previous.y-next.y)<previous.height)expect(previous.x).toBeGreaterThan(next.x);
 // Tab follows the logical order whatever the visual mirroring. WebKit's default Tab skips checkboxes and
 // buttons (macOS full keyboard access is off), so there the next stop is the replacement field.
 const macWebKit=browserName==="webkit"&&process.platform==="darwin";
 const after=macWebKit?panel.getByRole("textbox",{name:"استبدال بـ"}):regex;
 await find.focus();await page.keyboard.press("Tab");await expect(after).toBeFocused();
 await page.keyboard.press("Shift+Tab");await expect(find).toBeFocused();
 await find.fill("Rich");const status=panel.locator("[data-search-status]");
 await expect(status).toHaveText(/^النتائج: [1-9]\d*$/);const total=Number((await status.textContent()).split(" ").pop());
 await find.press("Enter");await expect(status).toHaveText(`1 من ${total}`);
 const selected=await page.evaluate(()=>{const s=window.localized.editor.view().selection;return s?.kind==="text"&&(s.anchor.block!==s.focus.block||s.anchor.offset!==s.focus.offset);});expect(selected).toBe(true);
 await find.press("Shift+Enter");await expect(status).toHaveText(`${total} من ${total}`);
 // A native refusal code in the status line is shown through the catalog.
 await regex.check();await find.fill("(");await expect(status).toHaveText("نص البحث غير صالح.");
 await expect(panel.getByRole("button",{name:"استبدال الكل"})).toBeVisible();
});

test("writing tools localize counts and the outline, isolate heading text and keep arrow order logical",async({page})=>{
 await localizePanels(page);
 const tools=page.getByRole("region",{name:"أدوات الكتابة"});await expect(tools).toBeVisible();
 await expect(tools).toHaveAttribute("dir","rtl");await expect(tools).toHaveAttribute("lang","ar");
 await expect(tools.locator("dt").first()).toHaveText("مقاطع الكلمات");
 await expect(tools.locator("[data-writing-status]")).toHaveText(/^المستند المعتمد · المراجعة \d+$/);
 const outline=tools.getByRole("list",{name:"مخطط العناوين"}),items=outline.getByRole("button");
 await expect(items).toHaveCount(2);
 await expect(items.first()).toHaveText(/^ع\d One Rust document\. Rich content\.$/);
 // The Latin heading keeps its own direction inside the RTL button, and the button aligns to the inline start (right).
 expect(await items.first().evaluate(node=>{const bdi=node.querySelector("bdi");return [bdi?.textContent,getComputedStyle(node).direction,getComputedStyle(node).textAlign];})).toEqual(["One Rust document. Rich content.","rtl","start"]);
 const [button,text]=await items.first().evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);const a=node.getBoundingClientRect(),b=range.getBoundingClientRect();return [{left:a.left,right:a.right},{left:b.left,right:b.right}];});
 expect(button.right-text.right).toBeLessThan(text.left-button.left);
 await expect(tools.locator("[data-writing-pages]")).toHaveText("العناوين 1–2 من 2");
 // Up/Down follow document order under RTL chrome; Left/Right do not move between headings.
 await items.first().focus();await page.keyboard.press("ArrowDown");await expect(items.nth(1)).toBeFocused();
 await page.keyboard.press("ArrowLeft");await expect(items.nth(1)).toBeFocused();
 await page.keyboard.press("ArrowUp");await expect(items.first()).toBeFocused();await page.keyboard.press("End");await expect(items.nth(1)).toBeFocused();
 await page.keyboard.press("Enter");
 await expect.poll(()=>page.evaluate(()=>window.localized.editor.view().selection?.anchor?.block)).toBe("demo-p12");
 await expect(tools.locator("[data-writing-status]")).toHaveText(/^المستند المعتمد · المراجعة \d+$/);
});
