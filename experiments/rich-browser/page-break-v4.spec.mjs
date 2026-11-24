import {test,expect} from "@playwright/test";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";
// Explicit candidate rich V4 (bootstrap V9) over the actual Rust/Wasm owner: page breaks and print presentation.
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
  const bootstrap=(formatVersion,version)=>JSON.stringify({format:"breditor/profile-bootstrap",formatVersion,schema:{name:"example/pages",version},extensions:[]});
  const paragraph=(id,text)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":id},children:text?[{kind:"text",text,formats:[]}]:[]});
  const pageBreak=id=>({kind:"element",type:"breditor/page-break",entityId:null,properties:{"breditor/block-id":id},children:[]});
  const heading=(id,text)=>({kind:"element",type:"breditor/heading",entityId:null,properties:{"breditor/block-id":id,"breditor/level":2},children:[{kind:"text",text,formats:[]}]});
  const cell=(r,c,header)=>({kind:"element",type:"breditor/table-cell",entityId:null,properties:{"breditor/block-id":`cell-${r}-${c}`,"breditor/column-id":c,"breditor/header":header},children:[paragraph(`p-${r}-${c}`,`${r}${c}`)]});
  const row=(r,header=false)=>({kind:"element",type:"breditor/table-row",entityId:null,properties:{"breditor/block-id":`row-${r}`,"breditor/row-id":r},children:[cell(r,"a",header),cell(r,"b",header)]});
  const table={kind:"element",type:"breditor/table",entityId:null,properties:{"breditor/block-id":"tbl","breditor/table-id":"t","breditor/columns":[{id:"a",width:160},{id:"b",width:160}],"breditor/merges":[],"breditor/retracted-merges":[]},children:[row("r1",true),row("r2"),row("r3")]};
  const root=breaks=>({kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[heading("h","Chapter"),paragraph("p","Hello world"),...(breaks?[pageBreak("pb")]:[]),paragraph("q","Second"),table]});
  const canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const envelope=(profile,breaks)=>{const binding=profile.descriptor();return JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(root(breaks))});};
  const open=(profile,breaks)=>profile.createEditor(envelope(profile,breaks));
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,bootstrap(9,4)),presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson());
  const host=document.createElement("main"),errors=[];document.body.append(host);
  let core,editor;
  const mount=breaks=>{editor?.dispose();host.replaceChildren();core=open(profile,breaks);editor=api.mountRichEditor(host,{core,inlinePresentation:presentation,toolbar:api.createRichToolbarV4(core,presentation),onError:error=>errors.push(String(error))});window.dt.core=core;window.dt.editor=editor;};
  const select=(block,start,end=start)=>({kind:"setSelection",selection:{kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}}});
  const kinds=()=>JSON.parse(window.dt.core.documentJson()).root.children.map(n=>n.type.slice(9));
  const clipboardEvent=(type,source=new DataTransfer())=>{
   const event=new ClipboardEvent(type,{bubbles:true,cancelable:true,clipboardData:source});
   if(event.clipboardData!==source)for(const flavor of source.types)event.clipboardData.setData(flavor,source.getData(flavor));
   window.dt.editor.surface.dispatchEvent(event);return event;
  };
  window.dt={api,bootstrap,open,envelope,profile,host,errors,select,kinds,mount,clipboardEvent,createRichInterchange,renderStaticDocument};
  mount(false);
 });
});
const button=page=>page.getByRole("button",{name:"Page break",exact:true});
const at=page=>page.evaluate(()=>{const s=window.dt.core.view().selection;return s.kind==="text"?`${s.focus.block}:${s.focus.offset}`:`${s.kind}:${s.block??""}`;});

test("V4 reports page breaks while V3 stays exact and refuses them",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.dt,v3p=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,4));
  try{const old=t.open(v3p,false),before=old.checkpointJson();let refused=false;
   try{old.execute({kind:"insertPageBreak",data:{position:{parent:{kind:"document"},before:null},block:"x"}});}catch{refused=true;}
   let documentRefused=false;try{t.open(v3p,true).dispose();}catch{documentRefused=true;}
   const out={v4:t.profile.descriptor().pageBreakVersion,v3:v3p.descriptor().pageBreakVersion??null,refused,documentRefused,unchanged:old.checkpointJson()===before,supports:[old.supportsPageBreaks(),t.core.supportsPageBreaks()]};old.dispose();return out;}finally{v3p.dispose();}});
 expect(result).toEqual({v4:1,v3:null,refused:true,documentRefused:true,unchanged:true,supports:[false,true]});
});

