import {test,expect} from "@playwright/test";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";
// Opt-in editing aids (docs/EDITING_AIDS.md) over the real Rust/Wasm candidate V4 owner: show blocks, invisible
// characters and the focused-block attribute are painted outside the editable DOM. Caret movement, typing, history
// and Copy must be identical with the aids on and off, and toggling is never an Undo step.
let statics="";
test.beforeAll(async()=>{
 const bundle=await rolldown({input:fileURLToPath(new URL("../../packages/breditor-editor/src/static_document.ts",import.meta.url)),platform:"browser",logLevel:"silent"});
 statics=(await bundle.generate({format:"esm"})).output[0].code;await bundle.close();
});
test.beforeEach(async({page})=>{
 await page.route("**/static.js",route=>route.fulfill({status:200,contentType:"text/javascript; charset=utf-8",body:statics}));
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const api=await import("/rich.js");
  const text=value=>value?[{kind:"text",text:value,formats:[]}]:[];
  const node=(type,id,children=[],extra={})=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":id,...Object.fromEntries(Object.entries(extra).map(([k,v])=>[`breditor/${k}`,v]))},children});
  const paragraph=(id,value)=>node("paragraph",id,text(value));
  const cell=(r,c)=>node("table-cell",`cell-${r}-${c}`,[paragraph(`p-${r}-${c}`,`${r} ${c}`)],{"column-id":c,header:false});
  const row=r=>node("table-row",`row-${r}`,[cell(r,"a"),cell(r,"b")],{"row-id":r});
  const table=node("table","tbl",[row("r1"),row("r2"),paragraph("cap","Table caption")],{"table-id":"t",columns:[{id:"a",width:160},{id:"b",width:160}],merges:[],"retracted-merges":[]});
  const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[
   node("heading","h",text("Show blocks"),{level:2}),
   paragraph("p","one two three\nfour five"),
   node("bullet-list","L",[node("list-item","li",[paragraph("lp","Item one")])]),
   node("blockquote","Q",[paragraph("qp","Quoted words")]),
   node("code-block","code",text("let x = 1;")),
   table,
   node("details","d",[node("details-summary","s",text("More")),paragraph("dp","Body text")],{"details-open":true}),
   node("page-break","pb"),
   paragraph("tail","last line\n"),
  ]};
  const canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:{name:"example/aids",version:4},extensions:[]}));
  const presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson()),binding=profile.descriptor();
  const host=document.createElement("main");host.style.cssText="max-width:720px";document.body.append(host);window.errors=[];
  let aids,controls;
  const mount=options=>{
   controls?.dispose();aids?.dispose();window.editor?.dispose();host.replaceChildren();
   const core=profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(root)}));
   window.editor=api.mountRichEditor(host,{core,inlinePresentation:presentation,toolbar:api.createRichToolbarV4(core,presentation),onError:error=>window.errors.push(String(error))});window.core=core;
   aids=options?api.mountRichEditingAids(window.editor,options):undefined;controls=aids?api.mountRichEditingAidsControls(window.editor.toolbar,aids):undefined;window.aids=aids;
  };
  const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  window.dt={api,mount,frame};mount({});
 });
});
const settle=page=>page.evaluate(()=>window.dt.frame());
const toggle=(page,name)=>page.getByRole("button",{name,exact:true});
const at=page=>page.evaluate(()=>{const s=window.core.view().selection;return (s?.kind==="text"?`${s.anchor.block}:${s.anchor.offset}-${s.focus.block}:${s.focus.offset}`:`${s?.kind}:${s?.block??""}`).replace(/br:[0-9a-f-]{36}:/g,"br:*:");});
/** The settled logical selection: read until two reads a few frames apart agree (input and selection sync are asynchronous). */
const stable=async page=>{let previous=await at(page);for(let round=0;round<20;round++){await page.evaluate(()=>window.dt.frame());await page.waitForTimeout(20);const next=await at(page);if(next===previous)return next;previous=next;}return previous;};

