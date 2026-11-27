import {test,expect} from "@playwright/test";
// Opt-in named formatting presets (catalog case named-formatting-presets@1) over the actual Rust/Wasm owner:
// a host registry of named styles and highlight presets, each a bundle of typed standard formats. Applying or
// removing one is one native selection-format change and one Undo step; active/mixed state comes from Rust.
test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const api=await import("/rich.js");
  const bootstrap=JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:{name:"example/named-presets",version:4},extensions:[]});
  const run=(text,formats=[])=>({kind:"text",text,formats});
  const block=(id,children,type="breditor/paragraph")=>({kind:"element",type,entityId:null,properties:{"breditor/block-id":id},children});
  const strong={type:"breditor/strong",properties:{}};
  const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[
   block("p",[run("Bold",[strong]),run(" plain words")]),block("q",[run("the lord of the rings")])]};
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,bootstrap),binding=profile.descriptor();
  const core=profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root}));
  const presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson()),host=document.createElement("main"),errors=[];document.body.append(host);
  const namedPresets={styles:[{id:"big-red",label:"Big red",marks:["bold"],textColor:"#FF0000",textSize:24},{id:"code-ish",label:"Code-ish",marks:["code"],fontFamily:"mono"}],highlights:api.richDefaultHighlightPresets};
  const toolbar=[...api.createRichToolbarV4(core,presentation),...api.createFormattingProductivityToolbar(core,presentation,{specialCharacters:false,caseChange:false,formatPainter:false,namedPresets})];
  const editor=api.mountRichEditor(host,{core,inlinePresentation:presentation,toolbar,onError:error=>errors.push(String(error))});
  const select=(anchor,start,focus=anchor,end=start)=>({kind:"setSelection",selection:{kind:"text",anchor:{block:anchor,offset:String(start),affinity:"after"},focus:{block:focus,offset:String(end),affinity:"after"}}});
  const runs=(id,owner=core)=>JSON.parse(owner.documentJson()).root.children.find(n=>n.properties["breditor/block-id"]===id).children;
  const at=(anchor,start,focus,end)=>{editor.execute(select(anchor,start,focus,end));editor.focus();};
  window.t={api,profile,core,editor,host,errors,select,runs,at};
 });
});
const strong={type:"breditor/strong",properties:{}};
const red={type:"breditor-inline/text-color",properties:{"breditor-inline/rgb24":0xFF0000}};
const big={type:"breditor-inline/text-size",properties:{"breditor-inline/pixels":24}};
const yellow={type:"breditor-inline/background-color",properties:{"breditor-inline/rgb24":0xFDFD77}};
const run=(text,formats=[])=>({kind:"text",text,formats});
const sorted=formats=>[...formats].sort((a,b)=>a.type<b.type?-1:1);
async function choose(page,control,preset){
 const panel=page.locator(`[data-rich-control="${control}"]`);
 if(!await panel.evaluate(node=>node.open))await panel.locator("summary").click();
 await page.locator(`[data-rich-field="${control}-preset"]`).selectOption(preset);
 await page.locator(`[data-rich-action="${control}"]`).click();
}

test("a named style applies as one Undo step, shows active and mixed state and survives reopen",async({page})=>{
 await page.evaluate(()=>window.t.at("q",4,"q",8));
 const before=await page.evaluate(()=>({doc:window.t.core.documentJson(),depth:window.t.core.view().undoDepth}));
 await choose(page,"named-styles","big-red");
 await expect.poll(()=>page.evaluate(()=>window.t.runs("q"))).toEqual([run("the "),run("lord",sorted([strong,red,big])),run(" of the rings")]);
 expect(await page.evaluate(()=>window.t.core.view().undoDepth)).toBe(before.depth+1);
 await expect(page.locator('[data-rich-text="q"] strong')).toHaveText("lord");
 // Active: the dropdown reads the preset back from native selection-format state.
 const styles=page.locator('[data-rich-control="named-styles"]');
 await expect(styles).toHaveAttribute("data-state","uniform");
 await expect(page.locator('[data-rich-field="named-styles-preset"]')).toHaveValue("big-red");
 // Mixed: a selection that only partly carries the preset.
 await page.evaluate(()=>window.t.at("q",0,"q",8));
 await expect(styles).toHaveAttribute("data-state","mixed");
 await expect(page.locator('[data-rich-field="named-styles-preset"]')).toHaveValue("");
 // Exported typed formats reopen byte-identically through the document and checkpoint paths.
 const reopened=await page.evaluate(()=>{const t=window.t,json=t.core.documentJson();
  const fresh=t.profile.createEditor(json),restored=t.profile.restoreEditor(t.core.checkpointJson());
  const result={fresh:fresh.documentJson()===json,restored:restored.documentJson()===json};fresh.dispose();restored.dispose();return result;});
 expect(reopened).toEqual({fresh:true,restored:true});
 await page.evaluate(()=>window.t.editor.execute({kind:"undo"}));
 expect(await page.evaluate(()=>window.t.core.documentJson())).toBe(before.doc);
 expect(await page.evaluate(()=>window.t.errors)).toEqual([]);
});

test("a highlight preset applies and its remove choice clears only the highlight, each one Undo step",async({page})=>{
 await page.evaluate(()=>window.t.at("p",0,"p",10));
 const depth=await page.evaluate(()=>window.t.core.view().undoDepth);
 await choose(page,"highlight-presets","marker-yellow");
 await expect.poll(()=>page.evaluate(()=>window.t.runs("p"))).toEqual([run("Bold",sorted([strong,yellow])),run(" plain",[yellow]),run(" words")]);
 await expect(page.locator('[data-rich-control="highlight-presets"]')).toHaveAttribute("data-state","uniform");
 await expect(page.locator('[data-rich-text="p"] .breditor-inline-background-color').first()).toHaveCSS("background-color","rgb(253, 253, 119)");
 // Remove over a wider selection (mixed highlight) clears it and keeps bold.
 await page.evaluate(()=>window.t.at("p",0,"p",16));
 await expect(page.locator('[data-rich-control="highlight-presets"]')).toHaveAttribute("data-state","mixed");
 await choose(page,"highlight-presets","remove");
 await expect.poll(()=>page.evaluate(()=>window.t.runs("p"))).toEqual([run("Bold",[strong]),run(" plain words")]);
 expect(await page.evaluate(()=>window.t.core.view().undoDepth)).toBe(depth+2);
 await page.evaluate(()=>window.t.editor.execute({kind:"undo"}));
 expect(await page.evaluate(()=>window.t.runs("p"))).toEqual([run("Bold",sorted([strong,yellow])),run(" plain",[yellow]),run(" words")]);
 expect(await page.evaluate(()=>window.t.errors)).toEqual([]);
});

test("at a caret a preset sets the pending typing formats; read-only disables the dropdowns",async({page})=>{
 await page.evaluate(()=>window.t.at("q",21));
 await choose(page,"named-styles","code-ish");
 await page.evaluate(()=>window.t.editor.focus());
 await page.keyboard.type("x");
 const mono={type:"breditor-inline/font-family",properties:{"breditor-inline/family":4}},code={type:"breditor-inline/code",properties:{}};
 await expect.poll(()=>page.evaluate(()=>window.t.runs("q"))).toEqual([run("the lord of the rings"),run("x",sorted([code,mono]))]);
 await page.evaluate(()=>window.t.core.setReadOnly(true));
 await expect(page.locator('[data-rich-action="named-styles"]')).toBeDisabled();
 await expect(page.locator('[data-rich-action="highlight-presets"]')).toBeDisabled();
 expect(await page.evaluate(()=>window.t.errors)).toEqual([]);
});
