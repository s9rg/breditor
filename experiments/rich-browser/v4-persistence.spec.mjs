import {test,expect} from "@playwright/test";
// Frozen rich V4 is persistable locally: a document using all eight slices is saved in the
// fingerprint-bound RichDocumentSessionStore, the page reloads, and the actual Rust/Wasm owner
// restores the exact document, selection and retained Undo/Redo. Other profiles refuse it.
const FROZEN_V4="sha256:7ac98189f850119abd83956f49b82fdbdcc91a77033781fbde090ba931fccc77";

async function ready(page){await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");}
/** Shared page helpers; installed again after every reload. */
async function install(page){
 await page.evaluate(async()=>{
  const api=await import("/rich.js");
  const bootstrap=(formatVersion,name,version)=>JSON.stringify({format:"breditor/profile-bootstrap",formatVersion,schema:{name,version},extensions:[]});
  const v4=()=>api.compileStandardRichProfileV4(window.rich.wasm,bootstrap(9,"breditor-editor/standard",4));
  const host=document.createElement("main"),errors=[];document.body.append(host);
  const mount=(profile,core)=>{const presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson());return api.mountDocumentRichEditor(host,{core,selectionEditing:"document-v1",inlinePresentation:presentation,toolbar:api.createRichToolbarV4(core,presentation),onError:error=>errors.push(String(error))});};
  window.v4p={api,bootstrap,v4,host,errors,mount};
 });
}
const slicesPresent=async page=>{
 await expect(page.locator("ol[reversed]")).toHaveCount(1);
 await expect(page.locator("[data-breditor-rich] [lang='fr-CA']")).toHaveCount(1);
 await expect(page.locator("figure a[href='https://example.com/chart']")).toHaveCount(1);
 await expect(page.locator("details[data-rich-details][open] > summary")).toHaveCount(1);
 await expect(page.locator(".breditor-mention")).toHaveCount(1);
 await expect(page.locator("table[data-rich-table] > caption[data-rich-table-caption]")).toHaveText("Legend");
 await expect(page.locator("[data-rich-page-break]")).toHaveCount(1);
 await expect(page.locator("[data-rich-bookmark='intro']")).toHaveCount(1);
 await expect(page.locator("a[data-rich-internal-link='intro']")).toHaveCount(1);
};