test("show blocks outlines and labels every block kind outside the editable DOM",async({page})=>{
 await page.setViewportSize({width:1000,height:2000});
 const read=()=>page.evaluate(()=>({html:window.editor.surface.innerHTML,doc:window.core.documentJson(),undo:window.core.view().undoDepth}));
 const before=await read();
 await toggle(page,"Show blocks").click();await settle(page);
 await expect(toggle(page,"Show blocks")).toHaveAttribute("aria-pressed","true");
 const result=await page.evaluate(()=>{
  const overlay=document.querySelector("[data-breditor-editing-aids]"),surface=window.editor.surface;
  const labels=Object.fromEntries([...overlay.querySelectorAll(".breditor-aid-label")].map(label=>[label.dataset.aidLabel,label.textContent]));
  // Each box matches its block's border box; each label sits inside it.
  const fits=[...overlay.querySelectorAll(".breditor-aid-block")].every(box=>{const block=surface.querySelector(`[data-rich-block="${CSS.escape(box.dataset.aidBlock)}"]`),a=block.getBoundingClientRect(),b=box.getBoundingClientRect(),near=(x,y)=>Math.abs(x-y)<1.5;
   const label=overlay.querySelector(`.breditor-aid-label[data-aid-label="${CSS.escape(box.dataset.aidBlock)}"]`).getBoundingClientRect();
   return near(a.left,b.left)&&near(a.top,b.top)&&near(a.width,b.width)&&near(a.height,b.height)&&label.left>=b.left-1&&label.right<=b.right+1&&label.top>=b.top-1;});
  const style=getComputedStyle(overlay);
  return {labels,fits,inside:surface.contains(overlay),hidden:overlay.getAttribute("aria-hidden"),pointer:style.pointerEvents,position:style.position};
 });
 expect(result.labels).toMatchObject({h:"Heading 2",p:"Paragraph",L:"Bulleted list",li:"List item",lp:"Paragraph",Q:"Quote",qp:"Paragraph",code:"Code block",tbl:"Table",cap:"Caption",d:"Collapsible section",s:"Section summary",dp:"Paragraph",pb:"Page break",tail:"Paragraph"});
 expect(result).toMatchObject({fits:true,inside:false,hidden:"true",pointer:"none",position:"fixed"});
 expect(await read()).toEqual(before);
 // A click through a label still places the caret in the text below it (the layer is inert to the pointer).
 const label=await page.locator('.breditor-aid-label[data-aid-label="qp"]').boundingBox();
 await page.mouse.click(label.x+label.width/2,label.y+label.height/2);
 await expect.poll(()=>page.evaluate(()=>window.core.view().selection?.focus?.block)).toBe("qp");
 // Toggling never changed content, history or the editable DOM.
 await toggle(page,"Show blocks").click();await settle(page);
 expect(await page.locator("[data-breditor-editing-aids] > *").count()).toBe(0);
 const after=await read();expect({doc:after.doc,undo:after.undo}).toEqual({doc:before.doc,undo:before.undo});
 expect(await page.evaluate(()=>window.errors)).toEqual([]);
});

