import {test,expect} from "@playwright/test";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";
// Explicit candidate rich V4 (bootstrap V9) over the actual Rust/Wasm owner: table captions.
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
  const bootstrap=(formatVersion,version)=>JSON.stringify({format:"breditor/profile-bootstrap",formatVersion,schema:{name:"example/captions",version},extensions:[]});
  const paragraph=(id,text)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":id},children:text?[{kind:"text",text,formats:[]}]:[]});
  const cell=(r,c)=>({kind:"element",type:"breditor/table-cell",entityId:null,properties:{"breditor/block-id":`cell-${r}-${c}`,"breditor/column-id":c,"breditor/header":false},children:[paragraph(`p-${r}-${c}`,`${r}${c}`)]});
  const row=r=>({kind:"element",type:"breditor/table-row",entityId:null,properties:{"breditor/block-id":`row-${r}`,"breditor/row-id":r},children:[cell(r,"a"),cell(r,"b")]});
  const table=caption=>({kind:"element",type:"breditor/table",entityId:null,properties:{"breditor/block-id":"tbl","breditor/table-id":"t","breditor/columns":[{id:"a",width:160},{id:"b",width:160}],"breditor/merges":[],"breditor/retracted-merges":[]},children:[row("r1"),row("r2"),...(caption===undefined?[]:[paragraph("cap",caption)])]});
  const root=caption=>({kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[paragraph("p","Hello world"),table(caption),paragraph("q","Second")]});
  const canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const open=(profile,caption)=>{const binding=profile.descriptor();return profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(root(caption))}));};
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,bootstrap(9,4)),presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson());
  const host=document.createElement("main"),errors=[];document.body.append(host);
  let core,editor;
  const mount=caption=>{editor?.dispose();host.replaceChildren();core=open(profile,caption);editor=api.mountRichEditor(host,{core,inlinePresentation:presentation,toolbar:api.createRichToolbarV4(core,presentation),onError:error=>errors.push(String(error))});window.dt.core=core;window.dt.editor=editor;};
  const select=(block,start,end=start)=>({kind:"setSelection",selection:{kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}}});
  const top=()=>JSON.parse(window.dt.core.documentJson()).root.children;
  const caption=()=>{const tbl=top()[1],last=tbl.children.at(-1);return last.type==="breditor/paragraph"?{id:last.properties["breditor/block-id"],text:last.children.map(n=>n.text).join("")}:null;};
  const clipboardEvent=(type,source=new DataTransfer())=>{
   const event=new ClipboardEvent(type,{bubbles:true,cancelable:true,clipboardData:source});
   if(event.clipboardData!==source)for(const flavor of source.types)event.clipboardData.setData(flavor,source.getData(flavor));
   window.dt.editor.surface.dispatchEvent(event);return event;
  };
  window.dt={api,bootstrap,open,profile,host,errors,select,top,caption,mount,clipboardEvent,createRichInterchange};
  mount(undefined);
 });
});
const button=page=>page.getByRole("button",{name:"Table caption",exact:true});

test("V4 reports table captions while V3 stays exact and refuses them",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.dt,v3p=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,4));
  try{const old=t.open(v3p,undefined),before=old.checkpointJson();let refused=false;
   try{old.execute({kind:"addTableCaption",data:{table:"t",caption:"c"}});}catch{refused=true;}
   let documentRefused=false;try{t.open(v3p,"Legend").dispose();}catch{documentRefused=true;}
   const out={v4:t.profile.descriptor().tableCaptionVersion,v3:v3p.descriptor().tableCaptionVersion??null,refused,documentRefused,unchanged:old.checkpointJson()===before,supports:[old.supportsTableCaptions(),t.core.supportsTableCaptions()]};old.dispose();return out;}finally{v3p.dispose();}});
 expect(result).toEqual({v4:1,v3:null,refused:true,documentRefused:true,unchanged:true,supports:[false,true]});
});

