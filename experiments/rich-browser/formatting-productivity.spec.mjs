import {test,expect} from "@playwright/test";
// Opt-in formatting-productivity controls over the actual Rust/Wasm owner: special characters,
// native case change (buttons and Shift+F3) and the format painter. Every edit is one Undo step.
test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const api=await import("/rich.js");
  const bootstrap=JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:{name:"example/productivity",version:4},extensions:[]});
  const run=(text,formats=[])=>({kind:"text",text,formats});
  const block=(id,children,type="breditor/paragraph")=>({kind:"element",type,entityId:null,properties:{"breditor/block-id":id},children});
  const strong={type:"breditor/strong",properties:{}};
  const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[
   block("p",[run("Bold",[strong]),run(" straße and ")]),block("q",[run("the lord of the rings")])]};
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,bootstrap),binding=profile.descriptor();
  const core=profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root}));
  const presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson()),host=document.createElement("main"),errors=[];document.body.append(host);
  const toolbar=[...api.createRichToolbarV4(core,presentation),...api.createFormattingProductivityToolbar(core,presentation)];
  const editor=api.mountRichEditor(host,{core,inlinePresentation:presentation,toolbar,onError:error=>errors.push(String(error))});
  const select=(anchor,start,focus=anchor,end=start)=>({kind:"setSelection",selection:{kind:"text",anchor:{block:anchor,offset:String(start),affinity:"after"},focus:{block:focus,offset:String(end),affinity:"after"}}});
  const runs=id=>JSON.parse(core.documentJson()).root.children.find(n=>n.properties["breditor/block-id"]===id).children;
  const at=(anchor,start,focus,end)=>{editor.execute(select(anchor,start,focus,end));editor.focus();};
  window.t={api,core,editor,host,errors,select,runs,at,strong};
 });
});
const strong={type:"breditor/strong",properties:{}};
const run=(text,formats=[])=>({kind:"text",text,formats});

test("case buttons change letter case across blocks, keep formats and are one Undo step",async({page})=>{
 expect(await page.evaluate(()=>window.t.core.supportsCaseChange())).toBe(true);
 await page.evaluate(()=>window.t.at("p",2,"q",3));
 const before=await page.evaluate(()=>({doc:window.t.core.documentJson(),depth:window.t.core.view().undoDepth}));
 await page.locator('[data-rich-action="case-upper"]').click();
 await expect.poll(()=>page.evaluate(()=>window.t.runs("p"))).toEqual([run("BoLD",[strong]),run(" STRASSE AND ")]);
 expect(await page.evaluate(()=>window.t.runs("q"))).toEqual([run("THE lord of the rings")]);
 expect(await page.evaluate(()=>window.t.core.view().undoDepth)).toBe(before.depth+1);
 await expect(page.locator('[data-rich-text="p"] strong')).toHaveText("BoLD");
 await page.evaluate(()=>window.t.editor.execute({kind:"undo"}));
 expect(await page.evaluate(()=>window.t.core.documentJson())).toBe(before.doc);
 // Title Case keeps minor words lowercase; a caret changes its whole block.
 await page.evaluate(()=>window.t.at("q",5));
 await page.locator('[data-rich-action="case-title"]').click();
 await expect.poll(()=>page.evaluate(()=>window.t.runs("q"))).toEqual([run("The Lord of the Rings")]);
 expect(await page.evaluate(()=>window.t.errors)).toEqual([]);
});

test("Shift+F3 cycles Title, UPPER and lower from all-lowercase text",async({page})=>{
 await page.evaluate(()=>window.t.at("q",0,"q",21));
 const seen=[];
 for(let i=0;i<3;i++){
  await page.keyboard.press("Shift+F3");
  await expect.poll(()=>page.evaluate(()=>window.t.runs("q")[0].text)).not.toBe(seen.at(-1)??"the lord of the rings");
  seen.push(await page.evaluate(()=>window.t.runs("q")[0].text));
 }
 expect(seen).toEqual(["The Lord of the Rings","THE LORD OF THE RINGS","the lord of the rings"]);
 expect(await page.evaluate(()=>window.t.core.view().undoDepth)).toBe(3);
 expect(await page.evaluate(()=>window.t.errors)).toEqual([]);
});

