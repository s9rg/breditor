import {test,expect} from "@playwright/test";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";
// Explicit candidate rich V4 (bootstrap V9) over the actual Rust/Wasm owner: collapsible sections.
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
  const bootstrap=(formatVersion,version)=>JSON.stringify({format:"breditor/profile-bootstrap",formatVersion,schema:{name:"example/details",version},extensions:[]});
  const paragraph=(id,text)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":id},children:text?[{kind:"text",text,formats:[]}]:[]});
  const section=(open)=>({kind:"element",type:"breditor/details",entityId:null,properties:{"breditor/block-id":"d",...(open?{"breditor/details-open":true}:{})},children:[{kind:"element",type:"breditor/details-summary",entityId:null,properties:{"breditor/block-id":"s"},children:[{kind:"text",text:"Title",formats:[]}]},paragraph("b1","Body one"),paragraph("b2","Body two")]});
  const root=(withSection)=>({kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[paragraph("p","Hello world"),...(withSection?[section(withSection==="open")]:[]),paragraph("q","Second")]});
  const canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const open=(profile,withSection)=>{const binding=profile.descriptor();return profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(root(withSection))}));};
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,bootstrap(9,4)),presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson());
  const host=document.createElement("main"),errors=[];document.body.append(host);
  let core,editor;
  const mount=(withSection)=>{editor?.dispose();host.replaceChildren();core=open(profile,withSection);editor=api.mountRichEditor(host,{core,inlinePresentation:presentation,toolbar:api.createRichToolbarV4(core,presentation),onError:error=>errors.push(String(error))});window.dt.core=core;window.dt.editor=editor;};
  const select=(block,start,end=start)=>({kind:"setSelection",selection:{kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}}});
  const top=()=>JSON.parse(window.dt.core.documentJson()).root.children;
  const shape=node=>node.kind==="text"?node.text:{type:node.type.slice(9),...(node.properties["breditor/details-open"]?{open:true}:{}),children:node.children.map(shape)};
  const clipboardEvent=(type,source=new DataTransfer())=>{
   const event=new ClipboardEvent(type,{bubbles:true,cancelable:true,clipboardData:source});
   if(event.clipboardData!==source)for(const flavor of source.types)event.clipboardData.setData(flavor,source.getData(flavor));
   window.dt.editor.surface.dispatchEvent(event);return event;
  };
  window.dt={api,bootstrap,open,profile,host,errors,select,top,shape,mount,clipboardEvent,createRichInterchange};
  mount(false);
 });
});
const shapes=page=>page.evaluate(()=>window.dt.top().map(window.dt.shape));

test("V4 reports sections while V3 stays exact and refuses them",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.dt,v3p=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,4));
  try{const old=t.open(v3p,false),before=old.checkpointJson();let refused=false;
   try{old.execute({kind:"wrapDetails",data:{first:"p",last:"p",wrapper:"w",summary:"x",open:true}});}catch{refused=true;}
   let documentRefused=false;try{t.open(v3p,"open").dispose();}catch{documentRefused=true;}
   const out={v4:t.profile.descriptor().detailsVersion,v3:v3p.descriptor().detailsVersion??null,refused,documentRefused,unchanged:old.checkpointJson()===before,supports:[old.supportsDetails(),t.core.supportsDetails()]};old.dispose();return out;}finally{v3p.dispose();}});
 expect(result).toEqual({v4:1,v3:null,refused:true,documentRefused:true,unchanged:true,supports:[false,true]});
});

