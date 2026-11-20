import {test,expect} from "@playwright/test";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";
// Explicit candidate rich V4 (bootstrap V9) over the actual Rust/Wasm owner: bookmarks and internal links.
let interchange="",statics="";
const bundle=async path=>{const value=await rolldown({input:fileURLToPath(new URL(path,import.meta.url)),platform:"browser",logLevel:"silent"});const code=(await value.generate({format:"esm"})).output[0].code;await value.close();return code;};
test.beforeAll(async()=>{
 interchange=await bundle("../../packages/breditor-interchange/src/index.ts");
 statics=await bundle("../../packages/breditor-editor/src/static_document.ts");
});
test.beforeEach(async({page})=>{
 await page.route("**/interchange.js",route=>route.fulfill({status:200,contentType:"text/javascript; charset=utf-8",body:interchange}));
 await page.route("**/static.js",route=>route.fulfill({status:200,contentType:"text/javascript; charset=utf-8",body:statics}));
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const api=await import("/rich.js"),{createRichInterchange}=await import("/interchange.js"),{renderStaticDocument}=await import("/static.js");
  const bootstrap=(formatVersion,version)=>JSON.stringify({format:"breditor/profile-bootstrap",formatVersion,schema:{name:"example/anchors",version},extensions:[]});
  const text=(value,formats=[])=>({kind:"text",text:value,formats});
  const paragraph=(id,children,extra={})=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":id,...extra},children});
  const heading=(id,value,extra={})=>({kind:"element",type:"breditor/heading",entityId:null,properties:{"breditor/block-id":id,"breditor/level":2,...extra},children:[text(value)]});
  const link=href=>({type:"breditor-inline/link",properties:{"breditor-inline/href":href,"breditor-inline/new-window":false}});
  const filler=Array.from({length:30},(_,i)=>paragraph(`f${i}`,[text(`Filler line ${i}`)]));
  const root=bookmarked=>({kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[
   paragraph("p",bookmarked?[text("Jump to "),text("the end",[link("#end")]),text(" now")]:[text("Jump to the end now")]),...filler,heading("h","Ending",bookmarked?{"breditor/bookmark":"end"}:{}),paragraph("q",[text("Tail words")])]});
  const canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const envelope=(profile,bookmarked)=>{const binding=profile.descriptor();return JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(root(bookmarked))});};
  const open=(profile,bookmarked)=>profile.createEditor(envelope(profile,bookmarked));
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,bootstrap(9,4)),presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson());
  const host=document.createElement("main"),errors=[];host.style.cssText="height:240px;overflow:auto";document.body.append(host);
  let core,editor;
  const mount=bookmarked=>{editor?.dispose();host.replaceChildren();core=open(profile,bookmarked);editor=api.mountRichEditor(host,{core,inlinePresentation:presentation,toolbar:api.createRichToolbarV4(core,presentation),onError:error=>errors.push(String(error))});window.bm.core=core;window.bm.editor=editor;};
  const select=(block,start,end=start)=>({kind:"setSelection",selection:{kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}}});
  const nodes=()=>JSON.parse(window.bm.core.documentJson()).root.children;
  const bookmarkOf=id=>nodes().find(n=>n.properties["breditor/block-id"]===id)?.properties["breditor/bookmark"]??null;
  const hrefs=()=>nodes().flatMap(n=>n.children.flatMap(c=>c.kind==="text"?c.formats.filter(f=>f.type==="breditor-inline/link").map(f=>f.properties["breditor-inline/href"]):[]));
  const clipboardEvent=(type,source=new DataTransfer())=>{
   const event=new ClipboardEvent(type,{bubbles:true,cancelable:true,clipboardData:source});
   if(event.clipboardData!==source)for(const flavor of source.types)event.clipboardData.setData(flavor,source.getData(flavor));
   window.bm.editor.surface.dispatchEvent(event);return event;
  };
  window.bm={api,bootstrap,open,envelope,profile,host,errors,select,nodes,bookmarkOf,hrefs,mount,clipboardEvent,createRichInterchange,renderStaticDocument,presentation};
  mount(true);
 });
});
const control=(page,id)=>page.locator(`[data-rich-control="${id}"]`);

test("V4 reports bookmarks while V3 stays exact and refuses them",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.bm,v3p=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,4));
  try{const old=t.open(v3p,false),before=old.checkpointJson();let refused=0;
   try{old.execute({kind:"setBookmark",data:{block:"q",name:"x"}});}catch{refused++;}
   try{old.execute({kind:"renameBookmark",data:{from:"a",to:"b"}});}catch{refused++;}
   let documentRefused=false;try{t.open(v3p,true).dispose();}catch{documentRefused=true;}
   const out={v4:t.profile.descriptor().bookmarkVersion,v3:v3p.descriptor().bookmarkVersion??null,refused,documentRefused,unchanged:old.checkpointJson()===before,supports:[old.supportsBookmarks(),t.core.supportsBookmarks()],index:t.core.bookmarkIndex()};old.dispose();return out;}finally{v3p.dispose();}});
 expect(result).toEqual({v4:1,v3:null,refused:2,documentRefused:true,unchanged:true,supports:[false,true],index:{bookmarks:[{name:"end",block:"h"}],links:[{block:"p",target:"end"}],brokenLinks:[]}});
});

