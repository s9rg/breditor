import {test,expect} from "@playwright/test";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";
// Opt-in ruby (furigana) extension over the actual Rust/Wasm rich V4 owner (docs/RUBY_ANNOTATIONS.md):
// a host-declared typed inline format, not a grammar change.
let interchange="",statics="";
const bundle=async path=>{const value=await rolldown({input:fileURLToPath(new URL(path,import.meta.url)),platform:"browser",logLevel:"silent"});const code=(await value.generate({format:"esm"})).output[0].code;await value.close();return code;};
test.beforeAll(async()=>{
 interchange=await bundle("../../packages/breditor-interchange/src/index.ts");
 statics=await bundle("../../packages/breditor-editor/src/static_document.ts");
});
const RUBY_FINGERPRINT="sha256:59b7d3c1fcbe2e85e23e526198312400e5732579d957a244d622c60a61194833";
const STOCK_FINGERPRINT="sha256:7ac98189f850119abd83956f49b82fdbdcc91a77033781fbde090ba931fccc77";
test.beforeEach(async({page})=>{
 await page.route("**/interchange.js",route=>route.fulfill({status:200,contentType:"text/javascript; charset=utf-8",body:interchange}));
 await page.route("**/static.js",route=>route.fulfill({status:200,contentType:"text/javascript; charset=utf-8",body:statics}));
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const api=await import("/rich.js"),{createRichInterchange}=await import("/interchange.js"),{renderStaticDocument}=await import("/static.js");
  const stock=JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:{name:"breditor-editor/standard",version:4},extensions:[]});
  const paragraph=(id,text)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":id},children:[{kind:"text",text,formats:[]}]});
  const root=()=>({kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[paragraph("p","漢字を読む"),paragraph("q","Second")]});
  const open=(profile,value=root())=>{const binding=profile.descriptor();return profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:value}));};
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,api.withRichRubyBootstrapV1(stock)),presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson());
  const core=open(profile),host=document.createElement("main"),errors=[];document.body.append(host);
  const editor=api.mountRichEditor(host,{core,inlinePresentation:presentation,toolbar:[...api.createRichToolbarV4(core,presentation),...api.rubyToolbarControls(core,presentation)],onError:error=>errors.push(String(error))});
  const select=(block,start,end=start)=>({kind:"setSelection",selection:{kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}}});
  const runs=(block="p")=>JSON.parse(core.documentJson()).root.children.find(n=>n.properties["breditor/block-id"]===block).children;
  const ruby=annotation=>({type:"breditor-ruby/ruby",properties:{"breditor-ruby/annotation":annotation}});
  const set=(start,end,annotation)=>editor.execute(api.rubyCommand({targets:[{block:"p",start:String(start),end:String(end)}],annotation}));
  window.ruby={api,stock,open,root,profile,presentation,core,editor,host,errors,select,runs,ruby,set,createRichInterchange,renderStaticDocument};
 });
});
const plain=text=>({kind:"text",text,formats:[]});
const annotated=(text,annotation)=>({kind:"text",text,formats:[{type:"breditor-ruby/ruby",properties:{"breditor-ruby/annotation":annotation}}]});

test("the ruby profile has its own fingerprint while the frozen stock V4 profile is unchanged and refuses ruby",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.ruby,stock=t.api.compileStandardRichProfileV4(window.rich.wasm,t.stock);
  try{let refused=false;const doc=t.root();doc.children[0].children=[t.ruby("かんじ")].map(f=>({kind:"text",text:"漢字",formats:[f]}));
   try{t.open(stock,doc).dispose();}catch{refused=true;}
   const owner=t.open(stock),out={ruby:t.profile.descriptor().schemaFingerprint,stock:stock.descriptor().schemaFingerprint,language:t.profile.descriptor().richLanguageVersion,refused,supports:[t.core.supportsRubyAnnotations(),owner.supportsRubyAnnotations()],catalog:t.profile.inlineCatalogJson().includes('"breditor-ruby/ruby"')};owner.dispose();return out;}
  finally{stock.dispose();}
 });
 expect(result).toEqual({ruby:RUBY_FINGERPRINT,stock:STOCK_FINGERPRINT,language:4,refused:true,supports:[true,false],catalog:true});
});