test("the toolbar inserts a section; typing in summary and body, Enter from the summary, Undo/Redo",async({page})=>{
 await page.locator('[data-rich-text="p"]').click();
 await page.getByRole("button",{name:"Collapsible section",exact:true}).click();
 await expect(page.locator("details[data-rich-details] > summary")).toHaveCount(1);
 expect(await shapes(page)).toEqual([{type:"details",open:true,children:[{type:"details-summary",children:[]},{type:"paragraph",children:["Hello world"]}]},{type:"paragraph",children:["Second"]}]);
 // Clicking the (empty) summary places the caret there and never toggles the section.
 await page.locator("details[data-rich-details] > summary").click();
 await page.keyboard.type("Title");
 await expect(page.locator("details[data-rich-details] > summary")).toHaveText("Title");
 expect(await page.evaluate(()=>window.dt.host.querySelector("details[data-rich-details]").open)).toBe(true);
 // Enter opens a fresh first body paragraph without splitting the summary.
 await page.keyboard.press("ArrowLeft");await page.keyboard.press("ArrowLeft");
 await page.keyboard.press("Enter");await page.keyboard.type("New");
 expect(await shapes(page)).toEqual([{type:"details",open:true,children:[{type:"details-summary",children:["Title"]},{type:"paragraph",children:["New"]},{type:"paragraph",children:["Hello world"]}]},{type:"paragraph",children:["Second"]}]);
 const result=await page.evaluate(()=>{const t=window.dt,after=t.core.documentJson(),depth=t.core.view().undoDepth;
  while(t.core.view().undoDepth>0)t.editor.execute({kind:"undo"});const original=t.top().map(t.shape);
  while(t.core.view().redoDepth>0)t.editor.execute({kind:"redo"});
  const restored=t.profile.restoreEditor(t.core.checkpointJson()),same=restored.documentJson()===after;restored.dispose();
  return {original,redo:t.core.documentJson()===after,same,depth,errors:t.errors};});
 expect(result.original).toEqual([{type:"paragraph",children:["Hello world"]},{type:"paragraph",children:["Second"]}]);
 expect(result).toMatchObject({redo:true,same:true,errors:[]});
 expect(result.depth).toBeGreaterThanOrEqual(3);
});

test("collapse/expand is explicit: a body caret moves to the summary and summary clicks never toggle",async({page})=>{
 await page.evaluate(()=>{window.dt.mount("open");window.dt.editor.execute(window.dt.select("b2",4));});
 await page.locator('[data-rich-text="b2"]').click();
 await page.getByRole("button",{name:"Expand/Collapse section",exact:true}).click();
 await expect(page.locator("details[data-rich-details]")).not.toHaveAttribute("open");
 await expect(page.locator('[data-rich-text="b1"]')).toBeHidden();
 const collapsed=await page.evaluate(()=>({selection:window.dt.core.view().selection,undo:window.dt.core.view().undoDepth,open:window.dt.top()[1].properties["breditor/details-open"]??null}));
 expect(collapsed).toEqual({selection:{kind:"text",anchor:{block:"s",offset:"5",affinity:"before"},focus:{block:"s",offset:"5",affinity:"before"}},undo:1,open:null});
 // Clicking the summary text places the caret and leaves the section collapsed.
 await page.locator("details[data-rich-details] > summary").click();
 await page.waitForTimeout(100);
 await expect(page.locator("details[data-rich-details]")).not.toHaveAttribute("open");
 await page.keyboard.press("End");await page.keyboard.type("!");
 await expect(page.locator("details[data-rich-details] > summary")).toHaveText("Title!");
 await expect(page.locator("details[data-rich-details]")).not.toHaveAttribute("open");
 // A browser-initiated toggle is reverted to document state while editing.
 await page.evaluate(()=>{window.dt.host.querySelector("details[data-rich-details]").open=true;});
 await expect(page.locator("details[data-rich-details]")).not.toHaveAttribute("open");
 await page.getByRole("button",{name:"Expand/Collapse section",exact:true}).click();
 await expect(page.locator("details[data-rich-details]")).toHaveAttribute("open","");
 await expect(page.locator('[data-rich-text="b1"]')).toBeVisible();
 // Undo restores collapsed then expanded state; each toggle is its own group.
 expect(await page.evaluate(()=>{const t=window.dt,states=[];for(let i=0;i<3;i++){t.editor.execute({kind:"undo"});states.push([t.top()[1].properties["breditor/details-open"]??false,t.host.querySelector("details[data-rich-details]").open]);}return {states,errors:t.errors};})).toEqual({states:[[false,false],[false,false],[true,true]],errors:[]});
});

