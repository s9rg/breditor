import {test,expect} from "@playwright/test";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";
// Explicit candidate rich V4 (bootstrap V9) over the actual Rust/Wasm owner: mention entities and the @ menu.
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
  const bootstrap=(formatVersion,version)=>JSON.stringify({format:"breditor/profile-bootstrap",formatVersion,schema:{name:"example/mention",version},extensions:[]});
  const paragraph=(id,text)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":id},children:text?[{kind:"text",text,formats:[]}]:[]});
  const root=()=>({kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[paragraph("p","Hello "),paragraph("q","Second")]});
  const open=profile=>{const binding=profile.descriptor();return profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:root()}));};
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,bootstrap(9,4)),presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson());
  const core=open(profile),host=document.createElement("main"),errors=[];document.body.append(host);
  const editor=api.mountRichEditor(host,{core,inlinePresentation:presentation,toolbar:api.createRichToolbarV4(core,presentation),onError:error=>errors.push(String(error))});
  const people=[{kind:"user",id:"u-1",label:"Ann Lee",description:"ann@example.com"},{kind:"user",id:"u-2",label:"Andrew"},{kind:"page",id:"p-1",label:"Roadmap"}];
  const executions=[];
  const mentions=api.mountRichMentions(editor,{core,items:(query,request)=>new Promise(resolve=>setTimeout(()=>{if(!request.signal.aborted)resolve(people.filter(p=>p.label.toLowerCase().includes(query.toLowerCase())));},5)),onExecute:e=>executions.push(e),onError:error=>errors.push(String(error))});
  const select=(block,start,end=start)=>({kind:"setSelection",selection:{kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}}});
  const runs=(block="p")=>JSON.parse(core.documentJson()).root.children.find(n=>n.properties["breditor/block-id"]===block).children;
  const caret=()=>{const s=core.view().selection;return s?.kind==="text"?[s.anchor.block,s.anchor.offset,s.focus.offset]:null;};
  const clipboardEvent=(type,source=new DataTransfer())=>{
   const event=new ClipboardEvent(type,{bubbles:true,cancelable:true,clipboardData:source});
   if(event.clipboardData!==source)for(const flavor of source.types)event.clipboardData.setData(flavor,source.getData(flavor));
   editor.surface.dispatchEvent(event);return event;
  };
  window.m={api,bootstrap,open,profile,core,editor,host,errors,select,runs,caret,clipboardEvent,createRichInterchange,mentions,executions};
 });
});
const ann={type:"breditor/mention",properties:{"breditor/mention-id":"u-1","breditor/mention-kind":"user","breditor/mention-label":"Ann Lee"}};
const mention=text=>({kind:"text",text,formats:[ann]});
const plain=text=>({kind:"text",text,formats:[]});
/** Put the caret at the end of `p` through the editor (macOS Firefox/WebKit `End`/`Home` are not line keys). */
async function caretAtEnd(page){await page.evaluate(()=>{const t=window.m;t.editor.execute(t.select("p",6));t.editor.focus();});}

test("V4 reports mentions while V3 stays exact and refuses them",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.m,v3p=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,4));
  try{const old=t.open(v3p),before=old.checkpointJson();let refused=false;
   try{old.execute({kind:"insertMention",data:{selection:{kind:"text",anchor:{block:"p",offset:"0",affinity:"after"},focus:{block:"p",offset:"0",affinity:"after"}},mention:{kind:"user",id:"u-1",label:"Ann Lee"}}});}catch{refused=true;}
   let mount=false;try{t.api.mountRichMentions(t.editor,{core:old,items:[]});}catch{mount=true;}
   const out={v4:t.profile.descriptor().mentionVersion,v3:v3p.descriptor().mentionVersion??null,catalog:[t.profile.inlineCatalogJson().includes('"breditor/mention"'),v3p.inlineCatalogJson().includes('"breditor/mention"')],refused,unchanged:old.checkpointJson()===before,supports:[old.supportsMentions(),t.core.supportsMentions()],mount};old.dispose();return out;}finally{v3p.dispose();}});
 expect(result).toEqual({v4:1,v3:null,catalog:[true,false],refused:true,unchanged:true,supports:[false,true],mount:true});
});

test("typing @ and a query opens the async menu; choosing inserts a chip in one Undo step",async({page})=>{
 await caretAtEnd(page);
 await page.keyboard.type("@an");
 const menu=page.locator("[data-breditor-mention]");
 await expect(menu).toBeVisible();
 await expect(menu.locator("[role=option]")).toHaveText(["Ann Lee ann@example.com","Andrew"]);
 await expect(menu.locator("[role=listbox]")).toHaveAttribute("aria-label","Mentions");
 expect(await page.evaluate(()=>[window.m.editor.surface.getAttribute("aria-expanded"),window.m.editor.surface.getAttribute("aria-autocomplete")])).toEqual(["true","list"]);
 // The editing surface keeps focus: the menu never takes it.
 expect(await page.evaluate(()=>document.activeElement===window.m.editor.surface)).toBe(true);
 const before=await page.evaluate(()=>({runs:window.m.runs(),undo:window.m.core.view().undoDepth}));
 expect(before.runs).toEqual([plain("Hello @an")]);
 await page.keyboard.press("Enter");
 await expect(menu).toBeHidden();
 const chip=page.locator('[data-rich-text="p"] .breditor-mention');
 await expect(chip).toHaveText("@Ann Lee");
 await expect(chip).toHaveAttribute("contenteditable","false");
 await expect(chip).toHaveAttribute("data-mention-kind","user");
 await expect(chip).toHaveAttribute("data-mention-id","u-1");
 const inserted=await page.evaluate(()=>({runs:window.m.runs(),caret:window.m.caret(),undo:window.m.core.view().undoDepth,executions:window.m.executions.length,errors:window.m.errors}));
 expect(inserted).toEqual({runs:[plain("Hello "),mention("@Ann Lee"),plain(" ")],caret:["p","15","15"],undo:before.undo+1,executions:1,errors:[]});
 // One Undo restores the typed trigger exactly; Redo brings the mention back.
 const history=await page.evaluate(()=>{const t=window.m;t.editor.execute({kind:"undo"});const undone={runs:t.runs(),caret:t.caret()};t.editor.execute({kind:"redo"});return {undone,redone:t.runs()};});
 expect(history.undone).toEqual({runs:[plain("Hello @an")],caret:["p","9","9"]});
 expect(history.redone).toEqual(inserted.runs);
});