for(const history of ["explicit","typing-v1"]){
 test(`a V4 document with every slice survives reload with exact ${history} Undo/Redo`,async({page})=>{
  const name=`v4-persistence:${history}:${test.info().project.name}:${Date.now()}`;
  await ready(page);await install(page);
  const fingerprint=await page.evaluate(history=>{
   const t=window.v4p,profile=t.v4(),binding=profile.descriptor();
   const text=(value,formats=[])=>({kind:"text",text:value,formats});
   const element=(type,id,children,extra={})=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":id,...extra},children});
   const paragraph=(id,value)=>element("paragraph",id,[text(value)]);
   const item=id=>element("list-item",id,[paragraph(`${id}-text`,id)]);
   const link={type:"breditor-inline/link",properties:{"breditor-inline/href":"#intro","breditor-inline/new-window":false}};
   const cell=element("table-cell","cell",[paragraph("c","Cell")],{"breditor/column-id":"k","breditor/header":false});
   const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[
    paragraph("h","Introduction"),element("paragraph","p",[text("Hi @an, see "),text("intro",[link])]),paragraph("lang","Hello world"),
    element("ordered-list","list",[item("a"),item("b")],{"breditor/start":1}),
    {kind:"element",type:"breditor/image",entityId:null,properties:{"breditor/block-id":"fig","breditor/image-id":"img","breditor/asset-id":"asset","breditor/asset-generation":"gen","breditor/decorative":false,"breditor/alt-text":"Chart"},children:[paragraph("cap","Chart")]},
    element("table","table",[element("table-row","row",[cell],{"breditor/row-id":"r"})],{"breditor/table-id":"t","breditor/columns":[{id:"k",width:160}],"breditor/merges":[],"breditor/retracted-merges":[]}),
    paragraph("s1","Section one"),paragraph("s2","Section two"),paragraph("q","Tail")]};
   const canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
   const core=profile.createDocumentEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(root)}));
   if(history==="typing-v1")core.enableTypingHistory();
   const editor=t.mount(profile,core);profile.dispose();
   const select=(block,start,end=start)=>({kind:"setSelection",selection:{kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}}});
   for(const command of [
    {kind:"setBookmark",data:{block:"h",name:"intro"}},
    {kind:"insertMention",data:{selection:select("p",3,6).selection,mention:{kind:"user",id:"u-1",label:"Ann"}}},
    select("lang",6,11),{kind:"setTextLanguage",data:{language:"fr-CA"}},
    {kind:"setListNumbering",data:{list:"list",style:"lower-roman",reversed:true,start:3}},
    {kind:"setImageLink",data:{image:"img",href:"https://example.com/chart"}},
    {kind:"addTableCaption",data:{table:"t",caption:"tc"}},{kind:"insertPlainText",text:"Legend"},
    select("s2",1),{kind:"wrapDetails",data:{first:"s1",last:"s2",wrapper:"d",summary:"sm",open:true}},
    {kind:"insertPageBreak",data:{position:{parent:{kind:"document"},before:"q"},block:"pb"}},
   ])editor.execute(command,false);
   window.v4p.editor=editor;return binding.schemaFingerprint;
  },history);
  expect(fingerprint).toBe(FROZEN_V4);
  // Real keyboard input in the restored-to-be owner.
  await page.locator('[data-rich-text="q"]').click();await page.keyboard.press("End");await page.keyboard.type("!");
  await expect(page.locator('[data-rich-text="q"]')).toHaveText("Tail!");
  await slicesPresent(page);
  const saved=await page.evaluate(async({name,history})=>{
   const t=window.v4p,editor=t.editor;if(history==="typing-v1")editor.closeTypingGroup();
   const view=()=>editor.view(),states=[view().documentJson],depth=view().undoDepth;
   for(let n=0;n<depth;n++){editor.execute({kind:"undo"},false);states.push(view().documentJson);}
   for(let n=0;n<depth;n++)editor.execute({kind:"redo"},false);
   const store=await t.api.RichDocumentSessionStore.open(name,{richLanguage:4,schemaFingerprint:t.v4().descriptor().schemaFingerprint,history});
   const checkpointJson=editor.checkpointJson();await store.save(checkpointJson);await store.flush();store.close();
   return {checkpointJson,documentJson:view().documentJson,selection:view().selection,depth,states,errors:t.errors};
  },{name,history});
  expect(saved.errors).toEqual([]);
  expect(saved.depth).toBeGreaterThanOrEqual(9);
  expect(saved.documentJson).toBe(saved.states[0]);

  await page.reload();await expect(page.locator("#status")).toHaveText("Ready");await install(page);
  const restored=await page.evaluate(async({name,history})=>{
   const t=window.v4p,store=await t.api.RichDocumentSessionStore.open(name,{richLanguage:4,schemaFingerprint:t.v4().descriptor().schemaFingerprint,history});
   const checkpointJson=await store.load();store.close();
   const profile=t.v4(),core=history==="typing-v1"?profile.restoreDocumentTypingEditor(checkpointJson):profile.restoreDocumentEditor(checkpointJson);
   t.editor=t.mount(profile,core);profile.dispose();const view=t.editor.view();
   return {checkpointJson,exact:t.editor.checkpointJson()===checkpointJson,documentJson:view.documentJson,selection:view.selection,depth:view.undoDepth};
  },{name,history});
  expect(restored.checkpointJson).toBe(saved.checkpointJson);
  expect(restored.exact).toBe(true);
  expect(restored.documentJson).toBe(saved.documentJson);
  expect(restored.selection).toEqual(saved.selection);
  expect(restored.depth).toBe(saved.depth);
  await slicesPresent(page);
  await expect(page.locator('[data-rich-text="q"]')).toHaveText("Tail!");

  // Keyboard Undo/Redo of the typed character, then every retained step through the owner.
  await page.locator('[data-rich-text="q"]').click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator('[data-rich-text="q"]')).toHaveText("Tail");
  expect(await page.evaluate(()=>window.v4p.editor.view().documentJson)).toBe(saved.states[1]);
  await page.keyboard.press("ControlOrMeta+y");
  await expect(page.locator('[data-rich-text="q"]')).toHaveText("Tail!");
  const replay=await page.evaluate(depth=>{
   const editor=window.v4p.editor,undone=[editor.view().documentJson],redone=[];
   for(let n=0;n<depth;n++){editor.execute({kind:"undo"},false);undone.push(editor.view().documentJson);}
   for(let n=0;n<depth;n++){editor.execute({kind:"redo"},false);redone.push(editor.view().documentJson);}
   return {undone,redone,errors:window.v4p.errors};
  },saved.depth);
  expect(replay.errors).toEqual([]);
  expect(replay.undone).toEqual(saved.states);
  expect(replay.redone).toEqual(saved.states.slice(0,-1).reverse());
  await slicesPresent(page);

  // Every other profile, language and fingerprint refuses the saved V4 record.
  const refusals=await page.evaluate(async({name,history,checkpointJson})=>{
   const t=window.v4p,refused=async action=>{try{await action();return false;}catch{return true;}};
   const other=async options=>{const store=await t.api.RichDocumentSessionStore.open(name,options);try{return await refused(()=>store.load());}finally{store.close();}};
   const v3=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,"breditor-editor/standard",3));
   const v3Same=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,"breditor-editor/standard",4));
   const elsewhere=t.api.compileStandardRichProfileV4(window.rich.wasm,t.bootstrap(9,"example/elsewhere",1));
   const restore=profile=>refused(()=>history==="typing-v1"?profile.restoreDocumentTypingEditor(checkpointJson):profile.restoreDocumentEditor(checkpointJson));
   try{return {
    v3Store:await other({richLanguage:3,history}),
    otherFingerprint:await other({richLanguage:4,schemaFingerprint:`sha256:${"0".repeat(64)}`,history}),
    otherHistory:await other({richLanguage:4,schemaFingerprint:t.v4().descriptor().schemaFingerprint,history:history==="typing-v1"?"explicit":"typing-v1"}),
    v3Profile:await restore(v3),v3SameSelector:await restore(v3Same),otherSchema:await restore(elsewhere),
   };}finally{v3.dispose();v3Same.dispose();elsewhere.dispose();}
  },{name,history,checkpointJson:saved.checkpointJson});
  expect(refusals).toEqual({v3Store:true,otherFingerprint:true,otherHistory:true,v3Profile:true,v3SameSelector:true,otherSchema:true});
 });
}