test("the toolbar inserts a labelled, non-editable marker after the root block in one Undo step",async({page})=>{
 await page.locator('[data-rich-text="p-r2-a"]').click();
 await expect(button(page)).toBeEnabled();
 await button(page).click();
 // A caret in a table cell inserts after the whole table: page breaks live in the root flow only.
 expect(await page.evaluate(()=>window.dt.kinds())).toEqual(["heading","paragraph","paragraph","table","page-break"]);
 await page.locator('[data-rich-text="p"]').click();
 await page.evaluate(()=>window.dt.editor.execute(window.dt.select("p",5)));
 await button(page).click();
 expect(await page.evaluate(()=>window.dt.kinds())).toEqual(["heading","paragraph","page-break","paragraph","table","page-break"]);
 expect(await at(page)).toBe("p:5");
 const marker=page.locator("[data-rich-page-break]").first();
 // The visible label is `content: attr(aria-label)`; Firefox reports that computed value unresolved.
 const view=await marker.evaluate(element=>{const style=getComputedStyle(element),label=getComputedStyle(element,"::after");return {editable:element.isContentEditable,role:element.getAttribute("role"),label:element.getAttribute("aria-label"),content:['"Page break"',"attr(aria-label)"].includes(label.content),height:element.getBoundingClientRect().height>10,breakAfter:style.breakAfter,previous:element.previousElementSibling?.dataset.richBlock};});
 expect(view).toEqual({editable:false,role:"separator",label:"Page break",content:true,height:true,breakAfter:"page",previous:"p"});
 // Typing continues in the paragraph before the break.
 await page.keyboard.type("!");
 expect(await page.evaluate(()=>JSON.parse(window.dt.core.documentJson()).root.children[1].children[0].text)).toBe("Hello! world");
 const result=await page.evaluate(()=>{const t=window.dt,inserted=t.core.documentJson(),depth=t.core.view().undoDepth;
  t.editor.execute({kind:"undo"});t.editor.execute({kind:"undo"});const one=t.kinds();t.editor.execute({kind:"redo"});
  const restored=t.profile.restoreEditor(t.core.checkpointJson()),same=restored.documentJson()===t.core.documentJson();restored.dispose();
  return {depth,one,redo:t.kinds(),same,inserted:inserted.includes("breditor/page-break"),errors:t.errors};});
 expect(result).toEqual({depth:3,one:["heading","paragraph","paragraph","table","page-break"],redo:["heading","paragraph","page-break","paragraph","table","page-break"],same:true,inserted:true,errors:[]});
});

test("a page break is node-selected by click, a flow-navigation stop and deleted whole",async({page})=>{
 await page.evaluate(()=>window.dt.mount(true));
 await page.locator("[data-rich-page-break]").click();
 expect(await at(page)).toBe("node:pb");
 await expect(page.locator("[data-rich-page-break]")).toHaveAttribute("data-node-selected","");
 await page.evaluate(()=>window.dt.editor.execute(window.dt.select("p",11)));
 await page.locator('[data-rich-text="p"]').click();await page.evaluate(()=>window.dt.editor.execute(window.dt.select("p",11)));
 await page.keyboard.press("Alt+PageDown");expect(await at(page)).toBe("node:pb");
 await page.keyboard.press("Alt+PageDown");expect(await at(page)).toBe("q:0");
 await page.keyboard.press("Alt+PageUp");expect(await at(page)).toBe("node:pb");
 await page.keyboard.press("Delete");
 await expect(page.locator("[data-rich-page-break]")).toHaveCount(0);
 expect(await page.evaluate(()=>({kinds:window.dt.kinds(),undo:window.dt.core.view().undoDepth}))).toEqual({kinds:["heading","paragraph","paragraph","table"],undo:1});
 expect(await at(page)).toBe("q:0");
 await page.evaluate(()=>window.dt.editor.execute({kind:"undo"}));
 await expect(page.locator("[data-rich-page-break]")).toHaveCount(1);
 expect(await page.evaluate(()=>window.dt.errors)).toEqual([]);
});