test("the toolbar adds an editable caption below the grid; typing, Enter, remove, Undo/Redo/restore",async({page})=>{
 await expect(button(page)).toBeDisabled();
 await page.locator('[data-rich-text="p-r2-b"]').click();
 await expect(button(page)).toBeEnabled();await expect(button(page)).toHaveAttribute("aria-pressed","false");
 await button(page).click();
 const caption=page.locator("table[data-rich-table] > caption[data-rich-table-caption] > p[data-rich-text]");
 await expect(caption).toHaveCount(1);await expect(button(page)).toHaveAttribute("aria-pressed","true");
 const id=await page.evaluate(()=>window.dt.caption().id);
 expect(await page.evaluate(()=>window.dt.core.view().selection.focus.block)).toBe(id);
 // The caret is in the caption: real typing, a formatted word and a line break stay in it.
 await page.keyboard.type("Quarterlysales");
 await expect(caption).toHaveText("Quarterlysales");
 // Enter keeps one caption paragraph: it inserts a line break at the caret.
 await page.evaluate(id=>window.dt.editor.execute(window.dt.select(id,9)),id);
 await page.keyboard.press("Enter");
 await expect(caption).toHaveText("Quarterly\nsales");
 expect(await page.evaluate(()=>window.dt.caption().text)).toBe("Quarterly\nsales");
 // <caption> is the table's first DOM child but is laid out after the rows.
 const layout=await page.evaluate(()=>{const table=window.dt.host.querySelector("table[data-rich-table]"),caption=table.caption,last=table.rows[table.rows.length-1];return {first:table.firstElementChild===caption,below:caption.getBoundingClientRect().top>=last.getBoundingClientRect().bottom-1,side:getComputedStyle(caption).captionSide,rows:table.rows.length};});
 expect(layout).toEqual({first:true,below:true,side:"bottom",rows:2});
 // Remove from the caption: the table becomes the node selection; Undo restores the caption.
 await button(page).click();
 await expect(page.locator("caption")).toHaveCount(0);
 const result=await page.evaluate(()=>{const t=window.dt,removed=t.core.documentJson(),selection=t.core.view().selection;
  t.editor.execute({kind:"undo"});const back=t.caption();t.editor.execute({kind:"redo"});
  const restored=t.profile.restoreEditor(t.core.checkpointJson()),same=restored.documentJson()===removed;restored.dispose();
  while(t.core.view().undoDepth>0)t.editor.execute({kind:"undo"});
  return {selection,back,same,original:t.caption(),errors:t.errors};});
 expect(result).toEqual({selection:{kind:"node",block:"tbl"},back:{id,text:"Quarterly\nsales"},same:true,original:null,errors:[]});
});

test("arrow keys cross the caption boundaries in visual order; flow navigation leaves it through the table",async({page})=>{
 await page.evaluate(()=>window.dt.mount("Legend"));
 const at=()=>page.evaluate(()=>{const s=window.dt.core.view().selection;return s.kind==="text"?`${s.focus.block}:${s.focus.offset}`:`${s.kind}:${s.block??""}`;});
 const place=async(block,offset)=>{await page.locator(`[data-rich-text="${block}"]`).click();await page.evaluate(([b,o])=>window.dt.editor.execute(window.dt.select(b,o)),[block,offset]);};
 const press=async key=>{await page.keyboard.press(key);await page.waitForTimeout(30);return at();};
 // Down from the last row enters the caption laid out below it; Up leaves it to the last row.
 await place("p-r2-a",1);expect(await press("ArrowDown")).toBe("cap:0");
 expect(await press("ArrowUp")).toBe("p-r2-a:3");
 // Right at the end of the last cell enters the caption; Left at its start returns.
 await place("p-r2-b",3);expect(await press("ArrowRight")).toBe("cap:0");
 expect(await press("ArrowLeft")).toBe("p-r2-b:3");
 // Right at the caption end and Down from it continue after the table.
 await place("cap",6);expect(await press("ArrowRight")).toBe("q:0");
 await place("cap",2);expect(await press("ArrowDown")).toBe("q:0");
 // From the block after the table, Up and Left reach the caption end, never a row.
 expect(await press("ArrowUp")).toBe("cap:6");
 await place("q",0);expect(await press("ArrowLeft")).toBe("cap:6");
 // Typing lands in the caption.
 await page.keyboard.type("!");
 expect(await page.evaluate(()=>window.dt.caption().text)).toBe("Legend!");
 // Alt+PageUp from the caption start selects the table; Alt+PageDown from its end leaves after it.
 await page.evaluate(()=>window.dt.editor.execute(window.dt.select("cap",0)));
 await page.keyboard.press("Alt+PageUp");
 expect(await at()).toBe("node:tbl");
 await page.evaluate(()=>window.dt.editor.execute(window.dt.select("cap",7)));
 await page.keyboard.press("Alt+PageDown");
 expect(await at()).toBe("q:0");
 expect(await page.evaluate(()=>window.dt.errors)).toEqual([]);
});

