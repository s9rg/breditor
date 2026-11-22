import {test,expect} from "@playwright/test";
// Optional typography-v1 over the actual Rust/Wasm owner: real keyboard typing, exact Undo and exclusions.
test.beforeEach(async({page})=>{await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");await page.evaluate(async()=>{
 const api=await import("/rich.js"),configuration={format:"breditor/profile-bootstrap",formatVersion:8,schema:{name:"example/typography",version:1},extensions:[]};
 const profile=api.compileStandardLayoutRichProfileV3(window.rich.wasm,JSON.stringify(configuration)),binding=profile.descriptor(),presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson());
 const block=(type,id,text)=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":id},children:text?[{kind:"text",text,formats:[]}]:[]});
 const errors=[];let editor,core;const host=document.createElement("main");document.body.append(host);
 const mount=(options={},natural=false,text="",kind="paragraph")=>{editor?.dispose();host.replaceChildren();
  core=profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[block(kind,"p",text)]}}));
  if(natural)core.enableTypingHistory();
  editor=api.mountRichEditor(host,{core,inlinePresentation:presentation,onError:error=>errors.push(String(error)),...options});
  editor.focus?.();const at={block:"p",offset:String(text.length),affinity:"after"};editor.execute({kind:"setSelection",selection:{kind:"text",anchor:at,focus:at}});
  window.ty.core=core;window.ty.editor=editor;};
 const text=()=>JSON.parse(core.documentJson()).root.children.map(b=>b.children.map(run=>run.text).join(""));
 window.ty={api,mount,text,errors,core,editor};
});});
const undo=page=>page.keyboard.press("ControlOrMeta+z");
const text=page=>page.evaluate(()=>window.ty.text());

for(const [name,options,natural] of [["typography-v1",{inputRules:"typography-v1"},false],["markdown-v1 + typography-v1, natural typing",{inputRules:["markdown-v1","typography-v1"]},true]]){
 test(`${name}: typed quotes, dashes, symbols and fractions convert; one Undo restores the typed characters`,async({page})=>{
  await page.evaluate(([options,natural])=>window.ty.mount(options,natural),[options,natural]);
  await page.keyboard.type("\"It's 1/2 -- (c) wait...\" a != b");
  expect(await text(page)).toEqual(["“It’s ½ – © wait…” a ≠ b"]);
  await expect(page.locator('[data-rich-text="p"]')).toHaveText("“It’s ½ – © wait…” a ≠ b");
  // The last conversion is its own group: one Undo restores the typed "(tm)", Redo reapplies it.
  await page.keyboard.type(" (tm)");
  expect(await text(page)).toEqual(["“It’s ½ – © wait…” a ≠ b ™"]);
  await undo(page);
  expect(await text(page)).toEqual(["“It’s ½ – © wait…” a ≠ b (tm)"]);
  await page.keyboard.press("ControlOrMeta+y");
  expect(await text(page)).toEqual(["“It’s ½ – © wait…” a ≠ b ™"]);
  // The caret follows the replacement: further typing lands after it.
  await page.keyboard.type("!");
  expect(await text(page)).toEqual(["“It’s ½ – © wait…” a ≠ b ™!"]);
  expect(await page.evaluate(()=>window.ty.errors)).toEqual([]);
 });
}

test("configured quotes (German, French with no-break spaces) and rule selection",async({page})=>{
 await page.evaluate(()=>window.ty.mount({inputRules:{rule:"typography-v1",quotes:"german"}}));
 await page.keyboard.type("Er sagt \"geht's\" und 'so'.");
 expect(await text(page)).toEqual(["Er sagt „geht’s“ und ‚so‘."]);
 await page.evaluate(()=>window.ty.mount({inputRules:{rule:"typography-v1",include:["quotes"],quotes:"french"}}));
 await page.keyboard.type("Il dit \"oui\" (c)...");
 expect(await text(page)).toEqual(["Il dit « oui » (c)..."]);
 await undo(page);
 expect(await text(page)).toEqual(["Il dit « oui » (c).."]);
 // Invalid configuration rejects before mounting.
 expect(await page.evaluate(()=>{try{window.ty.mount({inputRules:{rule:"typography-v1",include:["nope"]}});return "mounted";}catch(error){return String(error);}})).toContain("typography-v1");
 expect(await page.evaluate(()=>window.ty.errors)).toEqual([]);
});

test("code blocks, inline code, paste, composition and default-off input stay literal",async({page})=>{
 await page.evaluate(()=>window.ty.mount({inputRules:"typography-v1"},false,"x","code-block"));
 await page.keyboard.type(" \"a\" -- (c)...");
 expect(await text(page)).toEqual(["x \"a\" -- (c)..."]);
 // Inline code is inert.
 await page.evaluate(()=>{const t=window.ty;t.mount({inputRules:"typography-v1"},false,"x (c");t.editor.execute({kind:"setInlineFormat",data:{change:{kind:"set",formatsJson:JSON.stringify([{type:"breditor-inline/code",properties:{}}])},targets:[{block:"p",start:"2",end:"4"}]}});t.editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"p",offset:"4",affinity:"after"},focus:{block:"p",offset:"4",affinity:"after"}}});});
 await page.keyboard.type(")");
 expect(await text(page)).toEqual(["x (c)"]);
 // Paste is not typing.
 await page.evaluate(()=>window.ty.mount({inputRules:"typography-v1"},false,"a "));
 await page.evaluate(()=>{const data=new DataTransfer();data.setData("text/plain","\"q\" (c) -- ... ");const event=new ClipboardEvent("paste",{bubbles:true,cancelable:true,clipboardData:data});if(event.clipboardData!==data)event.clipboardData.setData("text/plain","\"q\" (c) -- ... ");window.ty.editor.surface.dispatchEvent(event);});
 expect(await text(page)).toEqual(["a \"q\" (c) -- ... "]);
 // Composition commits its text literally.
 await page.evaluate(()=>window.ty.mount({inputRules:"typography-v1"},false,"a"));
 await page.evaluate(()=>{const surface=window.ty.editor.surface,block=surface.querySelector('[data-rich-text="p"]');
  surface.dispatchEvent(new CompositionEvent("compositionstart",{bubbles:true}));block.textContent="a\"(c)";
  surface.dispatchEvent(new CompositionEvent("compositionend",{bubbles:true,data:"\"(c)"}));});
 await expect.poll(()=>text(page)).toEqual(["a\"(c)"]);
 // Omitted inputRules keeps literal input.
 await page.evaluate(()=>window.ty.mount({}));
 await page.keyboard.type("\"a\" (c)...");
 expect(await text(page)).toEqual(["\"a\" (c)..."]);
 expect(await page.evaluate(()=>window.ty.errors)).toEqual([]);
});