test("copy/paste keeps page breaks; V3 refuses the record",async({page})=>{
 await page.evaluate(()=>window.dt.mount(true));
 const result=await page.evaluate(()=>{const t=window.dt;
  t.editor.execute({kind:"setSelection",selection:{kind:"node",block:"pb"}});
  const transfer=t.clipboardEvent("copy").clipboardData,record=transfer.getData("application/x-breditor-rich+json");
  t.editor.execute(t.select("q",6));const depth=t.core.view().undoDepth;t.clipboardEvent("paste",transfer);
  const v3p=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,4)),old=t.open(v3p,false);v3p.dispose();
  let v3Refused=false;try{old.validateClipboard(record);}catch{v3Refused=true;}old.dispose();
  const breaks=JSON.parse(t.core.documentJson()).root.children.filter(n=>n.type==="breditor/page-break");
  return {kinds:t.kinds(),distinct:new Set(breaks.map(n=>n.properties["breditor/block-id"])).size,delta:t.core.view().undoDepth-depth,v3Refused,errors:t.errors};});
 // Pasting flow at the end of a paragraph keeps its empty right-hand floor paragraph.
 expect(result).toEqual({kinds:["heading","paragraph","page-break","paragraph","page-break","paragraph","table"],distinct:2,delta:1,v3Refused:true,errors:[]});
});

test("print media: forced breaks, keep-together rules and an approximate preview",async({page})=>{
 await page.evaluate(()=>window.dt.mount(true));
 const read=()=>page.evaluate(()=>{const host=window.dt.host,style=(selector,pseudo)=>getComputedStyle(host.querySelector(selector),pseudo);
  return {pageBreak:style("[data-rich-page-break]").breakAfter,height:host.querySelector("[data-rich-page-break]").getBoundingClientRect().height,label:style("[data-rich-page-break]","::after").content,row:style("tr").breakInside,heading:style("h2").breakAfter,headingInside:style("h2").breakInside,toolbar:style(".breditor-rich-toolbar").display};});
 // Without the opt-in stylesheet, print media keeps the editor chrome and only the inline forced break.
 await page.emulateMedia({media:"print"});
 const plain=await read();
 expect(plain.pageBreak).toBe("page");expect(plain.toolbar).not.toBe("none");
 const layout=await page.evaluate(()=>{const t=window.dt;window.preview=t.api.mountRichPrintPreview(t.editor.surface,{size:"Letter",orientation:"portrait",margin:"narrow"});return window.preview.layout;});
 expect(layout).toEqual({size:"Letter",orientation:"portrait",margin:"narrow",pageWidthMm:215.9,pageHeightMm:279.4,marginMm:12.7,contentWidthMm:190.5,contentHeightMm:254});
 expect(await read()).toEqual({pageBreak:"page",height:0,label:"none",row:"avoid",heading:"avoid",headingInside:"avoid",toolbar:"none"});
 // Screen media shows the preview: printable width plus margin padding, with the marker visible again.
 await page.emulateMedia({media:"screen"});
 const screen=await page.evaluate(()=>{const surface=window.dt.editor.surface,style=getComputedStyle(surface),mm=96/25.4;
  return {width:Math.round(parseFloat(style.width)/mm*10)/10,padding:Math.round(parseFloat(style.paddingTop)/mm*10)/10,guides:style.backgroundImage.includes("repeating-linear-gradient"),description:surface.getAttribute("aria-description"),marker:window.dt.host.querySelector("[data-rich-page-break]").getBoundingClientRect().height>10};});
 expect(screen).toEqual({width:190.5,padding:12.7,guides:true,description:"Print preview: page boundaries are approximate",marker:true});
 // Editing continues while the preview is mounted; disposing restores the surface.
 await page.locator('[data-rich-text="q"]').click();await page.keyboard.type("x");
 const after=await page.evaluate(()=>{window.preview.dispose();const surface=window.dt.editor.surface;return {typed:JSON.stringify(window.dt.core.documentJson()).includes("x"),attribute:surface.hasAttribute("data-breditor-print-preview"),style:document.querySelectorAll("style[data-breditor-print-preview]").length,errors:window.dt.errors};});
 expect(after).toEqual({typed:true,attribute:false,style:0,errors:[]});
});