test("bookmarked blocks and internal links render namespaced and match the static renderer",async({page})=>{
 await expect(page.locator("h2#bm-end[data-rich-bookmark='end']")).toHaveCount(1);
 await expect(page.locator("a[href='#bm-end'][data-rich-internal-link='end']")).toHaveCount(1);
 const parity=await page.evaluate(()=>{const t=window.bm,host=document.createElement("div");host.innerHTML=t.renderStaticDocument(t.core.documentJson(),{fragment:true});
  const attributes=element=>Object.fromEntries([...element.attributes].map(a=>[a.name,a.value]));
  const read=root=>({anchors:[...root.querySelectorAll("[data-rich-bookmark]")].map(e=>[e.tagName,attributes(e)]),links:[...root.querySelectorAll("a")].map(attributes)});
  return {live:read(t.editor.surface),static:read(host)};});
 expect(parity.static).toEqual(parity.live);
 expect(parity.live.links).toEqual([{"data-rich-format":"breditor-inline/link",class:"breditor-link",href:"#bm-end","data-rich-internal-link":"end"}]);
});

test("the Bookmark control sets, refuses duplicates and renames with links in one Undo step",async({page})=>{
 await page.evaluate(()=>window.bm.editor.execute(window.bm.select("q",2)));
 await control(page,"bookmark").locator("summary").click();
 await page.locator('[data-rich-field="bookmark-name"]').fill("end");
 await page.locator('[data-rich-action="bookmark"]').click();
 await expect.poll(()=>page.evaluate(()=>window.bm.errors.length)).toBe(1);
 expect(await page.evaluate(()=>window.bm.core.view().undoDepth)).toBe(0);
 await page.locator('[data-rich-field="bookmark-name"]').fill("tail");
 await page.locator('[data-rich-action="bookmark"]').click();
 await expect(page.locator("p#bm-tail")).toHaveCount(1);
 expect(await page.evaluate(()=>({q:window.bm.bookmarkOf("q"),undo:window.bm.core.view().undoDepth}))).toEqual({q:"tail",undo:1});
 // Renaming the heading's bookmark retargets the link to it in the same history group.
 await page.evaluate(()=>window.bm.editor.execute(window.bm.select("h",1)));
 await control(page,"bookmark").locator("summary").click();
 await expect(page.locator('[data-rich-field="bookmark-name"]')).toHaveValue("end");
 await page.locator('[data-rich-field="bookmark-name"]').fill("finale");
 await page.locator('[data-rich-action="bookmark"]').click();
 await expect(page.locator("a[href='#bm-finale']")).toHaveCount(1);
 const result=await page.evaluate(()=>{const t=window.bm,after=t.core.documentJson(),renamed={h:t.bookmarkOf("h"),hrefs:t.hrefs(),undo:t.core.view().undoDepth};
  t.editor.execute({kind:"undo"});const undo={h:t.bookmarkOf("h"),hrefs:t.hrefs()};t.editor.execute({kind:"redo"});
  const restored=t.profile.restoreEditor(t.core.checkpointJson()),same=restored.documentJson()===after;restored.dispose();
  return {renamed,undo,redo:t.core.documentJson()===after,same,errors:t.errors.length};});
 expect(result).toEqual({renamed:{h:"finale",hrefs:["#finale"],undo:2},undo:{h:"end",hrefs:["#end"]},redo:true,same:true,errors:1});
});

test("Link to bookmark lists the document's bookmarks and links the selection",async({page})=>{
 await page.evaluate(()=>window.bm.editor.execute(window.bm.select("q",0,4)));
 await control(page,"link-bookmark").locator("summary").click();
 const select=page.locator('[data-rich-field="link-bookmark-target"]');
 await expect(select.locator("option")).toHaveCount(2);
 await select.selectOption("end");
 await page.locator('[data-rich-action="link-bookmark"]').click();
 await expect(page.locator("[data-rich-text='q'] a[href='#bm-end']")).toHaveText("Tail");
 expect(await page.evaluate(()=>({hrefs:window.bm.hrefs(),undo:window.bm.core.view().undoDepth,errors:window.bm.errors}))).toEqual({hrefs:["#end","#end"],undo:1,errors:[]});
});