test("the Ruby control annotates a selection as <ruby> with a generated, non-editable reading in one Undo step",async({page})=>{
 await page.evaluate(()=>{const t=window.ruby;t.editor.execute(t.select("p",0,2));});
 const control=page.locator('[data-rich-control="ruby"]');
 await control.locator("summary").click();
 // An empty reading is refused before Rust; nothing is published.
 await page.locator('[data-rich-field="ruby-annotation"]').fill("   ");
 await page.locator('[data-rich-action="ruby"]').click();
 await expect.poll(()=>page.evaluate(()=>window.ruby.errors.length)).toBe(1);
 expect(await page.evaluate(()=>window.ruby.core.view().undoDepth)).toBe(0);
 await page.locator('[data-rich-field="ruby-annotation"]').fill(" かんじ ");
 await page.locator('[data-rich-action="ruby"]').click();
 const rt=page.locator('[data-rich-text="p"] ruby[data-rich-ruby] rt');
 await expect(rt).toHaveAttribute("data-ruby-text","かんじ");
 const result=await page.evaluate(()=>{const t=window.ruby,element=t.host.querySelector('[data-rich-text="p"] ruby rt'),block=t.host.querySelector('[data-rich-text="p"]');
  const after=t.core.documentJson(),depth=t.core.view().undoDepth,runs=t.runs();
  // Chromium/WebKit resolve the generated text; Firefox reports the attr() expression. Either way it is laid out.
  const content=getComputedStyle(element,"::before").content,generated=content==='"かんじ"'||content==="attr(data-ruby-text)",shown=element.getBoundingClientRect().width>0,display=getComputedStyle(element).display;
  const text=block.textContent,editable=[...t.host.querySelectorAll("ruby rt, ruby rp")].map(x=>x.getAttribute("contenteditable"));
  t.editor.execute({kind:"undo"});const undone=t.host.querySelectorAll("ruby").length===0&&t.runs().length===1;
  t.editor.execute({kind:"redo"});const redone=t.core.documentJson()===after;
  const restored=t.profile.restoreEditor(t.core.checkpointJson()),same=restored.documentJson()===after;restored.dispose();
  return {depth,runs,generated,shown,display,text,editable,undone,redone,same,errors:t.errors.length};
 });
 expect(result).toEqual({depth:1,runs:[annotated("漢字","かんじ"),plain("を読む")],generated:true,shown:true,display:"ruby-text",text:"漢字を読む",editable:["false","false","false"],undone:true,redone:true,same:true,errors:1});
});

test("a caret inside a base edits or removes the whole group through the field; typing beside it stays plain",async({page})=>{
 await page.evaluate(()=>{const t=window.ruby;t.set(0,2,"かんじ");t.editor.execute(t.select("p",1));});
 const control=page.locator('[data-rich-control="ruby"]');
 await control.locator("summary").click();
 await expect(page.locator('[data-rich-field="ruby-annotation"]')).toHaveValue("かんじ");
 await page.locator('[data-rich-field="ruby-annotation"]').fill("カンジ");
 await page.locator('[data-rich-action="ruby"]').click();
 await expect(page.locator("ruby rt")).toHaveAttribute("data-ruby-text","カンジ");
 expect(await page.evaluate(()=>window.ruby.runs())).toEqual([annotated("漢字","カンジ"),plain("を読む")]);
 // Real keyboard typing right after the base and inside it: the reading never extends.
 await page.evaluate(()=>{const t=window.ruby;t.editor.focus();t.editor.execute(t.select("p",2));});
 await page.keyboard.type("X");
 await page.evaluate(()=>{const t=window.ruby;t.editor.execute(t.select("p",1));});
 await page.keyboard.type("Y");
 await expect.poll(()=>page.evaluate(()=>window.ruby.runs())).toEqual([annotated("漢","カンジ"),plain("Y"),annotated("字","カンジ"),plain("Xを読む")]);
 await expect(page.locator('[data-rich-text="p"]')).toHaveText("漢Y字Xを読む");
 await expect(page.locator("ruby rt")).toHaveCount(2);
 // Remove ruby at a caret removes the whole group around it, in one Undo step.
 const depth=await page.evaluate(()=>{const t=window.ruby;t.editor.execute(t.select("p",3));return t.core.view().undoDepth;});
 await page.locator('[data-rich-action="remove-ruby"]').click();
 await expect.poll(()=>page.evaluate(()=>window.ruby.runs())).toEqual([annotated("漢","カンジ"),plain("Y字Xを読む")]);
 expect(await page.evaluate(()=>window.ruby.core.view().undoDepth)).toBe(depth+1);
 expect(await page.evaluate(()=>window.ruby.errors)).toEqual([]);
});

