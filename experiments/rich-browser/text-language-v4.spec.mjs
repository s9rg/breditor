import {test,expect} from "@playwright/test";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";
// Explicit candidate rich V4 (bootstrap V9) over the actual Rust/Wasm owner: text-run language.
let interchange="";
test.beforeAll(async()=>{
 const bundle=await rolldown({input:fileURLToPath(new URL("../../packages/breditor-interchange/src/index.ts",import.meta.url)),platform:"browser",logLevel:"silent"});
 interchange=(await bundle.generate({format:"esm"})).output[0].code;await bundle.close();
});
test.beforeEach(async({page})=>{
 await page.route("**/interchange.js",route=>route.fulfill({status:200,contentType:"text/javascript; charset=utf-8",body:interchange}));
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const api=await import("/rich.js"),{createRichInterchange}=await import("/interchange.js");
  const bootstrap=(formatVersion,version)=>JSON.stringify({format:"breditor/profile-bootstrap",formatVersion,schema:{name:"example/text-language",version},extensions:[]});
  const paragraph=(id,text)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":id},children:[{kind:"text",text,formats:[]}]});
  const root=()=>({kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[paragraph("p","Hello world"),paragraph("q","Second")]});
  const open=profile=>{const binding=profile.descriptor();return profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:root()}));};
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,bootstrap(9,4)),presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson());
  const core=open(profile),host=document.createElement("main"),errors=[];document.body.append(host);
  const style=document.createElement("style");style.textContent="[data-breditor-rich] :lang(fr){color:rgb(1, 2, 3)}[data-breditor-rich] :lang(de){color:rgb(4, 5, 6)}";document.head.append(style);
  const editor=api.mountRichEditor(host,{core,inlinePresentation:presentation,toolbar:api.createRichToolbarV4(core,presentation),onError:error=>errors.push(String(error))});
  const select=(block,start,end=start)=>({kind:"setSelection",selection:{kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}}});
  const runs=(block="p")=>JSON.parse(core.documentJson()).root.children.find(n=>n.properties["breditor/block-id"]===block).children;
  const clipboardEvent=(type,source=new DataTransfer())=>{
   const event=new ClipboardEvent(type,{bubbles:true,cancelable:true,clipboardData:source});
   if(event.clipboardData!==source)for(const flavor of source.types)event.clipboardData.setData(flavor,source.getData(flavor));
   editor.surface.dispatchEvent(event);return event;
  };
  window.lang={api,bootstrap,open,profile,core,editor,host,errors,select,runs,clipboardEvent,createRichInterchange};
 });
});
const tagged=(text,tag)=>({kind:"text",text,formats:[{type:"breditor/text-language",properties:{"breditor/language-tag":tag}}]});
const plain=text=>({kind:"text",text,formats:[]});

test("V4 reports text language while V3 stays exact and refuses it",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.lang,v4=t.profile.descriptor(),v3p=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,4));
  try{const v3=v3p.descriptor(),old=t.open(v3p);old.execute(t.select("p",0,5));const before=old.checkpointJson();let refused=false;
   try{old.execute({kind:"setTextLanguage",data:{language:"en"}});}catch{refused=true;}
   const out={v4:v4.textLanguageVersion,v3:v3.textLanguageVersion??null,catalog:[t.profile.inlineCatalogJson().includes('"breditor/text-language"'),v3p.inlineCatalogJson().includes('"breditor/text-language"')],refused,unchanged:old.checkpointJson()===before,supports:[old.supportsTextLanguage(),t.core.supportsTextLanguage()]};old.dispose();return out;}finally{v3p.dispose();}});
 expect(result).toEqual({v4:1,v3:null,catalog:[true,false],refused:true,unchanged:true,supports:[false,true]});
});

test("setting a word's language renders lang, matches :lang() and has one exact Undo group",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.lang,before=t.core.documentJson(),depth=t.core.view().undoDepth;
  t.editor.execute(t.select("p",6,11));t.editor.execute({kind:"setTextLanguage",data:{language:"fr-ca"}});
  const span=t.host.querySelector('span[lang]'),p=t.host.querySelector('[data-rich-text="p"]');
  const set={lang:span?.getAttribute("lang"),property:span?.lang,text:span?.textContent,cls:span?.className,matches:span?.matches(":lang(fr)"),color:span&&getComputedStyle(span).color,plainColor:getComputedStyle(p).color===getComputedStyle(span).color,count:t.host.querySelectorAll("[lang]").length,delta:t.core.view().undoDepth-depth,runs:t.runs(),dir:p.getAttribute("dir")};
  const after=t.core.documentJson();
  t.editor.execute({kind:"undo"});const undo=t.core.documentJson()===before&&t.host.querySelectorAll("[lang]").length===0;
  t.editor.execute({kind:"redo"});const redo=t.core.documentJson()===after&&t.host.querySelector('span[lang="fr-CA"]')?.textContent==="world";
  const restored=t.profile.restoreEditor(t.core.checkpointJson()),restoredSame=restored.documentJson()===after;restored.dispose();
  // A new value replaces the old one; clearing removes it in one more group.
  t.editor.execute(t.select("p",0,11));t.editor.execute({kind:"setTextLanguage",data:{language:"de"}});const replaced=t.runs();
  t.editor.execute({kind:"setTextLanguage",data:{language:null}});const cleared=t.runs();
  return {set,undo,redo,restoredSame,replaced,cleared,errors:t.errors};
 });
 expect(result.set).toEqual({lang:"fr-CA",property:"fr-CA",text:"world",cls:"breditor-text-language",matches:true,color:"rgb(1, 2, 3)",plainColor:false,count:1,delta:1,runs:[plain("Hello "),tagged("world","fr-CA")],dir:null});
 expect(result).toMatchObject({undo:true,redo:true,restoredSame:true,errors:[]});
 expect(result.replaced).toEqual([tagged("Hello world","de")]);expect(result.cleared).toEqual([plain("Hello world")]);
});