test("internal links are inert while editing and scroll within the surface when read-only",async({page})=>{
 const url=page.url(),link=page.locator("a[data-rich-internal-link]");
 const inView=()=>page.evaluate(()=>{const target=document.querySelector("#bm-end").getBoundingClientRect(),box=window.bm.host.getBoundingClientRect();return target.top>=box.top-1&&target.top<box.bottom;});
 await link.scrollIntoViewIfNeeded();
 const before=await page.evaluate(()=>window.bm.host.scrollTop);
 await link.click();
 await page.waitForTimeout(200);
 expect(page.url()).toBe(url);
 expect(await page.evaluate(()=>window.bm.host.scrollTop)).toBe(before);
 expect(await inView()).toBe(false);
 expect(await page.evaluate(()=>window.bm.core.view().selection.focus.block)).toBe("p");
 await page.evaluate(()=>window.bm.editor.setReadOnly(true));
 await link.scrollIntoViewIfNeeded();
 await link.click();
 await expect.poll(inView).toBe(true);
 expect(page.url()).toBe(url);
 expect(await page.evaluate(()=>location.hash)).toBe("");
});

test("removing the target leaves a reported, marked dangling link",async({page})=>{
 await page.evaluate(()=>window.bm.editor.execute(window.bm.select("h",1)));
 await page.locator('[data-rich-action="remove-bookmark"]').click();
 await expect(page.locator("a[data-rich-link-broken]")).toHaveCount(1);
 await expect(page.locator("a[data-rich-internal-link]")).not.toHaveAttribute("href",/.*/);
 expect(await page.evaluate(()=>window.bm.core.bookmarkIndex())).toEqual({bookmarks:[],links:[{block:"p",target:"end"}],brokenLinks:[{block:"p",target:"end"}]});
 const decoration=await page.locator("a[data-rich-link-broken]").evaluate(e=>getComputedStyle(e).textDecorationStyle);
 expect(decoration).toBe("wavy");
 await page.evaluate(()=>window.bm.editor.execute({kind:"undo"}));
 await expect(page.locator("a[data-rich-link-broken]")).toHaveCount(0);
});

test("native copy and paste never duplicate a bookmark; V3 refuses the record",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.bm;
  t.editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"f29",offset:"0",affinity:"after"},focus:{block:"q",offset:"4",affinity:"after"}}});
  const transfer=t.clipboardEvent("copy").clipboardData,record=transfer.getData("application/x-breditor-rich+json");
  t.editor.execute(t.select("q",4));const depth=t.core.view().undoDepth;t.clipboardEvent("paste",transfer);
  const v3p=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,4)),old=t.open(v3p,false);v3p.dispose();
  let v3Refused=false;try{old.validateClipboard(record);}catch{v3Refused=true;}old.dispose();
  return {bookmarks:t.core.bookmarkIndex().bookmarks,broken:t.core.bookmarkIndex().brokenLinks,delta:t.core.view().undoDepth-depth,record:record.includes("breditor/bookmark"),v3Refused,errors:t.errors};
 });
 expect(result).toEqual({bookmarks:[{name:"end",block:"h"}],broken:[],delta:1,record:true,v3Refused:true,errors:[]});
});

test("interchange maps anchors and fragment links for the V4 owner only",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.bm;
  const html='<h1 id="top">Title</h1><p><a name="Second"></a>Body <a href="#top">up</a></p>';
  const shape=r=>r.ok?JSON.parse(r.value.structuredJson).document.root.children.map(n=>({type:n.type.slice(9),bookmark:n.properties["breditor/bookmark"]??null,hrefs:n.children.flatMap(c=>c.formats.filter(f=>f.type==="breditor-inline/link").map(f=>f.properties["breditor-inline/href"]))})):r.error;
  const adapter=t.createRichInterchange(t.core),v4=adapter.importHtml(html);
  const transfer=t.core.validateClipboard(v4.value.structuredJson);
  const exported=adapter.exportHtml(transfer.structuredJson),markdown=adapter.exportMarkdown(transfer.structuredJson);
  const v3p=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,4)),old=t.open(v3p,false);v3p.dispose();
  try{const v3=t.createRichInterchange(old).importHtml(html);
   return {v4:shape(v4),v4losses:v4.losses,html:exported.ok&&exported.value,markdownFallback:markdown.ok&&markdown.value.includes('<a href="#bm-top">'),v3:shape(v3),v3losses:v3.losses.map(l=>[l.code,l.count])};}finally{old.dispose();}
 });
 expect(result.v4).toEqual([{type:"heading",bookmark:"top",hrefs:[]},{type:"paragraph",bookmark:"Second",hrefs:["#top"]}]);
 expect(result.v4losses).toEqual([]);
 expect(result.html).toBe('<h1 id="bm-top" style="white-space:pre-wrap">Title</h1><p id="bm-Second" style="white-space:pre-wrap">Body <a href="#bm-top">up</a></p>');
 expect(result.markdownFallback).toBe(true);
 expect(result.v3).toEqual([{type:"heading",bookmark:null,hrefs:[]},{type:"paragraph",bookmark:null,hrefs:[]}]);
 expect(result.v3losses).toEqual([["unsafe-link",1],["unsupported-attribute",1]]);
});
