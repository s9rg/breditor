import {test,expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";
// Shared rich language V4 external interchange over two real Rust/Wasm writers in one V4 room, compared with a
// real local V4 owner (the local rich runtime loaded into the same page). HTML with every V4 slice (and the Word
// and Google Docs page-break carriers) is pasted through `@breditor/interchange` into writer A: one guarded native
// paste and one Undo step, converging on writer B. HTML, Markdown and DOCX exports of both writers equal the local
// owner's after the same paste.
let interchange="",docx="";
const runtime=new URL("../../packages/breditor-experimental-rich-content/dist/",import.meta.url);
const bundle=async path=>{const value=await rolldown({input:fileURLToPath(new URL(path,import.meta.url)),platform:"browser",logLevel:"silent"});const code=(await value.generate({format:"esm"})).output[0].code;await value.close();return code;};
const js="text/javascript; charset=utf-8";
test.beforeAll(async()=>{
 interchange=await bundle("../../packages/breditor-interchange/src/index.ts");
 docx=await bundle("../../packages/breditor-interchange/src/docx.ts");
});
test.beforeEach(async({page})=>{
 await page.route("**/interchange.js",route=>route.fulfill({status:200,contentType:js,body:interchange}));
 await page.route("**/docx.js",route=>route.fulfill({status:200,contentType:js,body:docx}));
 // The local V4 owner's generated runtime (wasm-bindgen module, binary and inline helpers), exact paths only.
 await page.route("**/local-wasm.js",route=>route.fulfill({status:200,contentType:js,body:readFileSync(new URL("breditor_wasm.js",runtime))}));
 await page.route("**/breditor_wasm_bg.wasm",route=>route.fulfill({status:200,contentType:"application/wasm",body:readFileSync(new URL("breditor_wasm_bg.wasm",runtime))}));
 await page.route("**/snippets/**",route=>{
  const path=new URL(route.request().url()).pathname.slice("/snippets/".length);
  if(!/^[\w.-]+\/[\w.-]+\.js$/.test(path)||path.includes(".."))return route.fulfill({status:404,body:"Not found"});
  return route.fulfill({status:200,contentType:js,body:readFileSync(new URL(`snippets/${path}`,runtime))});
 });
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const {createRichInterchange}=await import("/interchange.js"),{exportDocx}=await import("/docx.js");
  const local=await import("/local-wasm.js");await local.default();
  const shared=await import("/shared.js"),rich=await import("/rich.js");
  const schema={name:"example/shared-v4-interchange-browser",version:1};
  const profile=shared.compileStandardRichSharedProfileV4(window.sharedTools.wasm,{format:"breditor/shared-rich-profile",formatVersion:4,schema,extensions:[]});
  const descriptor=JSON.parse(profile.descriptor_json());
  const localProfile=rich.compileStandardRichProfileV4(local,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema,extensions:[]}));
  const paragraph=(block,text)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":block},children:[{kind:"text",text,formats:[]}]});
  const seed={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[paragraph("intro","Intro"),paragraph("tail","Tail")]};
  const envelope=binding=>JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:seed});
  const a=new shared.SharedRichEditor(profile.create(envelope(descriptor),"101")),b=new shared.SharedRichEditor(profile.join_frame("room","202",a.updateFrame()));
  const owner=localProfile.createEditor(envelope(localProfile.descriptor()));
  const policy={resolveImage:({src})=>src==="https://cdn.example/chart.png"?{asset:"chart",generation:"g1"}:undefined,exportImage:({asset})=>`https://cdn.example/${asset}.png`};
  const errors=[],sharedPresentation=rich.createStandardRichInlinePresentationV1(profile.inline_catalog_json()),localPresentation=rich.createStandardRichInlinePresentationV1(localProfile.inlineCatalogJson());
  const adapters=new Map([[a,createRichInterchange(a,policy)],[b,createRichInterchange(b,policy)],[owner,createRichInterchange(owner,policy)]]);
  const mountShared=(core,name)=>shared.mountSharedEditor(document.querySelector(`#${name}`),{core,inlinePresentation:sharedPresentation,toolbar:shared.createRichSharedToolbarV4(core,sharedPresentation),label:`Writer ${name}`,clipboardInterchange:adapters.get(core),onError:error=>errors.push(String(error))});
  const host=document.createElement("main");host.id="local";document.body.append(host);
  const da=mountShared(a,"a"),db=mountShared(b,"b");
  const dl=rich.mountRichEditor(host,{core:owner,inlinePresentation:localPresentation,toolbar:rich.createRichToolbarV4(owner,localPresentation),clipboardInterchange:adapters.get(owner),label:"Local",onError:error=>errors.push(String(error))});
  const caret=(block,offset)=>({kind:"text",anchor:{block,offset:String(offset),affinity:"after"},focus:{block,offset:String(offset),affinity:"after"}});
  const paste=(editor,values)=>{const data=new DataTransfer();for(const [type,value] of Object.entries(values))data.setData(type,value);const event=new ClipboardEvent("paste",{bubbles:true,cancelable:true,clipboardData:data});if(event.clipboardData!==data)for(const type of data.types)event.clipboardData.setData(type,data.getData(type));editor.surface.dispatchEvent(event);return event.defaultPrevented;};
  const synchronize=async()=>{const x=a.updateFrame(),y=b.updateFrame();await Promise.all([a.receiveFrame(y),b.receiveFrame(x)]);if(a.documentJson()!==b.documentJson())throw Error("V4 replicas differ");};
  // Document content without identities: block/image/table/row/column ids and asset generations are per-owner
  // allocations (paste rekeys them), everything else is the semantic content both owners must agree on.
  const drop=new Set(["breditor/block-id","breditor/image-id","breditor/table-id","breditor/row-id","breditor/column-id","breditor/asset-generation"]);
  const shape=node=>node.kind==="text"?node:{type:node.type,properties:Object.fromEntries(Object.entries(node.properties).filter(([key])=>!drop.has(key)&&key!=="breditor/document-id").map(([key,value])=>[key,key==="breditor/columns"?value.map(column=>column.width):value])),children:node.children.map(shape)};
  const content=core=>shape(JSON.parse(core.documentJson()).root);
  // Whole-document exports through each owner's own native validation.
  const exports=core=>{const root=JSON.parse(core.documentJson()).root;root.properties={"breditor/document-id":"breditor-clipboard"};const transfer=core.admitClipboardRoot("flow",JSON.stringify(root)),adapter=adapters.get(core);
   const html=adapter.exportHtml(transfer.structuredJson),markdown=adapter.exportMarkdown(transfer.structuredJson),bytes=exportDocx(core.documentJson(),{title:"Interchange"});
   return {html,markdown,docx:bytes.ok?Array.from(bytes.value).join(","):bytes.error,docxLosses:bytes.losses};};
  window.v4x={a,b,owner,da,db,dl,errors,caret,paste,synchronize,content,exports,adapters,descriptor,localDescriptor:localProfile.descriptor(),
   dispose(){da.dispose();db.dispose();dl.dispose();profile.free();}};
 });
});