test("invisible characters sit on their characters and paragraph ends after the last one",async({page})=>{
 await page.setViewportSize({width:1000,height:2000});
 await toggle(page,"Show invisible characters").click();await settle(page);
 const result=await page.evaluate(()=>{
  const overlay=document.querySelector("[data-breditor-editing-aids]"),surface=window.editor.surface,marks=[...overlay.querySelectorAll(".breditor-aid-char")];
  const kinds={};for(const mark of marks)kinds[mark.dataset.aidKind]=(kinds[mark.dataset.aidKind]??0)+1;
  const block=surface.querySelector('[data-rich-text="p"]'),textNode=block.firstChild,range=document.createRange();
  const charRect=index=>{range.setStart(textNode,index);range.setEnd(textNode,index+1);return [...range.getClientRects()].find(rect=>rect.height>0);};
  const center=rect=>({x:rect.left+rect.width/2,y:rect.top+rect.height/2});
  // "one two three\nfour five": the first space is index 3, the NBSP index 7.
  const space=charRect(3),nbsp=charRect(7);
  const hit=(rect,kind)=>marks.some(mark=>{if(mark.dataset.aidKind!==kind)return false;const m=center(mark.getBoundingClientRect()),c=center(rect);return Math.abs(m.x-c.x)<1.5&&Math.abs(m.y-c.y)<1.5;});
  // The paragraph mark of "qp" starts at the right edge of its last character.
  const qp=surface.querySelector('[data-rich-text="qp"]').firstChild;range.setStart(qp,qp.length-1);range.setEnd(qp,qp.length);const last=range.getBoundingClientRect();
  const qpEnd=marks.some(mark=>mark.dataset.aidKind==="blockEnd"&&Math.abs(mark.getBoundingClientRect().left-last.right)<1.5&&Math.abs(mark.getBoundingClientRect().top-last.top)<1.5);
  // The trailing hard break of "tail" puts the paragraph mark on the empty last line.
  const tail=surface.querySelector('[data-rich-text="tail"] [data-rich-trailing-break]').getBoundingClientRect();
  const tailEnd=marks.some(mark=>mark.dataset.aidKind==="blockEnd"&&Math.abs(mark.getBoundingClientRect().top-tail.top)<2);
  const text=["space","nbsp","hardBreak","blockEnd"].map(kind=>marks.find(mark=>mark.dataset.aidKind===kind)?.textContent);
  return {kinds,space:hit(space,"space"),nbsp:hit(nbsp,"nbsp"),qpEnd,tailEnd,text,textInSurface:surface.textContent.includes("¶")||surface.textContent.includes("·")};
 });
 // Text blocks: h p lp qp code p-r1-a p-r1-b p-r2-a p-r2-b cap s dp tail = 13 paragraph marks.
 expect(result.kinds.blockEnd).toBe(13);
 expect(result.kinds.hardBreak).toBe(2);expect(result.kinds.nbsp).toBe(1);
 // Spaces: "Show blocks" 1, "one two…four five" 2, "Item one" 1, "Quoted words" 1, "let x = 1;" 3, four cells 4, "Table caption" 1, "Body text" 1, "last line" 1.
 expect(result.kinds.space).toBe(15);
 expect(result).toMatchObject({space:true,nbsp:true,qpEnd:true,tailEnd:true,text:["·","°","↵","¶"],textInSurface:false});
});

/** One scripted session of real keyboard caret movement, selection, typing, Enter and Backspace. */
async function session(page){
 await page.locator('[data-rich-text="p"]').click();
 await page.evaluate(()=>window.editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"p",offset:"0",affinity:"after"},focus:{block:"p",offset:"0",affinity:"after"}}}));
 const trace=[];const step=async(action,value)=>{if(action==="press")await page.keyboard.press(value);else await page.keyboard.type(value);trace.push(await stable(page));};
 for(const key of ["ArrowRight","ArrowRight","ArrowRight","ArrowRight","End","ArrowLeft","ArrowDown","ArrowUp","Home","Shift+ArrowRight","Shift+ArrowRight"])await step("press",key);
 await step("type","XY ");await step("press","ArrowRight");await step("type"," z");
 await step("press","Enter");await step("type","new words");await step("press","Backspace");await step("press","Shift+Enter");await step("type","q");
 await page.locator('[data-rich-text="qp"]').click({position:{x:4,y:4}});trace.push(await stable(page));
 await step("press","End");await step("type"," more");await step("press","ArrowDown");await step("press","ArrowDown");
 const state=await page.evaluate(()=>({document:JSON.parse(window.core.documentJson().replace(/br:[0-9a-f-]{36}:/g,"br:*:")).root,undo:window.core.view().undoDepth,errors:window.errors}));
 await page.keyboard.press(process.platform==="darwin"?"Meta+z":"Control+z");
 const undone=await page.evaluate(()=>({document:JSON.parse(window.core.documentJson().replace(/br:[0-9a-f-]{36}:/g,"br:*:")).root,undo:window.core.view().undoDepth}));
 return {trace,state,undone};
}