test("simultaneous screen previews keep their own geometry through update and disposal",async({page})=>{
 const result=await page.evaluate(()=>{
  const t=window.dt,live=t.editor.surface,staticWrapper=document.createElement("section");
  staticWrapper.innerHTML=t.renderStaticDocument(t.envelope(t.profile,true));
  document.body.append(staticWrapper);
  const before=t.core.checkpointJson();
  const read=surface=>{
   const style=getComputedStyle(surface),mm=px=>Math.round(parseFloat(px)*25.4/96*10)/10;
   return {width:mm(style.width),padding:mm(style.paddingTop),guides:mm(style.backgroundSize.split(" ")[1])};
  };
  const livePreview=t.api.mountRichPrintPreview(live,{print:false});
  const staticPreview=t.api.mountRichPrintPreview(staticWrapper,{size:"Letter",orientation:"landscape",margin:"narrow",print:false});
  try{
   const mounted=[read(live),read(staticWrapper)];
   staticPreview.update({size:"Letter",margin:"wide"});
   const updated=[read(live),read(staticWrapper)];
   staticPreview.dispose();
   return {mounted,updated,remaining:read(live),disposed:!staticWrapper.hasAttribute("data-breditor-print-preview"),unchanged:t.core.checkpointJson()===before};
  }finally{livePreview.dispose();staticPreview.dispose();staticWrapper.remove();}
 });
 const a4={width:159.2,padding:25.4,guides:246.2};
 expect(result).toEqual({mounted:[a4,{width:254,padding:12.7,guides:190.5}],
  updated:[a4,{width:139.7,padding:38.1,guides:203.2}],remaining:a4,disposed:true,unchanged:true});
});

test("a print preview inside a closed shadow root applies screen and print styles",async({page})=>{
 await page.evaluate(()=>{
  const t=window.dt,attachment=document.createElement("section"),host=document.createElement("div");
  document.body.append(attachment);attachment.attachShadow({mode:"closed"}).append(host);
  const core=t.open(t.profile,true),editor=t.api.mountRichEditor(host,{core});
  const before=core.checkpointJson(),preview=t.api.mountRichPrintPreview(editor.surface,{size:"Letter",margin:"narrow"});
  window.shadowPrint={attachment,host,core,editor,preview,before};
 });
 const read=()=>page.evaluate(()=>{
  const {core,before,editor,host}=window.shadowPrint,style=getComputedStyle(editor.surface),mm=px=>Math.round(parseFloat(px)*25.4/96*10)/10;
  const marker=host.querySelector("[data-rich-page-break]");
  return {width:mm(style.width),padding:mm(style.paddingTop),guide:style.backgroundImage.includes("repeating-linear-gradient"),marker:marker.getBoundingClientRect().height,
   toolbar:getComputedStyle(editor.toolbar).display,unchanged:core.checkpointJson()===before};
 });
 const screen=await read();
 expect(screen).toMatchObject({width:190.5,padding:12.7,guide:true,toolbar:"flex",unchanged:true});
 expect(screen.marker).toBeGreaterThan(10);
 await page.emulateMedia({media:"print"});
 expect(await read()).toMatchObject({padding:0,guide:false,marker:0,toolbar:"none",unchanged:true});
 const after=await page.evaluate(()=>{
  const {attachment,host,editor,preview}=window.shadowPrint;
  const pageRules=()=>[...document.styleSheets].flatMap(sheet=>[...sheet.cssRules]).filter(rule=>rule.type===CSSRule.PAGE_RULE).map(rule=>{
   const [size,orientation="portrait"]=rule.style.getPropertyValue("size").trim().split(/\s+/);
   return [size.toLowerCase(),orientation,rule.style.margin];
  });
  const initial=pageRules();preview.update({orientation:"landscape",margin:"wide"});const updated=pageRules();
  preview.dispose();const disposed=pageRules(),previewStyles=host.getRootNode().querySelectorAll("style[data-breditor-print-preview]").length;
  editor.dispose();attachment.remove();return {initial,updated,disposed,previewStyles};
 });
 expect(after).toEqual({initial:[["letter","portrait","12.7mm"]],updated:[["a4","landscape","38.1mm"]],disposed:[],previewStyles:0});
});