test("the V4 Language toolbar control validates, canonicalizes and clears",async({page})=>{
 await page.evaluate(()=>{const t=window.lang;t.editor.execute(t.select("p",0,5));});
 const control=page.locator('[data-rich-control="text-language"]');
 await control.locator("summary").click();
 await page.locator('[data-rich-field="text-language-value"]').fill("en_US");
 await page.locator('[data-rich-action="text-language"]').click();
 await expect.poll(()=>page.evaluate(()=>window.lang.errors.length)).toBe(1);
 expect(await page.evaluate(()=>window.lang.core.view().undoDepth)).toBe(0);
 // A refused draft keeps the panel open for correction.
 await page.locator('[data-rich-field="text-language-value"]').fill("DE-at");
 await page.locator('[data-rich-action="text-language"]').click();
 await expect(page.locator('span[lang="de-AT"]')).toHaveText("Hello");
 await expect(page.locator('span[lang="de-AT"]')).toHaveCSS("color","rgb(4, 5, 6)");
 await control.locator("summary").click();
 await expect(page.locator('[data-rich-field="text-language-value"]')).toHaveValue("de-AT");
 await page.keyboard.press("Escape");
 await page.locator('[data-rich-action="reset-text-language"]').click();
 await expect(page.locator("[data-breditor-rich] [lang]")).toHaveCount(0);
 const result=await page.evaluate(()=>({runs:window.lang.runs(),undo:window.lang.core.view().undoDepth}));
 expect(result).toEqual({runs:[plain("Hello world")],undo:2});
});

test("native copy and paste inside V4 keep the exact language",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.lang;
  t.editor.execute(t.select("p",6,11));t.editor.execute({kind:"setTextLanguage",data:{language:"sr-latn-rs"}});
  t.editor.execute(t.select("p",4,11));const transfer=t.clipboardEvent("copy").clipboardData;
  t.editor.execute(t.select("q",6));const depth=t.core.view().undoDepth;t.clipboardEvent("paste",transfer);
  return {q:t.runs("q"),delta:t.core.view().undoDepth-depth,dom:[...t.host.querySelectorAll('[data-rich-text="q"] [lang]')].map(e=>[e.getAttribute("lang"),e.textContent]),errors:t.errors};
 });
 expect(result).toEqual({q:[plain("Secondo "),tagged("world","sr-Latn-RS")],delta:1,dom:[["sr-Latn-RS","world"]],errors:[]});
});

test("interchange maps lang for the V4 owner only and native admission requires canonical tags",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.lang,html='<p lang="EN-gb">One <span xml:lang="fr">deux</span> <span lang="x-none">three</span></p>';
  const langs=r=>{if(!r.ok)return r.error;const out=[];(function walk(n){if(n.kind==="text")out.push([n.text,n.formats.find(f=>f.type==="breditor/text-language")?.properties["breditor/language-tag"]??null]);for(const c of n.children??[])walk(c);})(JSON.parse(r.value.structuredJson).document.root);return out;};
  const v4=t.createRichInterchange(t.core).importHtml(html),exported=t.createRichInterchange(t.core).exportHtml(v4.value.structuredJson);
  const markdown=t.createRichInterchange(t.core).exportMarkdown(v4.value.structuredJson);
  const raw=JSON.stringify({kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"breditor-clipboard"},children:[{kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"x"},children:[tagged("x","fr-ca")]}]});
  let nonCanonical=false;try{t.core.admitClipboardRoot("flow",raw);}catch{nonCanonical=true;}
  const v3p=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,4)),old=t.open(v3p);v3p.dispose();
  try{const v3=t.createRichInterchange(old).importHtml(html);
   return {v4:langs(v4),v4losses:v4.losses.map(l=>[l.code,l.count]),html:exported.ok&&exported.value,markdown:markdown.ok&&[markdown.value,markdown.losses.map(l=>l.code)],nonCanonical,v3:langs(v3),v3losses:v3.losses};}finally{old.dispose();}
  function tagged(text,tag){return {kind:"text",text,formats:[{type:"breditor/text-language",properties:{"breditor/language-tag":tag}}]};}
 });
 expect(result.v4).toEqual([["One ","en-GB"],["deux","fr"],[" ","en-GB"],["three",null]]);
 expect(result.v4losses).toEqual([["unsupported-attribute",1]]);
 expect(result.html).toBe('<p style="white-space:pre-wrap"><span lang="en-GB">One </span><span lang="fr">deux</span><span lang="en-GB"> </span>three</p>');
 expect(result.markdown[0]).toContain('<span lang="fr">deux</span>');expect(result.markdown[1]).toContain("markdown-feature");
 expect(result.nonCanonical).toBe(true);
 expect(result.v3).toEqual([["One deux three",null]]);expect(result.v3losses).toEqual([]);
});
