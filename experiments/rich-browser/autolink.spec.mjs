import {test,expect} from "@playwright/test";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";
// Optional autolink-v1 over the actual Rust/Wasm owner: real keyboard typing, space/Enter boundaries and exact Undo.
let interchange="";
test.beforeAll(async()=>{
 const bundle=await rolldown({input:fileURLToPath(new URL("../../packages/breditor-interchange/src/index.ts",import.meta.url)),platform:"browser",logLevel:"silent"});
 interchange=(await bundle.generate({format:"esm"})).output[0].code;await bundle.close();
});
test.beforeEach(async({page})=>{await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");await page.evaluate(async()=>{
 const api=await import("/rich.js"),configuration={format:"breditor/profile-bootstrap",formatVersion:6,schema:{name:"example/autolink",version:1},extensions:[]};
 const profile=api.compileStandardRichProfileV1(window.rich.wasm,JSON.stringify(configuration)),binding=profile.descriptor(),presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson());
 const paragraph=(id,text)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":id},children:text?[{kind:"text",text,formats:[]}]:[]});
 const errors=[];let editor,core;const host=document.createElement("main");document.body.append(host);
 const mount=(options={},natural=false,text="Hi",readOnly=false)=>{editor?.dispose();host.replaceChildren();
  core=profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[paragraph("p",text)]}}));
  if(natural)core.enableTypingHistory();if(readOnly)core.setReadOnly(true);
  editor=api.mountRichEditor(host,{core,inlinePresentation:presentation,onError:error=>errors.push(String(error)),...options});
  editor.focus?.();editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"p",offset:String(text.length),affinity:"after"},focus:{block:"p",offset:String(text.length),affinity:"after"}}});
  window.al.core=core;window.al.editor=editor;};
 // Runs per block as [text, href or ""]; a new-window link would be marked.
 const blocks=()=>JSON.parse(core.documentJson()).root.children.map(block=>block.children.map(run=>{const link=run.formats.find(f=>f.type==="breditor-inline/link");return [run.text,link?link.properties["breditor-inline/href"]+(link.properties["breditor-inline/new-window"]?"|new":""):""];}));
 window.al={api,mount,blocks,errors,core,editor};
});});
const undo=page=>page.keyboard.press("ControlOrMeta+z");

for(const [name,options,natural] of [["autolink-v1",{inputRules:"autolink-v1"},false],["markdown-v1 + autolink-v1, natural typing",{inputRules:["markdown-v1","autolink-v1"]},true]]){
 test(`${name}: space after a typed URL links it, excluding trailing punctuation; one Undo keeps the space`,async({page})=>{
  await page.evaluate(([options,natural])=>window.al.mount(options,natural),[options,natural]);
  await page.keyboard.type(" see https://example.com/a?b=1.");
  expect(await page.evaluate(()=>window.al.blocks())).toEqual([[["Hi see https://example.com/a?b=1.",""]]]);
  await page.keyboard.type(" ");
  expect(await page.evaluate(()=>window.al.blocks())).toEqual([[["Hi see ",""],["https://example.com/a?b=1","https://example.com/a?b=1"],[". ",""]]]);
  const anchor=page.locator('[data-rich-text="p"] a.breditor-link');
  await expect(anchor).toHaveAttribute("href","https://example.com/a?b=1");await expect(anchor).toHaveText("https://example.com/a?b=1");await expect(anchor).not.toHaveAttribute("target",/./);
  // One Undo removes only the conversion; the typed space stays.
  await undo(page);
  expect(await page.evaluate(()=>window.al.blocks())).toEqual([[["Hi see https://example.com/a?b=1. ",""]]]);
  await expect(anchor).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+y");
  expect(await page.evaluate(()=>window.al.blocks())).toEqual([[["Hi see ",""],["https://example.com/a?b=1","https://example.com/a?b=1"],[". ",""]]]);
  // The caret stays after the boundary: further typing is plain and outside the link.
  await page.keyboard.type("ok");
  expect(await page.evaluate(()=>window.al.blocks())).toEqual([[["Hi see ",""],["https://example.com/a?b=1","https://example.com/a?b=1"],[". ok",""]]]);
  expect(await page.evaluate(()=>window.al.errors)).toEqual([]);
 });

 test(`${name}: Enter after www. links the left block; one Undo keeps the split`,async({page})=>{
  await page.evaluate(([options,natural])=>window.al.mount(options,natural),[options,natural]);
  await page.keyboard.type(" (www.example.com/x)");
  await page.keyboard.press("Enter");
  expect(await page.evaluate(()=>window.al.blocks())).toEqual([[["Hi (",""],["www.example.com/x","https://www.example.com/x"],[")",""]],[]]);
  await undo(page);
  expect(await page.evaluate(()=>window.al.blocks())).toEqual([[["Hi (www.example.com/x)",""]],[]]);
  await expect(page.locator("a.breditor-link")).toHaveCount(0);
  await undo(page);
  expect(await page.evaluate(()=>window.al.blocks())).toEqual([[["Hi (www.example.com/x)",""]]]);
  expect(await page.evaluate(()=>window.al.errors)).toEqual([]);
 });
}