test("updating a print preview after a DOM move follows the surface and restores its original attributes",async({page})=>{
 const result=await page.evaluate(()=>{
  const t=window.dt;
  t.mount(true);
  const {core,editor,host}=t,surface=editor.surface,before=core.checkpointJson();
  const attachments=[document.createElement("section"),document.createElement("section")];
  document.body.append(...attachments);
  const roots=attachments.map(attachment=>attachment.attachShadow({mode:"closed"}));
  surface.setAttribute("aria-description","Original description");
  surface.setAttribute("data-breditor-print-size","Original size");
  const preview=t.api.mountRichPrintPreview(surface);
  const read=()=>{
   const styles=getComputedStyle(surface),mm=px=>Math.round(parseFloat(px)*25.4/96*10)/10;
   return {width:mm(styles.width),padding:mm(styles.paddingTop),
    styles:[document.head,...roots].map(root=>root.querySelectorAll("style[data-breditor-print-preview]").length),
    pageRules:[...document.styleSheets].flatMap(sheet=>[...sheet.cssRules]).filter(rule=>rule.type===CSSRule.PAGE_RULE).length};
  };
  try{
   const mount=read();
   roots[0].append(host);
   preview.update({size:"Letter",margin:"narrow"});
   const firstShadow=read();
   roots[1].append(host);
   preview.update({orientation:"landscape",margin:"wide"});
   const secondShadow=read();
   document.body.append(host);
   preview.update({margin:"normal"});
   const back=read();
   preview.dispose();
   const {styles,pageRules}=read();
   return {mount,firstShadow,secondShadow,back,styles,pageRules,unchanged:core.checkpointJson()===before,
    previous:[surface.getAttribute("aria-description"),surface.getAttribute("data-breditor-print-size")],
    active:surface.hasAttribute("data-breditor-print-preview")};
  }finally{preview.dispose();for(const attachment of attachments)attachment.remove();}
 });
 expect(result).toEqual({
  mount:{width:159.2,padding:25.4,styles:[1,0,0],pageRules:1},
  firstShadow:{width:190.5,padding:12.7,styles:[0,1,0],pageRules:1},
  secondShadow:{width:220.8,padding:38.1,styles:[0,0,1],pageRules:1},
  back:{width:159.2,padding:25.4,styles:[1,0,0],pageRules:1},
  styles:[0,0,0],pageRules:0,unchanged:true,previous:["Original description","Original size"],active:false,
 });
});

test("a print preview measures numbered flow pages and follows explicit native breaks",async({page})=>{
 const result=await page.evaluate(()=>{
  const t=window.dt;
  t.mount(true);
  const {core,editor}=t,surface=editor.surface,checkpoint=core.checkpointJson();
  const preview=t.api.mountRichPrintPreview(surface,{print:false});
  try{
   const initial=preview.measure();
   const style=getComputedStyle(surface),marker=surface.querySelector("[data-rich-page-break]");
   const expected=marker.getBoundingClientRect().bottom-surface.getBoundingClientRect().top-surface.clientTop-parseFloat(style.paddingTop);
   marker.style.visibility="hidden";
   const hidden=preview.measure();
   marker.style.display="none";
   const omitted=preview.measure();
   marker.style.removeProperty("visibility");marker.style.removeProperty("display");
   surface.querySelector('[data-rich-text="q"]').style.minHeight="1350px";
   const resized=preview.measure();
   preview.update({orientation:"landscape",margin:"wide"});
   const updated=preview.measure();
   const shape=measurement=>({count:measurement.pages.length,height:measurement.contentHeightCssPx,
    pageHeight:measurement.pageHeightCssPx,reasons:measurement.pages.map(p=>p.reason),
    numbered:measurement.pages.every((p,i)=>p.number===i+1&&(i===0||p.topCssPx>measurement.pages[i-1].topCssPx)),
    frozen:Object.isFrozen(measurement)&&Object.isFrozen(measurement.pages)&&measurement.pages.every(Object.isFrozen)});
   preview.dispose();
   let disposed=false;try{preview.measure();}catch(error){disposed=String(error).includes("disposed");}
   return {initial:shape(initial),hidden:shape(hidden),omitted:shape(omitted),resized:shape(resized),updated:shape(updated),expected,
    explicit:initial.pages.find(p=>p.reason==="forced")?.topCssPx,unchanged:core.checkpointJson()===checkpoint,disposed};
  }finally{preview.dispose();}
 });
 expect(result.initial.reasons).toEqual(["start","forced"]);
 expect(result.hidden).toEqual(result.initial);
 expect(result.omitted.reasons).toEqual(["start"]);
 expect(Math.abs(result.explicit-result.expected)).toBeLessThan(1);
 expect(result.resized.height).toBeGreaterThan(result.initial.height+1000);
 expect(result.resized.reasons).toEqual(["start","forced","automatic"]);
 expect(result.updated.pageHeight).toBeLessThan(result.resized.pageHeight);
 expect(result.updated.count).toBeGreaterThan(result.resized.count);
 for(const state of [result.initial,result.resized,result.updated])expect(state).toMatchObject({numbered:true,frozen:true});
 expect(result).toMatchObject({unchanged:true,disposed:true});
});

