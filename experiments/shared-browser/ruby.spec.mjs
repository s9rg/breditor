import {test,expect} from "@playwright/test";
// Opt-in ruby extension (docs/RUBY_ANNOTATIONS.md) in a real two-writer shared rich V4 room: the shared
// configuration with `breditor-ruby/ruby`, the shared Ruby / Remove ruby controls (one set_format dispatch,
// one Undo step), convergence, rendering on both writers and typing that never inherits a reading.
test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const tools=window.sharedTools,rich=await import("/rich.js");
  const configuration=rich.withRichRubySharedConfigurationV1({format:"breditor/shared-rich-profile",formatVersion:4,schema:{name:"breditor-editor/standard",version:4},extensions:[]});
  const profile=tools.compileStandardRichSharedProfileV4(tools.wasm,configuration),descriptor=JSON.parse(profile.descriptor_json());
  const presentation=rich.createStandardRichInlinePresentationV1(profile.inline_catalog_json());
  const paragraph=(block,text)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":block},children:[{kind:"text",text,formats:[]}]});
  const input={format:"breditor/document",formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[paragraph("p","漢字を読む"),paragraph("q","Second")]}};
  const a=new tools.SharedRichEditor(profile.create(JSON.stringify(input),"101")),b=new tools.SharedRichEditor(profile.join_frame("room","202",a.updateFrame())),errors=[];
  const mount=(core,name)=>tools.mountSharedEditor(document.querySelector(`#${name}`),{core,inlinePresentation:presentation,toolbar:[...tools.createRichSharedToolbarV4(core,presentation),...tools.sharedRubyToolbarControls(core,presentation)],label:`Writer ${name}`,onError:error=>errors.push(String(error))});
  const da=mount(a,"a"),db=mount(b,"b");
  const select=(editor,block,start,end=start)=>editor.select({kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}});
  const synchronize=async()=>{const x=a.updateFrame(),y=b.updateFrame();await Promise.all([a.receiveFrame(y),b.receiveFrame(x)]);if(a.documentJson()!==b.documentJson())throw Error("ruby replicas differ");};
  const runs=core=>JSON.parse(core.documentJson()).root.children[0].children.map(r=>[r.text,r.formats.find(f=>f.type==="breditor-ruby/ruby")?.properties["breditor-ruby/annotation"]??null]);
  window.ruby={a,b,da,db,profile,descriptor,errors,select,synchronize,runs};
 });
});

test("the shared ruby room uses the local ruby fingerprint; the Ruby control converges in one Undo step",async({page})=>{
 expect(await page.evaluate(()=>window.ruby.descriptor.schemaFingerprint)).toBe("sha256:59b7d3c1fcbe2e85e23e526198312400e5732579d957a244d622c60a61194833");
 const depth=await page.evaluate(()=>{const t=window.ruby;t.select(t.da,"p",0,2);return t.a.view().undoDepth;});
 await page.locator('#a [data-shared-control="ruby"] summary').click();
 await page.locator('#a [data-shared-field="ruby-annotation"]').fill("かんじ");
 await page.locator('#a [data-shared-action="ruby"]').click();
 await expect(page.locator("#a ruby rt")).toHaveAttribute("data-ruby-text","かんじ");
 await page.evaluate(()=>window.ruby.synchronize());
 await expect(page.locator("#b ruby rt")).toHaveAttribute("data-ruby-text","かんじ");
 await expect(page.locator('#b [data-rich-text="p"]')).toHaveText("漢字を読む");
 const result=await page.evaluate(()=>{const t=window.ruby;return {runs:t.runs(t.b),delta:t.a.view().undoDepth,errors:t.errors};});
 expect(result).toEqual({runs:[["漢字","かんじ"],["を読む",null]],delta:depth+1,errors:[]});
 // Undo removes it on both writers.
 await page.evaluate(async()=>{const t=window.ruby;t.a.undo();await t.synchronize();});
 expect(await page.evaluate(()=>window.ruby.runs(window.ruby.b))).toEqual([["漢字を読む",null]]);
 await expect(page.locator("#b ruby")).toHaveCount(0);
});

test("a caret edits or removes the whole group, typing beside a base stays plain, and peers converge",async({page})=>{
 await page.evaluate(()=>{const t=window.ruby;t.select(t.da,"p",0,2);});
 await page.locator('#a [data-shared-control="ruby"] summary').click();
 await page.locator('#a [data-shared-field="ruby-annotation"]').fill("かんじ");
 await page.locator('#a [data-shared-action="ruby"]').click();
 await expect(page.locator("#a ruby rt")).toHaveCount(1);
 await page.evaluate(()=>window.ruby.synchronize());
 // Writer B replaces the reading from a caret inside the base.
 await page.evaluate(()=>{const t=window.ruby;t.select(t.db,"p",1);});
 await page.locator('#b [data-shared-control="ruby"] summary').click();
 await expect(page.locator('#b [data-shared-field="ruby-annotation"]')).toHaveValue("かんじ");
 await page.locator('#b [data-shared-field="ruby-annotation"]').fill("カンジ");
 await page.locator('#b [data-shared-action="ruby"]').click();
 await page.evaluate(()=>window.ruby.synchronize());
 await expect(page.locator("#a ruby rt")).toHaveAttribute("data-ruby-text","カンジ");
 // Writer A types right after the base with the real keyboard: plain text on both writers.
 await page.evaluate(()=>{const t=window.ruby;t.da.focus();t.select(t.da,"p",2);});
 await page.keyboard.type("X");
 await expect.poll(()=>page.evaluate(()=>window.ruby.runs(window.ruby.a))).toEqual([["漢字","カンジ"],["Xを読む",null]]);
 await page.evaluate(()=>window.ruby.synchronize());
 // Remove ruby at a caret on writer B removes the whole group.
 await page.evaluate(()=>{const t=window.ruby;t.select(t.db,"p",1);});
 await page.locator('#b [data-shared-action="remove-ruby"]').click();
 await page.evaluate(()=>window.ruby.synchronize());
 expect(await page.evaluate(()=>window.ruby.runs(window.ruby.a))).toEqual([["漢字Xを読む",null]]);
 await expect(page.locator("ruby")).toHaveCount(0);
 expect(await page.evaluate(()=>window.ruby.errors)).toEqual([]);
});