test("the special-character picker searches, navigates by keyboard and inserts with caret formats",async({page})=>{
 // Inside the bold run the caret's effective formats are bold, exactly as for typed text.
 await page.evaluate(()=>window.t.at("p",2));
 const depth=await page.evaluate(()=>window.t.core.view().undoDepth);
 // Mod+Alt+S opens the picker from the editing surface and focuses its search field.
 await page.keyboard.press("Control+Alt+KeyS");
 const search=page.locator("[data-special-character-search]");
 await expect(search).toBeFocused();
 await search.fill("euro");
 await expect(page.locator(".breditor-special-characters [role=status]")).toHaveText("1 character");
 await page.keyboard.press("ArrowDown");
 await expect(page.locator('[role=gridcell][data-special-character="€"]')).toBeFocused();
 await page.keyboard.press("Enter");
 await expect.poll(()=>page.evaluate(()=>window.t.runs("p"))).toEqual([run("Bo€ld",[strong]),run(" straße and ")]);
 expect(await page.evaluate(()=>window.t.core.view().undoDepth)).toBe(depth+1);
 // A range is replaced by the chosen character.
 await page.evaluate(()=>window.t.at("q",4,"q",8));
 await page.locator('[data-rich-control="special-characters"] summary').click();
 await search.fill("rightwards arrow");
 await page.locator('[role=gridcell][data-special-character="→"]').click();
 await expect.poll(()=>page.evaluate(()=>window.t.runs("q")[0].text)).toBe("the → of the rings");
 await page.evaluate(()=>window.t.editor.execute({kind:"undo"}));
 expect(await page.evaluate(()=>window.t.runs("q")[0].text)).toBe("the lord of the rings");
 expect(await page.evaluate(()=>window.t.errors)).toEqual([]);
});

test("the format painter copies once, sticks on double-click and Escape cancels",async({page})=>{
 const painter=page.locator('[data-rich-action="format-painter"]');
 await page.evaluate(()=>window.t.at("p",2));
 await painter.click();
 await expect(painter).toHaveAttribute("aria-pressed","true");
 const depth=await page.evaluate(()=>window.t.core.view().undoDepth);
 await page.evaluate(()=>{window.t.at("q",4,"q",8);window.t.editor.surface.dispatchEvent(new PointerEvent("pointerup",{bubbles:true}));});
 await expect.poll(()=>page.evaluate(()=>window.t.runs("q"))).toEqual([run("the "),run("lord",[strong]),run(" of the rings")]);
 await expect(painter).toHaveAttribute("aria-pressed","false");
 expect(await page.evaluate(()=>window.t.core.view().undoDepth)).toBe(depth+1);
 // Copy plain formatting with a double-click and paint twice (sticky), removing bold both times.
 await page.evaluate(()=>window.t.at("q",1));
 await painter.dblclick();
 await expect(painter).toHaveAttribute("aria-pressed","true");
 await page.evaluate(()=>{window.t.at("p",0,"p",2);window.t.editor.surface.dispatchEvent(new PointerEvent("pointerup",{bubbles:true}));});
 await expect.poll(()=>page.evaluate(()=>window.t.runs("p")[0])).toEqual(run("Bo"));
 await page.evaluate(()=>{window.t.at("q",4,"q",6);window.t.editor.surface.dispatchEvent(new PointerEvent("pointerup",{bubbles:true}));});
 await expect.poll(()=>page.evaluate(()=>window.t.runs("q"))).toEqual([run("the lo"),run("rd",[strong]),run(" of the rings")]);
 await expect(painter).toHaveAttribute("aria-pressed","true");
 await page.evaluate(()=>window.t.editor.focus());
 await page.keyboard.press("Escape");
 await expect(painter).toHaveAttribute("aria-pressed","false");
 // Mod+Alt+C copies at the caret and Mod+Alt+V applies to the selection.
 await page.evaluate(()=>window.t.at("q",7));
 await page.keyboard.press("Control+Alt+KeyC");
 await expect(painter).toHaveAttribute("aria-pressed","true");
 await page.evaluate(()=>window.t.at("q",0,"q",3));
 await page.keyboard.press("Control+Alt+KeyV");
 await expect.poll(()=>page.evaluate(()=>window.t.runs("q")[0])).toEqual(run("the",[strong]));
 expect(await page.evaluate(()=>window.t.errors)).toEqual([]);
});