test("unsafe, non-canonical, default-off, pasted, inline-code and read-only input stay literal",async({page})=>{
 await page.evaluate(()=>window.al.mount({inputRules:"autolink-v1"}));
 await page.keyboard.type(" javascript:alert(1) HTTPS://EXAMPLE.COM https://user@example.com ");
 expect(await page.evaluate(()=>window.al.blocks())).toEqual([[["Hi javascript:alert(1) HTTPS://EXAMPLE.COM https://user@example.com ",""]]]);
 // Paste is not typing: a pasted URL followed by its own space never converts.
 await page.evaluate(()=>{const data=new DataTransfer();data.setData("text/plain","https://example.com/pasted ");const event=new ClipboardEvent("paste",{bubbles:true,cancelable:true,clipboardData:data});if(event.clipboardData!==data)event.clipboardData.setData("text/plain","https://example.com/pasted ");window.al.editor.surface.dispatchEvent(event);});
 expect(await page.evaluate(()=>window.al.blocks()[0].map(run=>run[1]))).toEqual([""]);
 // Inline code is inert.
 await page.evaluate(()=>{const t=window.al;t.mount({inputRules:"autolink-v1"},false,"x https://example.com");t.editor.execute({kind:"setInlineFormat",data:{change:{kind:"set",formatsJson:JSON.stringify([{type:"breditor-inline/code",properties:{}}])},targets:[{block:"p",start:"2",end:"21"}]}});t.editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"p",offset:"21",affinity:"after"},focus:{block:"p",offset:"21",affinity:"after"}}});});
 await page.keyboard.type(" ");
 expect(await page.evaluate(()=>window.al.blocks()[0].every(run=>run[1]===""))).toBe(true);
 // Omitted inputRules keeps literal input.
 await page.evaluate(()=>window.al.mount({}));
 await page.keyboard.type(" https://example.com ");await page.keyboard.press("Enter");
 expect(await page.evaluate(()=>window.al.blocks())).toEqual([[["Hi https://example.com ",""]],[]]);
 // Read-only accepts no typing at all.
 await page.evaluate(()=>window.al.mount({inputRules:"autolink-v1"},false,"https://example.com",true));
 await page.keyboard.type(" ");
 expect(await page.evaluate(()=>window.al.blocks())).toEqual([[["https://example.com",""]]]);
 // An unknown policy rejects before mounting.
 expect(await page.evaluate(()=>{try{window.al.mount({inputRules:"autolink-v2"});return "mounted";}catch(error){return String(error);}})).toContain("autolink-v1");
});
test("interchange Markdown autolinks: true links literals exactly as typed autolink-v1 does, through native admission",async({page})=>{
 await page.route("**/interchange.js",route=>route.fulfill({status:200,contentType:"text/javascript; charset=utf-8",body:interchange}));
 const prose="see https://example.com/a?b=1. and www.example.org, (https://en.example.org/wiki/A_(b)). javascript:alert(1) HTTPS://example.com/";
 await page.evaluate(()=>window.al.mount({inputRules:"autolink-v1"},false,""));
 await page.keyboard.type(`${prose} `);
 const result=await page.evaluate(async prose=>{
  const {createRichInterchange}=await import("/interchange.js"),adapter=createRichInterchange(window.al.core);
  const links=root=>root.children.flatMap(block=>block.children).flatMap(run=>run.formats.filter(f=>f.type==="breditor-inline/link").map(f=>[run.text,f.properties["breditor-inline/href"],f.properties["breditor-inline/new-window"]]));
  const imported=options=>{const r=adapter.importMarkdown(prose,options);return r.ok?{links:links(JSON.parse(r.value.structuredJson).document.root),losses:r.losses}:r.error;};
  const linked=adapter.importMarkdown(prose,{autolinks:true}),md=adapter.exportMarkdown(linked.value.structuredJson),back=adapter.importMarkdown(md.value,{autolinks:true});
  return {typed:links(JSON.parse(window.al.core.documentJson()).root),on:imported({autolinks:true}),off:imported({}),roundTrip:back.ok&&back.value.structuredJson===linked.value.structuredJson};
 },prose);
 expect(result.typed).toEqual([["https://example.com/a?b=1","https://example.com/a?b=1",false],["www.example.org","https://www.example.org/",false],["https://en.example.org/wiki/A_(b)","https://en.example.org/wiki/A_(b)",false]]);
 expect(result.on).toEqual({links:result.typed,losses:[]});
 expect(result.off).toEqual({links:[],losses:[]});
 expect(result.roundTrip).toBe(true);
});