test("static export embeds print CSS and repeats header rows under print media",async({page})=>{
 await page.emulateMedia({media:"print"});
 const result=await page.evaluate(()=>{const t=window.dt,frame=document.createElement("section");
  frame.innerHTML=t.renderStaticDocument(t.envelope(t.profile,true),{print:{size:"A4",orientation:"landscape"}});document.body.append(frame);
  const style=selector=>getComputedStyle(frame.querySelector(selector));
  const out={thead:style("thead").display,headerCells:frame.querySelectorAll("thead th").length,bodyRows:frame.querySelectorAll("tbody tr").length,pageBreak:style(".breditor-page-break").breakAfter,height:frame.querySelector(".breditor-page-break").getBoundingClientRect().height,row:style("tbody tr").breakInside,heading:style("h2").breakAfter,page:frame.querySelector("style[data-breditor-print]").textContent.startsWith("@page{size:A4 landscape;margin:25.4mm}")};
  frame.remove();return out;});
 expect(result).toEqual({thead:"table-header-group",headerCells:2,bodyRows:2,pageBreak:"page",height:0,row:"avoid",heading:"avoid",page:true});
});

test("interchange maps Word and Google Docs page breaks for the V4 owner only",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.dt;
  const word="<p class=MsoNormal>One<br clear=all style='mso-special-character:line-break;page-break-before:always'>Two</p>",docs='<p>One</p><hr style="page-break-before:always;display:none;"><p>Two</p>';
  const shape=node=>node.kind==="text"?node.text:{type:node.type.slice(9),children:node.children.map(shape)};
  const kinds=r=>r.ok?JSON.parse(r.value.structuredJson).document.root.children.map(shape):r.error;
  const adapter=t.createRichInterchange(t.core),fromWord=adapter.importHtml(word),fromDocs=adapter.importHtml(docs),exported=adapter.exportHtml(fromDocs.value.structuredJson),markdown=adapter.exportMarkdown(fromDocs.value.structuredJson),back=adapter.importMarkdown(markdown.ok?markdown.value:"");
  // Native admission accepts the imported record for the V4 owner.
  const pasted=t.core.validateClipboard(fromWord.value.structuredJson).kind;
  const v3p=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,4)),old=t.open(v3p,false);v3p.dispose();
  try{const v3=t.createRichInterchange(old),v3Word=v3.importHtml(word),v3Docs=v3.importHtml(docs);
   return {word:kinds(fromWord),wordLosses:fromWord.losses,docs:kinds(fromDocs),docsLosses:fromDocs.losses,html:exported.ok?exported.value:exported.error,markdownLosses:markdown.losses.map(l=>l.code),back:kinds(back),pasted,v3Word:kinds(v3Word),v3Docs:kinds(v3Docs),v3DocsLosses:v3Docs.losses.map(l=>[l.code,l.count])};}finally{old.dispose();}
 });
 const split=[{type:"paragraph",children:["One"]},{type:"page-break",children:[]},{type:"paragraph",children:["Two"]}];
 expect(result.word).toEqual(split);expect(result.wordLosses).toEqual([]);
 expect(result.docs).toEqual(split);expect(result.docsLosses).toEqual([]);
 expect(result.html).toBe('<p style="white-space:pre-wrap">One</p><div style="break-after:page;page-break-after:always"></div><p style="white-space:pre-wrap">Two</p>');
 expect(result.markdownLosses).toEqual(["markdown-feature"]);expect(result.back).toEqual(split);
 expect(result.v3Word).toEqual([{type:"paragraph",children:["One\nTwo"]}]);
 expect(result.v3Docs).toEqual([{type:"paragraph",children:["One"]},{type:"paragraph",children:["Two"]}]);expect(result.v3DocsLosses).toEqual([["removed-content",1]]);
 expect(result.pasted).toBe("flow");
});
