import {test,expect} from "@playwright/test";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";
// Opt-in HTML source view over the actual Rust/Wasm document owner and the real bounded interchange adapter.
// The adapter is bundled for this test only; the demo pages do not mount the source view.
let interchange="";
test.beforeAll(async()=>{
 const bundle=await rolldown({input:fileURLToPath(new URL("../../packages/breditor-interchange/src/index.ts",import.meta.url)),platform:"browser",logLevel:"silent"});
 interchange=(await bundle.generate({format:"esm"})).output[0].code;await bundle.close();
});
async function mount(page,{readOnly=false}={}){
 await page.route("**/interchange.js",route=>route.fulfill({status:200,contentType:"text/javascript; charset=utf-8",body:interchange}));
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async readOnly=>{
  const rich=await import("/rich.js"),{createRichInterchange}=await import("/interchange.js");
  const profile=rich.compileStandardLayoutRichProfileV3(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:8,schema:{name:"example/source-view",version:1},extensions:[]}));
  const binding=profile.descriptor(),canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  const element=(type,id,children=[])=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":id},children});
  const paragraph=(id,text)=>element("paragraph",id,[{kind:"text",text,formats:[]}]);
  const heading=element("heading","title",[{kind:"text",text:"Original title",formats:[]}]);heading.properties["breditor/level"]=2;
  const root=element("document","unused",[heading,paragraph("body","Original body")]);root.properties={"breditor/document-id":"room"};
  const core=profile.createDocumentEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(root)}));
  profile.dispose();if(readOnly)core.setReadOnly(true);
  document.body.insertAdjacentHTML("beforeend",'<main id="editor"></main><aside id="source"></aside>');
  const editor=rich.mountDocumentRichEditor(document.getElementById("editor"),{core,selectionEditing:"document-v1",clipboardInterchange:createRichInterchange(core)});
  const view=rich.mountRichSourceView(document.getElementById("source"),editor.documentSource());
  window.sourceTest={editor,view,core,max:rich.RICH_DOCUMENT_SOURCE_MAX_BYTES};
 },readOnly);
}
const state=page=>page.evaluate(()=>{const v=window.sourceTest.editor.view();return{revision:v.revision,undo:v.undoDepth,documentJson:v.documentJson};});
const source=page=>page.locator("[data-breditor-source]");

test("export, edit as text, review the loss report and apply as one Undo step",async({page})=>{
 await mount(page);const panel=source(page),text=panel.locator("textarea[data-source-text]");
 await panel.getByRole("button",{name:"Edit HTML source"}).click();
 await expect(text).toBeFocused();await expect(text).toHaveValue(/<h2[^>]*>Original title<\/h2>.*<p[^>]*>Original body<\/p>/s);
 expect(await text.evaluate(node=>node.isContentEditable)).toBe(false);
 const before=await state(page);await expect(panel.getByRole("button",{name:"Apply"})).toBeDisabled();
 await text.fill(`<h1 onclick="window.pwned=1">Edited <em>title</em></h1><script>window.pwned=2</script><style>h1{color:red}</style><p style="position:fixed">Edited body with <a href="javascript:window.pwned=3">a bad link</a></p><img src="https://example.invalid/x.png" onerror="window.pwned=4">`);
 await panel.getByRole("button",{name:"Review changes"}).click();
 const report=panel.locator("[data-source-report]");
 await expect(report.locator("[data-source-loss=removed-content]")).toContainText("Removed content (scripts");
 await expect(report.locator("[data-source-loss=unsupported-attribute]")).toContainText("Removed attributes (event handlers");
 await expect(report.locator("[data-source-loss=unsafe-link]")).toBeVisible();await expect(report.locator("[data-source-loss=unsupported-style]")).toBeVisible();
 expect((await state(page)).revision).toBe(before.revision);
 await panel.getByRole("button",{name:"Apply"}).click();
 await expect(panel.locator("[data-source-status]")).toContainText("Applied as one change");await expect(text).toBeHidden();
 const after=await state(page);expect(after.undo).toBe(before.undo+1);
 for(const forbidden of ["pwned","onclick","onerror","script","javascript:","position"])expect(after.documentJson).not.toContain(forbidden);
 const surface=page.locator(".breditor-rich-surface");await expect(surface.locator("h1")).toHaveText("Edited title");expect(after.documentJson).toContain("breditor-inline/italic");
 await expect(surface).toContainText("a bad link");await expect(surface).not.toContainText("Original body");
 expect(await page.evaluate(()=>window.pwned)).toBeUndefined();expect(await surface.locator("script,style,[onclick],[onerror]").count()).toBe(0);
 // The stylesheet rule was not kept as CSS; its supported declaration became a semantic text color.
 expect(after.documentJson).toContain("breditor-inline/text-color");
 // Re-applying an exported source is stable: the paste's own trailing empty paragraph is not duplicated.
 await panel.getByRole("button",{name:"Edit HTML source"}).click();const exported=await text.inputValue();
 await text.fill(`${exported}\n`);await panel.getByRole("button",{name:"Review changes"}).click();
 await expect(report.locator("[data-source-loss=none]")).toHaveText("Nothing will be removed or approximated.");
 await panel.getByRole("button",{name:"Apply"}).click();expect((await state(page)).undo).toBe(before.undo+2);
 await panel.getByRole("button",{name:"Edit HTML source"}).click();await expect(text).toHaveValue(exported);await panel.getByRole("button",{name:"Cancel"}).click();
 await page.evaluate(()=>window.sourceTest.editor.execute({kind:"undo"}));await page.evaluate(()=>window.sourceTest.editor.execute({kind:"undo"}));
 await expect(surface).toContainText("Original body");await expect(surface.locator("h2")).toHaveText("Original title");expect((await state(page)).undo).toBe(before.undo);
});