test("the caret moves past the chip, typing stays plain and Backspace deletes the mention whole",async({page})=>{
 await caretAtEnd(page);
 await page.keyboard.type("@roa");
 await expect(page.locator("[data-breditor-mention] [role=option]")).toHaveText(["Roadmap"]);
 await page.keyboard.press("Enter");
 await expect(page.locator(".breditor-mention")).toHaveText("@Roadmap");
 await page.keyboard.type("x");
 const roadmap={type:"breditor/mention",properties:{"breditor/mention-id":"p-1","breditor/mention-kind":"page","breditor/mention-label":"Roadmap"}};
 expect(await page.evaluate(()=>window.m.runs())).toEqual([plain("Hello "),{kind:"text",text:"@Roadmap",formats:[roadmap]},plain(" x")]);
 await page.keyboard.press("Backspace");await page.keyboard.press("Backspace");
 await expect.poll(()=>page.evaluate(()=>window.m.runs().length)).toBe(2);
 await page.keyboard.press("Backspace");
 await expect(page.locator(".breditor-mention")).toHaveCount(0);
 const after=await page.evaluate(()=>({runs:window.m.runs(),caret:window.m.caret(),errors:window.m.errors}));
 expect(after).toEqual({runs:[plain("Hello ")],caret:["p","6","6"],errors:[]});
 // A caret placed inside the chip is snapped out of it by the native owner.
 const snapped=await page.evaluate(()=>{const t=window.m;t.editor.execute({kind:"undo"});t.editor.execute(t.select("p",9));return t.caret();});
 expect(snapped).toEqual(["p","6","6"]);
});

test("native copy and paste keep the exact mention; plain text gets @label; V3 refuses the record",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.m;
  t.editor.execute({kind:"insertMention",data:{selection:{kind:"text",anchor:{block:"p",offset:"6",affinity:"after"},focus:{block:"p",offset:"6",affinity:"after"}},mention:{kind:"user",id:"u-1",label:"Ann Lee"}}});
  // A partial copy range snaps outward to the whole mention.
  t.editor.execute(t.select("p",3,10));const transfer=t.clipboardEvent("copy").clipboardData;
  const text=transfer.getData("text/plain");
  t.editor.execute(t.select("q",6));const depth=t.core.view().undoDepth;t.clipboardEvent("paste",transfer);
  const raw=JSON.stringify({kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"breditor-clipboard"},children:[{kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"x"},children:[{kind:"text",text:"@Ann Lee",formats:[{type:"breditor/mention",properties:{"breditor/mention-id":"u-1","breditor/mention-kind":"user","breditor/mention-label":"Ann Lee"}}]}]}]});
  const v3p=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,4)),old=t.open(v3p);v3p.dispose();
  let v3refused=false;try{old.admitClipboardRoot("flow",raw);}catch{v3refused=true;}old.dispose();
  return {text,q:t.runs("q"),delta:t.core.view().undoDepth-depth,chips:t.host.querySelectorAll('[data-rich-text="q"] .breditor-mention').length,v3refused,errors:t.errors};
 });
 expect(result).toEqual({text:"lo @Ann Lee",q:[plain("Secondlo "),mention("@Ann Lee")],delta:1,chips:1,v3refused:true,errors:[]});
});

test("interchange maps the mention span for the V4 owner only",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.m,html='<p>Hi <span class="breditor-mention" data-mention-kind="user" data-mention-id="u-1">@Ann Lee</span></p>';
  const kinds=r=>{if(!r.ok)return r.error;const out=[];(function walk(n){if(n.kind==="text")out.push([n.text,n.formats.find(f=>f.type==="breditor/mention")?.properties["breditor/mention-id"]??null]);for(const c of n.children??[])walk(c);})(JSON.parse(r.value.structuredJson).document.root);return out;};
  const v4=t.createRichInterchange(t.core).importHtml(html),exported=t.createRichInterchange(t.core).exportHtml(v4.value.structuredJson),markdown=t.createRichInterchange(t.core).exportMarkdown(v4.value.structuredJson);
  const v3p=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,4)),old=t.open(v3p);v3p.dispose();
  try{return {v4:kinds(v4),html:exported.ok&&exported.value,markdown:markdown.ok&&[markdown.value,markdown.losses.map(l=>l.code)],v3:kinds(t.createRichInterchange(old).importHtml(html))};}finally{old.dispose();}
 });
 expect(result.v4).toEqual([["Hi ",null],["@Ann Lee","u-1"]]);
 expect(result.html).toBe('<p style="white-space:pre-wrap">Hi <span class="breditor-mention" data-mention-kind="user" data-mention-id="u-1">@Ann Lee</span></p>');
 expect(result.markdown[1]).toContain("markdown-feature");
 expect(result.v3).toEqual([["Hi @Ann Lee",null]]);
});