test("caret movement, typing, history and Copy are identical with the aids on and off",async({page})=>{
 await page.evaluate(()=>window.dt.mount(undefined));
 const plain=await session(page);
 await page.evaluate(()=>window.dt.mount({showBlocks:true,invisibles:true,focus:true}));await settle(page);
 expect(await page.locator("[data-breditor-editing-aids] .breditor-aid-char").count()).toBeGreaterThan(0);
 const aided=await session(page);
 expect(aided).toEqual(plain);
 expect(plain.state.errors).toEqual([]);
 // Copy of the same selection carries byte-identical flavors.
 const copy=()=>page.evaluate(()=>{
  window.editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"qp",offset:"0",affinity:"after"},focus:{block:"qp",offset:"6",affinity:"after"}}});
  const data=new DataTransfer(),event=new ClipboardEvent("copy",{bubbles:true,cancelable:true,clipboardData:data});window.editor.surface.dispatchEvent(event);
  const source=event.clipboardData??data;return Object.fromEntries(source.types.map(type=>[type,source.getData(type)]));
 });
 await page.evaluate(()=>window.dt.mount({showBlocks:true,invisibles:true,focus:true}));await settle(page);const on=await copy();
 await page.evaluate(()=>window.dt.mount(undefined));const off=await copy();
 expect(on).toEqual(off);expect(Object.keys(on).length).toBeGreaterThan(0);
});

test("keyboard shortcuts and toolbar toggles are not edits and not Undo steps",async({page})=>{
 await page.locator('[data-rich-text="p"]').click();
 await page.keyboard.type("ab");
 const before=await page.evaluate(()=>({doc:window.core.documentJson(),undo:window.core.view().undoDepth,selection:JSON.stringify(window.core.view().selection)}));
 await page.keyboard.press("Control+Alt+Shift+KeyB");await page.keyboard.press("Control+Alt+Shift+KeyP");await settle(page);
 expect(await page.evaluate(()=>window.aids.state())).toEqual({showBlocks:true,invisibles:true,focus:false,minimap:false,disposed:false});
 await expect(toggle(page,"Show blocks")).toHaveAttribute("aria-pressed","true");
 await toggle(page,"Show invisible characters").click();
 expect(await page.evaluate(()=>window.aids.state().invisibles)).toBe(false);
 expect(await page.evaluate(()=>({doc:window.core.documentJson(),undo:window.core.view().undoDepth,selection:JSON.stringify(window.core.view().selection)}))).toEqual(before);
 // Typing continues in the same group and one Undo removes only the typed text.
 await page.keyboard.type("c");
 await page.keyboard.press(process.platform==="darwin"?"Meta+z":"Control+z");
 expect(await page.evaluate(()=>JSON.parse(window.core.documentJson()).root.children[1].children[0].text.startsWith("one"))).toBe(true);
 expect(await page.evaluate(()=>window.errors)).toEqual([]);
});

test("the focused block carries an attribute only, following the caret",async({page})=>{
 await page.evaluate(()=>window.dt.mount({focus:true}));
 const text=await page.evaluate(()=>window.editor.surface.textContent);
 await page.locator('[data-rich-text="lp"]').click();
 await expect(page.locator("[data-breditor-focused]")).toHaveAttribute("data-rich-block","lp");
 await page.locator('[data-rich-text="dp"]').click();
 await expect(page.locator("[data-breditor-focused]")).toHaveAttribute("data-rich-block","dp");
 await page.keyboard.type("!");
 await expect(page.locator("[data-breditor-focused]")).toHaveCount(1);
 expect(await page.evaluate(()=>window.editor.surface.textContent.replace("!",""))).toBe(text);
 await page.evaluate(()=>window.aids.dispose());
 await expect(page.locator("[data-breditor-focused]")).toHaveCount(0);
});