test("table actions keep the caption; grid selections exclude it; Backspace removes an empty caption",async({page})=>{
 await page.evaluate(()=>window.dt.mount("Legend"));
 await page.locator('[data-rich-text="p-r1-a"]').click();
 await page.getByRole("button",{name:"Add row",exact:true}).click();
 await page.getByRole("button",{name:"Add column",exact:true}).click();
 await page.locator('[data-rich-text="p-r1-a"]').click();
 await page.getByRole("button",{name:"Delete column",exact:true}).click();
 const after=await page.evaluate(()=>{const t=window.dt,tbl=t.top()[1];return {rows:tbl.children.filter(n=>n.type==="breditor/table-row").length,caption:t.caption(),dom:t.host.querySelector("table").caption?.textContent,view:t.core.view().tables[0].rows.length};});
 expect(after).toEqual({rows:3,caption:{id:"cap",text:"Legend"},dom:"Legend",view:3});
 // A grid copy carries only cells.
 const grid=await page.evaluate(()=>{const t=window.dt;
  t.editor.execute({kind:"setSelection",selection:{kind:"grid",anchor:{table:"t",row:"r1",column:"b"},focus:{table:"t",row:"r2",column:"b"}}});
  const transfer=t.clipboardEvent("copy").clipboardData;return {record:transfer.getData("application/x-breditor-rich+json").includes("Legend"),text:transfer.getData("text/plain")};});
 expect(grid).toEqual({record:false,text:"r1b\nr2b"});
 // Backspace at the start of an empty caption removes it in one Undo step.
 await page.evaluate(()=>{const t=window.dt;t.mount("");t.editor.execute(t.select("cap",0));});
 await page.locator('[data-rich-text="cap"]').click();
 await page.evaluate(()=>window.dt.editor.execute(window.dt.select("cap",0)));
 await page.keyboard.press("Backspace");
 await expect(page.locator("caption")).toHaveCount(0);
 expect(await page.evaluate(()=>({caption:window.dt.caption(),undo:window.dt.core.view().undoDepth,selection:window.dt.core.view().selection}))).toEqual({caption:null,undo:1,selection:{kind:"node",block:"tbl"}});
});

test("copy/paste keeps whole captioned tables; V3 refuses the record",async({page})=>{
 await page.evaluate(()=>window.dt.mount("Legend"));
 const result=await page.evaluate(()=>{const t=window.dt;
  t.editor.execute({kind:"setSelection",selection:{kind:"node",block:"tbl"}});
  const transfer=t.clipboardEvent("copy").clipboardData,record=transfer.getData("application/x-breditor-rich+json"),plain=transfer.getData("text/plain");
  t.editor.execute(t.select("q",6));const depth=t.core.view().undoDepth;t.clipboardEvent("paste",transfer);
  const v3p=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,4)),old=t.open(v3p,undefined);v3p.dispose();
  const v4Valid=t.core.validateClipboard(record).kind;let v3Refused=false;try{old.validateClipboard(record);}catch{v3Refused=true;}old.dispose();
  const tables=t.top().filter(n=>n.type==="breditor/table"),captions=tables.map(n=>n.children.at(-1)).filter(n=>n.type==="breditor/paragraph");
  return {tables:tables.length,captions:captions.map(n=>n.children[0].text),distinct:new Set(captions.map(n=>n.properties["breditor/block-id"])).size,delta:t.core.view().undoDepth-depth,dom:[...t.host.querySelectorAll("table > caption")].map(n=>n.textContent),plain,v4Valid,v3Refused,errors:t.errors};});
 expect(result).toEqual({tables:2,captions:["Legend","Legend"],distinct:2,delta:1,dom:["Legend","Legend"],plain:"r1a\tr1b\nr2a\tr2b\nLegend",v4Valid:"flow",v3Refused:true,errors:[]});
});

test("interchange maps <caption> for the V4 owner only",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.dt,html="<table><caption>Sales <b>2026</b></caption><tr><td>A</td></tr></table>";
  const shape=node=>node.kind==="text"?node.text:{type:node.type.slice(9),children:node.children.map(shape)};
  const kinds=r=>r.ok?JSON.parse(r.value.structuredJson).document.root.children.map(shape):r.error;
  const adapter=t.createRichInterchange(t.core),v4=adapter.importHtml(html),exported=adapter.exportHtml(v4.value.structuredJson),markdown=adapter.exportMarkdown(v4.value.structuredJson),back=adapter.importMarkdown(markdown.ok?markdown.value:"");
  t.editor.execute(t.select("q",6));const pasted=t.core.validateClipboard(v4.value.structuredJson).kind;
  const v3p=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,4)),old=t.open(v3p,undefined);v3p.dispose();
  try{const v3=t.createRichInterchange(old).importHtml(html);
   return {v4:kinds(v4),losses:v4.losses,html:exported.ok&&exported.value.startsWith('<table><caption><p style="white-space:pre-wrap">Sales <strong>2026</strong></p></caption>'),markdownLosses:markdown.losses.map(l=>l.code),back:kinds(back),pasted,v3:kinds(v3),v3losses:v3.losses.map(l=>[l.code,l.count])};}finally{old.dispose();}
 });
 const table={type:"table",children:[{type:"table-row",children:[{type:"table-cell",children:[{type:"paragraph",children:["A"]}]}]},{type:"paragraph",children:["Sales ","2026"]}]};
 expect(result).toEqual({v4:[table],losses:[],html:true,markdownLosses:["markdown-feature"],back:[table],pasted:"flow",
  v3:[{type:"paragraph",children:["Sales ","2026"]},{type:"table",children:[{type:"table-row",children:[{type:"table-cell",children:[{type:"paragraph",children:["A"]}]}]}]}],v3losses:[["block-structure",1]]});
});