test("Backspace at a summary start removes the section; copy/paste keeps whole sections; V3 refuses the record",async({page})=>{
 await page.evaluate(()=>window.dt.mount("open"));
 await page.locator("details[data-rich-details] > summary").click();
 await page.keyboard.press("Home");await page.keyboard.press("Backspace");
 expect(await shapes(page)).toEqual([{type:"paragraph",children:["Hello world"]},{type:"paragraph",children:["Title"]},{type:"paragraph",children:["Body one"]},{type:"paragraph",children:["Body two"]},{type:"paragraph",children:["Second"]}]);
 await page.keyboard.press("ControlOrMeta+z");
 await expect(page.locator("details[data-rich-details] > summary")).toHaveText("Title");
 const result=await page.evaluate(()=>{const t=window.dt;
  t.editor.execute({kind:"setSelection",selection:{kind:"node",block:"d"}});
  const transfer=t.clipboardEvent("copy").clipboardData,record=transfer.getData("application/x-breditor-rich+json");
  t.editor.execute(t.select("q",6));const depth=t.core.view().undoDepth;t.clipboardEvent("paste",transfer);
  const v3p=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,4)),old=t.open(v3p,false);v3p.dispose();
  const v4Valid=t.core.validateClipboard(record).kind;let v3Refused=false;try{old.validateClipboard(record);}catch{v3Refused=true;}old.dispose();
  const sections=t.top().filter(n=>n.type==="breditor/details");
  return {count:sections.length,shapes:sections.map(t.shape),distinct:new Set(sections.map(n=>n.properties["breditor/block-id"])).size,delta:t.core.view().undoDepth-depth,dom:t.host.querySelectorAll("details[data-rich-details]").length,v4Valid,v3Refused,errors:t.errors};});
 const copy={type:"details",open:true,children:[{type:"details-summary",children:["Title"]},{type:"paragraph",children:["Body one"]},{type:"paragraph",children:["Body two"]}]};
 expect(result).toEqual({count:2,shapes:[copy,copy],distinct:2,delta:1,dom:2,v4Valid:"flow",v3Refused:true,errors:[]});
});

test("interchange maps <details>/<summary> for the V4 owner only",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.dt,html="<details open><summary>Title <b>bold</b></summary><p>Body</p></details>";
  const kinds=r=>r.ok?JSON.parse(r.value.structuredJson).document.root.children.map(t.shape):r.error;
  const adapter=t.createRichInterchange(t.core),v4=adapter.importHtml(html),exported=adapter.exportHtml(v4.value.structuredJson),markdown=adapter.exportMarkdown(v4.value.structuredJson),back=adapter.importMarkdown(markdown.ok?markdown.value:"");
  const v3p=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,4)),old=t.open(v3p,false);v3p.dispose();
  try{const v3=t.createRichInterchange(old).importHtml(html);
   return {v4:kinds(v4),losses:v4.losses,html:exported.ok&&exported.value,markdownLosses:markdown.losses.map(l=>l.code),back:kinds(back),v3:kinds(v3),v3losses:v3.losses.map(l=>[l.code,l.count])};}finally{old.dispose();}
 });
 const section={type:"details",open:true,children:[{type:"details-summary",children:["Title ","bold"]},{type:"paragraph",children:["Body"]}]};
 expect(result.v4).toEqual([section]);expect(result.losses).toEqual([]);
 expect(result.html).toBe('<details open><summary>Title <strong>bold</strong></summary><p style="white-space:pre-wrap">Body</p></details>');
 expect(result.markdownLosses).toEqual(["markdown-feature"]);
 expect(result.back).toEqual([section]);
 expect(result.v3).toEqual([{type:"paragraph",children:["Title ","bold"]},{type:"paragraph",children:["Body"]}]);
 expect(result.v3losses).toEqual([["unsupported-attribute",1],["unsupported-element",2]]);
});