test("clicking the reading never edits it or loses text; the base stays editable",async({page})=>{
 await page.evaluate(()=>{window.ruby.set(0,2,"かんじ");});
 // Engines differ: Chromium puts the caret in the base, Firefox/WebKit leave no editable caret there.
 // Either way the reading is not typed into and no text is lost.
 await page.locator("ruby rt").click();
 await page.keyboard.type("Z");
 const first=await page.evaluate(()=>{const t=window.ruby,text=t.runs().map(r=>r.text).join("");return {text,reading:t.host.querySelector("ruby rt")?.getAttribute("data-ruby-text"),rtText:t.host.querySelector("ruby rt")?.textContent,errors:t.errors};});
 expect(["漢字を読む","Z漢字を読む","漢Z字を読む","漢字Zを読む"]).toContain(first.text);
 expect(first).toMatchObject({reading:"かんじ",rtText:"",errors:[]});
 // A click on the base text itself places an ordinary caret in it.
 const box=await page.locator('[data-rich-text="p"] ruby').boundingBox();
 await page.mouse.click(box.x+box.width-2,box.y+box.height-4);
 await page.keyboard.type("W");
 const second=await page.evaluate(()=>{const t=window.ruby;return {text:t.runs().map(r=>r.text).join(""),reading:t.host.querySelector("ruby rt")?.getAttribute("data-ruby-text"),errors:t.errors};});
 expect(second.text.length).toBe(first.text.length+1);expect(second.text.indexOf("W")).toBeLessThanOrEqual(3);
 expect(second).toMatchObject({reading:"かんじ",errors:[]});
});

test("HTML import/export uses <ruby> for ruby profiles; the stock profile reports the loss; static output matches",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.ruby,io=t.createRichInterchange(t.core);
  const imported=io.importHtml("<p>私は<ruby>東京<rp>(</rp><rt>とうきょう</rt><rp>)</rp></ruby>に</p>");if(!imported.ok)return {error:imported.error};
  const exported=io.exportHtml(imported.value.structuredJson),md=io.exportMarkdown(imported.value.structuredJson);
  const stock=t.api.compileStandardRichProfileV4(window.rich.wasm,t.stock),owner=t.open(stock),old=t.createRichInterchange(owner).importHtml("<p><ruby>東京<rt>とうきょう</rt></ruby></p>");owner.dispose();stock.dispose();
  t.set(0,2,"かんじ");const fixture=JSON.parse(t.core.documentJson()),html=t.renderStaticDocument(fixture,{fragment:true});
  return {kinds:imported.value.kind,losses:imported.losses,html:exported.ok&&exported.value,md:md.ok&&md.value,mdLosses:md.losses.map(l=>l.code),old:old.ok?JSON.parse(old.value.structuredJson).document.root.children[0].children:old.error,oldLosses:old.losses,staticHtml:html};
 });
 expect(result.losses).toEqual([]);
 expect(result.html).toBe('<p style="white-space:pre-wrap">私は<ruby>東京<rp>(</rp><rt>とうきょう</rt><rp>)</rp></ruby>に</p>');
 expect(result.md).toBe(result.html);expect(result.mdLosses).toEqual(["markdown-feature"]);
 expect(result.old).toEqual([plain("東京とうきょう")]);expect(result.oldLosses).toEqual([{code:"unsupported-element",count:2,effect:"loss"}]);
 expect(result.staticHtml).toContain('<ruby class="breditor-ruby" data-rich-ruby="">漢字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby>を読む');
});
