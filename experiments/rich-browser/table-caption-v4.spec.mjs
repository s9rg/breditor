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
   return {v4:kinds(v4),losses:v4.losses,html:exported.ok&&exported.value.startsWith('<table><caption style="caption-side:bottom"><p style="white-space:pre-wrap">Sales <strong>2026</strong></p></caption>'),markdownLosses:markdown.losses.map(l=>l.code),back:kinds(back),pasted,v3:kinds(v3),v3losses:v3.losses.map(l=>[l.code,l.count])};}finally{old.dispose();}
 });
 const table={type:"table",children:[{type:"table-row",children:[{type:"table-cell",children:[{type:"paragraph",children:["A"]}]}]},{type:"paragraph",children:["Sales ","2026"]}]};
 expect(result).toEqual({v4:[table],losses:[],html:true,markdownLosses:["markdown-feature"],back:[table],pasted:"flow",
  v3:[{type:"paragraph",children:["Sales ","2026"]},{type:"table",children:[{type:"table-row",children:[{type:"table-cell",children:[{type:"paragraph",children:["A"]}]}]}]}],v3losses:[["block-structure",1]]});
});

test("V3 and V4 reject tables nested inside HTML captions",async({page})=>{
 const result=await page.evaluate(()=>{
  const t=window.dt;
  const inner="<table><tr><td>Inner</td></tr></table>";
  const source=caption=>`<table><caption>${caption}</caption><tr><td>Outer</td></tr></table>`;
  const v3Profile=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,4));
  const old=t.open(v3Profile,undefined);
  try{
   return [old,t.core].map(owner=>{
    const adapter=t.createRichInterchange(owner),before=owner.checkpointJson();
    const direct=adapter.importHtml(source(inner));
    const wrapped=adapter.importHtml(source(`<blockquote>${inner}</blockquote>`));
    const markdown=adapter.importMarkdown(source(inner));
    const outcome=value=>value.ok?JSON.parse(value.value.structuredJson).document.root.children.map(node=>node.type):value.error;
    return {direct:outcome(direct),wrapped:outcome(wrapped),markdown:outcome(markdown),unchanged:owner.checkpointJson()===before};
   });
  }finally{old.dispose();v3Profile.dispose();}
 });
 const refused={direct:"unsupported-content",wrapped:"unsupported-content",markdown:"unsupported-content",unchanged:true};
 expect(result).toEqual([refused,refused]);
});

test("portable HTML renders its semantic table caption below the grid",async({page})=>{
 const result=await page.evaluate(()=>{
  const t=window.dt,adapter=t.createRichInterchange(t.core),before=t.core.checkpointJson();
  const source=adapter.importHtml('<table><caption>Legend</caption><tr><th>Heading</th><td>Value</td></tr></table>');
  const exported=adapter.exportHtml(source.value.structuredJson);
  const mount=document.createElement("section");mount.innerHTML=exported.value;document.body.append(mount);
  try{
   const table=mount.querySelector("table"),caption=table.caption,back=adapter.importHtml(exported.value);
   return {first:caption===table.firstElementChild,afterGrid:caption.getBoundingClientRect().top>=table.rows[0].getBoundingClientRect().bottom-1,
    side:getComputedStyle(caption).captionSide,text:caption.textContent,losses:back.losses,roundTrip:back.ok&&back.value.structuredJson===source.value.structuredJson,
    unchanged:t.core.checkpointJson()===before};
  }finally{mount.remove();}
 });
 expect(result).toEqual({first:true,afterGrid:true,side:"bottom",text:"Legend",losses:[],roundTrip:true,unchanged:true});
});

test("column groups retain declared spans and fallback widths without shifting source cells",async({page})=>{
 const result=await page.evaluate(()=>{
  const t=window.dt,adapter=t.createRichInterchange(t.core),before=t.core.checkpointJson();
  const table=(group,rows)=>`<table>${group}${rows}</table>`;
  const shape=value=>{
   const node=JSON.parse(value.value.structuredJson).document.root.children[0];
   const texts=n=>n.kind==="text"?n.text:n.children.map(texts).join("");
   return {widths:node.properties["breditor/columns"].map(c=>c.width),merges:node.properties["breditor/merges"].length,
    rows:node.children.map(row=>row.children.map(cell=>[cell.properties["breditor/header"],texts(cell)]))};
  };
  const cases=[
   table('<colgroup span="3" width="71" style="width:90px"></colgroup>',"<tr><th colspan=2>A</th><td>B</td></tr><tr><td>C</td><td>D</td><td>E</td></tr>"),
   table('<colgroup width="90"><col><col span="2" width="132" style="width:144px"></colgroup>',"<tr><td>A</td><td>B</td><td>C</td></tr>"),
   table('<colgroup span="3" width="90"></colgroup>',"<tr><td>One</td></tr>"),
   table('<colgroup span="2" style="width:50%"></colgroup>',"<tr><td width=240>A</td><td width=160>B</td></tr>"),
   table('<colgroup span="12" width="90"><col width="130"></colgroup>',"<tr><td>A</td></tr>"),
   table('<colgroup></colgroup>',"<tr><td width=240>A</td></tr>"),
   table('<colgroup span="2"></colgroup>',"<tr><td width=240>A</td><td width=160>B</td></tr>"),
  ];
  const admitted=cases.map(source=>{
   const value=adapter.importHtml(source),exported=adapter.exportHtml(value.value.structuredJson);
   return {shape:shape(value),losses:value.losses,roundTrip:JSON.stringify(shape(adapter.importHtml(exported.value)))===JSON.stringify(shape(value))};
  });
  const refused=[0,129].map(span=>adapter.importHtml(table(`<colgroup span="${span}"></colgroup>`,"<tr><td>A</td></tr>")));
  return {admitted,refused,unchanged:t.core.checkpointJson()===before};
 });
 const cells=(...values)=>values.map(value=>[false,value]);
 const check=(widths,rows,merges=0,losses=[])=>({shape:{widths,merges,rows},losses,roundTrip:true});
 const loss=(code,count)=>({code,count,effect:"loss"});
 expect(result).toEqual({admitted:[
  check([90,90,90],[[[true,"A"],[true,""],[false,"B"]],cells("C","D","E")],1),
  check([90,144,144],[cells("A","B","C")]),
  check([90,90,90],[cells("One","","")],0,[loss("table-geometry",3)]),
  check([120,120],[cells("A","B")],0,[loss("table-width",1)]),
  check([130],[cells("A")],0,[loss("table-geometry",1)]),
  check([240],[cells("A")]),
  check([240,160],[cells("A","B")]),
 ],refused:[{ok:false,error:"malformed-table",losses:[]},{ok:false,error:"resource-limit",losses:[]}],unchanged:true});
});