test("a document change after opening makes Apply refuse with a clear message",async({page})=>{
 await mount(page);const panel=source(page),text=panel.locator("textarea[data-source-text]");
 await panel.getByRole("button",{name:"Edit HTML source"}).click();await text.fill("<p>Mine</p>");await panel.getByRole("button",{name:"Review changes"}).click();
 await page.evaluate(()=>window.sourceTest.editor.replaceDocumentPlainText("Someone else"));
 await expect(panel.locator("[data-source-status]")).toContainText("The document changed after the source view opened");
 await expect(panel.getByRole("button",{name:"Apply"})).toBeDisabled();
 const refusal=await page.evaluate(()=>{try{window.sourceTest.view.apply();return "applied";}catch(error){return error.message;}});
 expect(refusal).toMatch(/Nothing was applied; reload the source/);
 await expect(page.locator(".breditor-rich-surface")).toContainText("Someone else");
 await panel.getByRole("button",{name:"Reload source"}).click();await expect(text).toHaveValue(/Someone else/);
 await panel.getByRole("button",{name:"Cancel"}).click();await expect(text).toBeHidden();await expect(page.locator(".breditor-rich-surface")).toContainText("Someone else");
});

test("source apply preserves an authored final paragraph with layout",async({page})=>{
 await mount(page);const panel=source(page),text=panel.locator("textarea[data-source-text]");
 await panel.getByRole("button",{name:"Edit HTML source"}).click();const before=await state(page);
 await text.fill('<p>Body</p><p style="text-align:right"></p>');
 await panel.getByRole("button",{name:"Review changes"}).click();
 await panel.getByRole("button",{name:"Apply"}).click();
 const after=await state(page),blocks=JSON.parse(after.documentJson).root.children;
 expect(after.undo).toBe(before.undo+1);
 expect(blocks).toHaveLength(3);
 expect(blocks[1]).toMatchObject({type:"breditor/paragraph",properties:{"breditor/block-align":6},children:[]});
 expect(blocks[2].properties["breditor/block-align"]).toBeUndefined();
 expect(blocks[2].children).toEqual([]);
 await page.evaluate(()=>window.sourceTest.editor.execute({kind:"undo"}));
 expect((await state(page)).documentJson).toBe(before.documentJson);
});

test("read-only editors get a view-only source and the size bound refuses before parsing",async({page})=>{
 await mount(page,{readOnly:true});const panel=source(page),text=panel.locator("textarea[data-source-text]");
 await panel.getByRole("button",{name:"View HTML source"}).click();await expect(text).toHaveJSProperty("readOnly",true);await expect(text).toHaveValue(/Original body/);
 await expect(panel.getByRole("button",{name:"Apply"})).toBeHidden();await expect(panel.getByRole("button",{name:"Review changes"})).toBeHidden();
 await page.evaluate(()=>window.sourceTest.editor.setReadOnly(false));await panel.getByRole("button",{name:"Close"}).click();
 await panel.getByRole("button",{name:"Edit HTML source"}).click();
 const before=await state(page);
 await page.evaluate(()=>window.sourceTest.view.setSource(`<p>${"x".repeat(window.sourceTest.max+1)}</p>`));
 await panel.getByRole("button",{name:"Review changes"}).click();
 await expect(panel.locator("[data-source-status]")).toContainText("Nothing can be applied: the source exceeds the interchange limits");
 await expect(panel.getByRole("button",{name:"Apply"})).toBeDisabled();expect(await state(page)).toEqual(before);
});