const html=[
 '<h2 id="overview">Overview</h2>',
 '<p>Hi <span class="breditor-mention" data-mention-kind="user" data-mention-id="u-1">@Ann</span>, see <a href="#overview">the overview</a> and <span lang="FR-ca">bonjour</span>.</p>',
 '<ol type="i" reversed start="4"><li>one</li><li>two</li></ol>',
 '<figure><a href="https://example.com/chart"><img src="https://cdn.example/chart.png" alt="Chart"></a><figcaption>Quarterly</figcaption></figure>',
 '<details open><summary>More</summary><p>Body</p></details>',
 '<p>Before</p><div style="break-after:page"></div>',
 "<p class=MsoNormal>Word<br clear=all style='page-break-before:always'>next</p>",
 '<hr style="page-break-before:always;display:none;"><p>Docs</p>',
 '<table><caption>Totals</caption><tr><td>x</td><td>y</td></tr></table>',
].join("");

test("HTML with every V4 slice pastes on one writer as one step, converges and exports exactly like a local V4 owner",async({page})=>{
 const result=await page.evaluate(async html=>{
  const t=window.v4x;
  const sameGrammar=t.descriptor.schemaFingerprint===t.localDescriptor.schemaFingerprint;
  t.da.select(t.caret("intro",5));t.dl.execute({kind:"setSelection",selection:t.caret("intro",5)});
  const depth=[t.a.view().undoDepth,t.owner.view().undoDepth],peer=t.b.view().undoDepth;
  const handled=[t.paste(t.da,{"text/html":html,"text/plain":"fallback"}),t.paste(t.dl,{"text/html":html,"text/plain":"fallback"})];
  await t.synchronize();
  const root=JSON.parse(t.b.documentJson()).root,kinds=root.children.map(node=>node.type.replace("breditor/",""));
  const all=JSON.stringify(root);
  return {sameGrammar,handled,steps:[t.a.view().undoDepth-depth[0],t.owner.view().undoDepth-depth[1],t.b.view().undoDepth-peer],kinds,
   v4:{numbering:all.includes('"breditor/list-reversed":true')&&all.includes('"breditor/list-style"'),language:all.includes('"breditor/language-tag":"fr-CA"'),mention:all.includes('"breditor/mention-label":"Ann"'),
    imageLink:all.includes('"breditor/image-href":"https://example.com/chart"'),internalLink:all.includes('"breditor-inline/href":"#overview"'),bookmark:all.includes('"breditor/bookmark"'),
    caption:root.children.find(node=>node.type==="breditor/table").children.at(-1).type==="breditor/paragraph",external:all.includes('"external-')},
   sameContent:JSON.stringify(t.content(t.a))===JSON.stringify(t.content(t.owner)),errors:t.errors};
 },html);
 expect(result.sameGrammar).toBe(true);expect(result.handled).toEqual([true,true]);
 // One native step for the importing writer and for the local owner; none on the peer.
 expect(result.steps).toEqual([1,1,0]);
 expect(result.kinds).toEqual(["paragraph","heading","paragraph","ordered-list","image","details","paragraph","page-break","paragraph","page-break","paragraph","page-break","paragraph","table","paragraph","paragraph"]);
 // Every slice took its V4 conversion; pasted blocks never carry a bookmark (local rule) and keep the link.
 expect(result.v4).toEqual({numbering:true,language:true,mention:true,imageLink:true,internalLink:true,bookmark:false,caption:true,external:false});
 expect(result.sameContent).toBe(true);expect(result.errors).toEqual([]);
 for(const writer of ["a","b"]){
  await expect(page.locator(`#${writer} details[data-rich-details][open]`)).toHaveCount(1);
  await expect(page.locator(`#${writer} [data-rich-page-break]`)).toHaveCount(3);
  await expect(page.locator(`#${writer} caption[data-rich-table-caption]`)).toHaveText("Totals");
  await expect(page.locator(`#${writer} span.breditor-mention[data-mention-id="u-1"]`)).toHaveText("@Ann");
  await expect(page.locator(`#${writer} span[lang="fr-CA"]`)).toHaveText("bonjour");
 }
 const exported=await page.evaluate(()=>{const t=window.v4x;return {a:t.exports(t.a),b:t.exports(t.b),local:t.exports(t.owner)};});
 expect(exported.a).toEqual(exported.local);expect(exported.b).toEqual(exported.local);
 expect(exported.a.html.ok).toBe(true);
 expect(exported.a.html.value).toContain("<details open>");expect(exported.a.html.value).toContain('lang="fr-CA"');expect(exported.a.html.value).toContain("<caption");
 expect(exported.a.markdown.ok).toBe(true);expect(exported.a.docx).toMatch(/^\d/);
 // The exported HTML reimports into the shared owner exactly as into the local owner.
 const reimport=await page.evaluate(html=>{const t=window.v4x,s=t.adapters.get(t.a).importHtml(html),l=t.adapters.get(t.owner).importHtml(html);return {same:JSON.stringify(s)===JSON.stringify(l),ok:s.ok};},exported.a.html.value);
 expect(reimport).toEqual({same:true,ok:true});
 // One Undo removes the whole import on both writers.
 const undone=await page.evaluate(async()=>{const t=window.v4x;t.a.undo();await t.synchronize();return JSON.parse(t.b.documentJson()).root.children.map(node=>node.children.map(run=>run.text).join(""));});
 expect(undone).toEqual(["Intro","Tail"]);
 await expect(page.locator("#b [data-rich-page-break]")).toHaveCount(0);
 expect(await page.evaluate(()=>window.v4x.errors)).toEqual([]);
});