test("only the visible part of the surface is painted and scrolling repaints",async({page})=>{
 await page.setViewportSize({width:1000,height:300});
 await page.evaluate(()=>window.dt.mount({showBlocks:true,invisibles:true}));
 await page.evaluate(()=>window.editor.surface.querySelector('[data-rich-block="h"]').scrollIntoView({block:"start"}));await settle(page);
 const labels=()=>page.evaluate(()=>[...document.querySelectorAll(".breditor-aid-label")].map(label=>label.dataset.aidLabel));
 expect(await labels()).toContain("h");expect(await labels()).not.toContain("tail");
 await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await settle(page);
 expect(await labels()).toContain("tail");expect(await labels()).not.toContain("h");
 // Every painted marker stays inside the viewport.
 expect(await page.evaluate(()=>[...document.querySelectorAll("[data-breditor-editing-aids] > *")].every(node=>{const r=node.getBoundingClientRect();return r.bottom>=0&&r.top<=innerHeight;}))).toBe(true);
});

/** A fixed 120×(viewport) sidebar outside the editor that hosts the minimap. */
const mountMinimap=(page,extra={})=>page.evaluate(extra=>{
 document.querySelector("#minimap-host")?.remove();
 const aside=document.createElement("aside");aside.id="minimap-host";aside.style.cssText="position:fixed;top:0;right:0;width:120px;height:100vh;background:#fafafa";document.body.append(aside);
 window.dt.mount({minimap:{container:aside},...extra});
},extra);

test("the minimap is inert: typing, caret, history, Copy and static output are unchanged",async({page})=>{
 await page.setViewportSize({width:1000,height:400});
 await page.evaluate(()=>window.dt.mount(undefined));
 const plain=await session(page);
 await mountMinimap(page);await settle(page);
 await expect.poll(()=>page.locator("[data-breditor-minimap] .breditor-minimap-block").count()).toBeGreaterThan(10);
 const aided=await session(page);
 expect(aided).toEqual(plain);expect(plain.state.errors).toEqual([]);
 const read=()=>page.evaluate(async()=>{
  const {renderStaticDocument}=await import("/static.js");
  window.editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"qp",offset:"0",affinity:"after"},focus:{block:"qp",offset:"6",affinity:"after"}}});
  const data=new DataTransfer(),event=new ClipboardEvent("copy",{bubbles:true,cancelable:true,clipboardData:data});window.editor.surface.dispatchEvent(event);
  const source=event.clipboardData??data;
  return {copy:Object.fromEntries(source.types.map(type=>[type,source.getData(type)])),static:renderStaticDocument(window.core.documentJson(),{fragment:true}),html:window.editor.surface.innerHTML.replace(/ data-breditor-focused=""/g,""),undo:window.core.view().undoDepth};
 });
 await mountMinimap(page);await settle(page);const on=await read();
 await page.evaluate(()=>window.dt.mount(undefined));const off=await read();
 expect(on).toEqual(off);expect(Object.keys(on.copy).length).toBeGreaterThan(0);expect(on.static).not.toContain("minimap");
 // Nothing of the minimap is exposed: aria-hidden, no text, ids, focus stops or editable content, outside the surface.
 await mountMinimap(page);await settle(page);
 const exposed=await page.evaluate(()=>{const root=document.querySelector("[data-breditor-minimap]");return {hidden:root.getAttribute("aria-hidden"),text:root.textContent,interactive:root.querySelectorAll("[id],[tabindex],[contenteditable],a,button,input").length,inside:window.editor.surface.contains(root)};});
 expect(exposed).toEqual({hidden:"true",text:"",interactive:0,inside:false});
 expect(await page.locator("[data-breditor-minimap]").ariaSnapshot()).toBe("");
});