test("Markdown and Google Docs paste on the other writer match the local V4 owner and converge",async({page})=>{
 const markdown="Go [up](#top) now.\n\n[![Chart](https://cdn.example/chart.png)](https://example.com/chart)\n\n1. one\n2. two\n";
 const docs='<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr"><span>First</span></p><hr style="page-break-before:always;display:none;"><p dir="ltr" lang="de"><span>Zweite</span></p></b>';
 const result=await page.evaluate(async({markdown,docs})=>{
  const t=window.v4x;
  t.db.select(t.caret("tail",4));t.dl.execute({kind:"setSelection",selection:t.caret("tail",4)});
  const depth=[t.b.view().undoDepth,t.owner.view().undoDepth];
  t.paste(t.db,{"text/markdown":markdown});t.paste(t.dl,{"text/markdown":markdown});
  t.paste(t.db,{"text/html":docs,"text/plain":"First Zweite"});t.paste(t.dl,{"text/html":docs,"text/plain":"First Zweite"});
  await t.synchronize();
  const all=t.a.documentJson();
  return {steps:[t.b.view().undoDepth-depth[0],t.owner.view().undoDepth-depth[1]],same:JSON.stringify(t.content(t.a))===JSON.stringify(t.content(t.owner)),
   internal:all.includes('"breditor-inline/href":"#top"'),imageLink:all.includes('"breditor/image-href":"https://example.com/chart"'),pageBreak:all.includes('"breditor/page-break"'),language:all.includes('"breditor/language-tag":"de"'),
   exports:JSON.stringify(t.exports(t.a))===JSON.stringify(t.exports(t.owner)),errors:t.errors};
 },{markdown,docs});
 expect(result).toEqual({steps:[2,2],same:true,internal:true,imageLink:true,pageBreak:true,language:true,exports:true,errors:[]});
 await expect(page.locator("#a [data-rich-page-break]")).toHaveCount(1);
});