test("the minimap indicator tracks scrolling and click or drag scrolls the editor only",async({page})=>{
 await page.setViewportSize({width:1000,height:300});
 await mountMinimap(page);
 await page.locator('[data-rich-text="p"]').click();
 const selection=()=>page.evaluate(()=>JSON.stringify(window.core.view().selection));
 const before={selection:await selection(),doc:await page.evaluate(()=>window.core.documentJson()),undo:await page.evaluate(()=>window.core.view().undoDepth)};
 await page.evaluate(()=>window.scrollTo(0,0));await settle(page);
 const view=()=>page.evaluate(()=>{const indicator=document.querySelector(".breditor-minimap-viewport"),surface=window.editor.surface.getBoundingClientRect();
  return {top:Number(indicator.dataset.viewTop),bottom:Number(indicator.dataset.viewBottom),expectedTop:Math.max(0,-surface.top),expectedBottom:Math.min(surface.height,innerHeight-surface.top),scrollY,box:indicator.getBoundingClientRect().toJSON(),map:document.querySelector("[data-breditor-minimap]").getBoundingClientRect().toJSON()};});
 const near=(a,b)=>Math.abs(a-b)<=1.5;
 let v=await view();expect(near(v.top,v.expectedTop)&&near(v.bottom,v.expectedBottom)).toBe(true);
 // The page scrolls; the indicator follows on the next frame.
 await page.evaluate(()=>window.scrollTo(0,250));await settle(page);
 v=await view();expect(v.scrollY).toBe(250);expect(near(v.top,v.expectedTop)&&near(v.bottom,v.expectedBottom)).toBe(true);
 // Click near the bottom of the overview: the viewport moves down there.
 const content=await page.locator(".breditor-minimap-content").boundingBox();
 await page.mouse.click(content.x+content.width/2,content.y+content.height-2);await settle(page);
 const clicked=await view();expect(clicked.scrollY).toBeGreaterThan(250);expect(near(clicked.top,clicked.expectedTop)).toBe(true);
 // Drag the indicator back to the top.
 await page.mouse.move(clicked.box.x+clicked.box.width/2,clicked.box.y+clicked.box.height/2);await page.mouse.down();
 await page.mouse.move(clicked.box.x+clicked.box.width/2,clicked.map.y-50,{steps:5});await page.mouse.up();await settle(page);
 v=await view();expect(v.scrollY).toBeLessThan(clicked.scrollY);expect(v.top).toBe(0);
 // Focus, selection, document and history are untouched by minimap use.
 expect(await page.evaluate(()=>window.editor.surface.contains(document.activeElement)||document.activeElement===window.editor.surface)).toBe(true);
 expect({selection:await selection(),doc:await page.evaluate(()=>window.core.documentJson()),undo:await page.evaluate(()=>window.core.view().undoDepth)}).toEqual(before);
 // Local edits rebuild the overview: a new paragraph adds a box.
 const boxes=()=>page.locator("[data-breditor-minimap] .breditor-minimap-block").count();
 const count=await boxes();
 await page.locator('[data-rich-text="p"]').click();await page.keyboard.press("End");await page.keyboard.press("Enter");await page.keyboard.type("added");
 await expect.poll(boxes).toBe(count+1);
 // A scrolling surface is detected as the scroll container.
 await page.evaluate(()=>{window.editor.surface.style.maxHeight="150px";window.editor.surface.style.overflowY="auto";window.scrollTo(0,0);});
 await page.evaluate(()=>window.aids.refresh());await page.waitForTimeout(150);await settle(page);
 await page.evaluate(()=>window.editor.surface.scrollTop=200);await settle(page);
 await expect.poll(()=>page.evaluate(()=>Number(document.querySelector(".breditor-minimap-viewport").dataset.viewTop))).toBe(200);
 const inner=await page.locator(".breditor-minimap-content").boundingBox();
 await page.mouse.click(inner.x+inner.width/2,inner.y+2);
 expect(await page.evaluate(()=>window.editor.surface.scrollTop)).toBe(0);
 await page.evaluate(()=>window.aids.dispose());
 await expect(page.locator("[data-breditor-minimap]")).toHaveCount(0);
 expect(await page.evaluate(()=>window.errors)).toEqual([]);
});
