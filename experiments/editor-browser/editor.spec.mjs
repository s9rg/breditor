import {test,expect} from "@playwright/test";

test("installed local checkpoint families preserve malformed occupied rows and exact native recovery",async({page})=>{
 await ready(page);
 expect(await page.evaluate(()=>window.sdk.verifyLocalCheckpointAdmission())).toEqual({
  freshFamilies:3,malformedReads:12,malformedWrites:11,exactMalformedRows:11,exactNativeReopens:3,
 });
});
// Observe startup rejection metadata without preventing errors or retrying startup.
// Only the closed numeric schema diagnostic is retained, never document content.
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{
  window.richStartupFailures=[];
  addEventListener("unhandledrejection",event=>{
   const cause=event.reason?.cause;
   if(cause?.format==="breditor/rich-integer-domain-failure")window.richStartupFailures.push(cause);
  });
 });
});
test.afterEach(async({page},testInfo)=>{
 if(testInfo.status===testInfo.expectedStatus||page.isClosed())return;
 const failures=await page.evaluate(()=>window.richStartupFailures??[]).catch(()=>[]);
 if(failures.length)await testInfo.attach("rich-startup-numeric-domain",{body:JSON.stringify(failures),contentType:"application/json"});
});
const block=(page,id)=>page.locator(`[data-rich-text="${id}"]`);
async function ready(page,path="/"){await page.goto(path);await expect(page.locator("#ready")).toHaveText("Ready");}
test("installed vanilla entry loads only local Wasm and edits headings nested lists cells and links with exact reload",async({page})=>{
 const requests=[];page.on("request",r=>requests.push(r.url()));await ready(page);await expect(page.getByRole("heading",{name:"SDK heading"})).toHaveCount(1);await expect(page.locator("ul ul")).toHaveText("Nested idea");await expect(page.locator("table")).toHaveCount(1);
 await page.evaluate(()=>{const t=window.sdk;t.editor.execute({kind:"setSelection",selection:t.range("caption",0,1)});t.editor.focus();});await page.keyboard.press("Control+k");await page.locator('[data-rich-field="link-href"]').fill("https://example.test/sdk");await page.locator('[data-rich-field="link-target"]').selectOption("new");await page.locator('[data-rich-field="link-href"]').press("Enter");await expect(page.locator("figcaption a")).toHaveAttribute("href","https://example.test/sdk");
 await page.evaluate(()=>{const t=window.sdk;t.editor.execute({kind:"setSelection",selection:t.range("p",0,1)});});await page.locator('[data-rich-control="text-size"] summary').click();await page.locator('[data-rich-field="text-size-value"]').fill("32");await page.locator('[data-rich-field="text-size-value"]').press("Enter");await expect(block(page,"p").locator(".breditor-inline-text-size")).toHaveCSS("font-size","32px");
 const expected=await page.evaluate(()=>{const t=window.sdk,after=t.editor.view().documentJson;t.editor.execute({kind:"undo"});t.editor.execute({kind:"redo"});if(t.editor.view().documentJson!==after)throw Error("redo differs");t.save();return {document:after,checkpoint:t.editor.checkpointJson()};});await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>({document:window.sdk.editor.view().documentJson,checkpoint:window.sdk.editor.checkpointJson()}))).toEqual(expected);expect(await page.evaluate(()=>window.sdk.errors)).toEqual([]);expect(requests.some(url=>/breditor_shared|assets\/react-/.test(url))).toBe(false);
});
test("installed SDK clipboard uses event payloads and preserves one exact paste history group",async({page})=>{
 await ready(page);const result=await page.evaluate(()=>{const t=window.sdk,clipboard=(kind,source=new DataTransfer())=>{const e=new ClipboardEvent(kind,{bubbles:true,cancelable:true,clipboardData:source});if(e.clipboardData!==source)for(const flavor of source.types)e.clipboardData.setData(flavor,source.getData(flavor));t.editor.surface.dispatchEvent(e);return e.clipboardData;};t.editor.execute({kind:"setSelection",selection:t.range("p",0,1)});const data=clipboard("copy");t.editor.execute({kind:"setSelection",selection:t.range("intro",0)});const before=t.editor.view().documentJson,depth=t.editor.view().undoDepth;clipboard("paste",data);const after=t.editor.view().documentJson,delta=t.editor.view().undoDepth-depth;t.editor.execute({kind:"undo"});const undo=t.editor.view().documentJson===before;t.editor.execute({kind:"redo"});return {plain:data.getData("text/plain"),delta,undo,redo:t.editor.view().documentJson===after,errors:t.errors};});expect(result).toEqual({plain:"a",delta:1,undo:true,redo:true,errors:[]});
});
test("installed SDK asset bytes and exact image history survive a real reload",async({page})=>{
 await ready(page);const file=await page.evaluate(async()=>{const canvas=document.createElement("canvas");canvas.width=3;canvas.height=2;canvas.getContext("2d").fillRect(0,0,3,2);const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));return [...new Uint8Array(await blob.arrayBuffer())];});
 const before=await page.evaluate(()=>({document:window.sdk.editor.view().documentJson,depth:window.sdk.editor.view().undoDepth}));await page.locator("#files").setInputFiles({name:"sdk.png",mimeType:"image/png",buffer:Buffer.from(file)});await expect(page.locator("figure img")).toHaveCount(2);await expect.poll(()=>page.locator('img[alt="sdk.png"]').evaluate(img=>img.naturalWidth)).toBe(3);
 const expected=await page.evaluate(()=>{const t=window.sdk;t.save();return {document:t.editor.view().documentJson,depth:t.editor.view().undoDepth};});expect(expected.depth-before.depth).toBe(1);await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");await expect.poll(()=>page.locator('img[alt="sdk.png"]').evaluate(img=>img.naturalWidth)).toBe(3);expect(await page.evaluate(()=>window.sdk.editor.view().documentJson)).toBe(expected.document);await page.evaluate(()=>window.sdk.editor.execute({kind:"undo"}));expect(await page.evaluate(()=>window.sdk.editor.view().documentJson)).toBe(before.document);expect(await page.evaluate(()=>window.sdk.errors)).toEqual([]);
});
test("installed React entry retains native history through parent renders and retires owners on key change and unmount",async({page})=>{
 await ready(page,"/react.html");await page.evaluate(()=>{const t=window.reactSdk,editor=t.ref.current.getEditor();t.original=editor;editor.execute({kind:"setSelection",selection:t.range("p",1)});editor.focus();});await page.keyboard.type("Q");const before=await page.evaluate(()=>window.reactSdk.ref.current.checkpointJson());await page.locator("#rerender").click();await expect(page.locator("#render-count")).toHaveText("1");expect(await page.evaluate(()=>({same:window.reactSdk.original===window.reactSdk.ref.current.getEditor(),checkpoint:window.reactSdk.ref.current.checkpointJson()}))).toEqual({same:true,checkpoint:before});
 await page.evaluate(()=>window.reactSdk.ref.current.focus());await page.keyboard.type("R");expect(await page.evaluate(()=>window.reactSdk.lastCallback)).toBe(1);await page.locator("#switch").click();await expect.poll(()=>page.evaluate(()=>window.reactSdk.ready)).toBe(2);expect(await page.evaluate(()=>{try{window.reactSdk.original.view();return false;}catch{return true;}})).toBe(true);await expect(block(page,"p")).toHaveText("a🙂b");await page.locator("#toggle").click();await expect(page.locator('[role="textbox"]')).toHaveCount(0);await page.locator("#toggle").click();await expect.poll(()=>page.evaluate(()=>window.reactSdk.ready)).toBe(3);expect(await page.evaluate(()=>window.reactSdk.errors)).toEqual([]);
});
test("installed optional shared entry uses its packaged runtime for offline editing merge selective history and restart",async({page})=>{
 const requests=[];page.on("request",r=>requests.push(r.url()));await ready(page,"/shared.html");await page.evaluate(()=>{const t=window.sharedSdk;t.da.select(t.range("p",0,1));});await page.locator('#a [data-shared-action="italic"]').click();await page.evaluate(()=>{const t=window.sharedSdk;t.db.select(t.range("caption",0));t.db.focus();});await page.keyboard.type("Remote ");
 const result=await page.evaluate(async()=>{const t=window.sharedSdk;await t.sync();const after=t.a.documentJson();t.a.undo();await t.sync();const undo={italic:!!t.da.surface.querySelector("em"),caption:t.da.surface.querySelector("figcaption").textContent};t.a.redo();await t.sync();const redo=t.a.documentJson()===after,saved=t.a.checkpointJson();t.da.dispose();const restored=new t.SharedRichEditor(t.profile.restore("room",saved));try{restored.undo();restored.redo();return {undo,redo,future:restored.documentJson()===after,errors:t.errors};}finally{restored.dispose();t.db.dispose();t.profile.free();}});expect(result).toEqual({undo:{italic:false,caption:"Remote xy🙂"},redo:true,future:true,errors:[]});expect(requests.some(url=>/breditor_shared_bg.*\.wasm/.test(url))).toBe(true);expect(requests.some(url=>/breditor_wasm_bg.*\.wasm/.test(url))).toBe(false);
});
test("failed and synchronously aborted SDK mounts restore original nodes and cannot replace an active owner",async({page})=>{
 await ready(page);const result=await page.evaluate(async()=>{
  const t=window.sdk,host=document.createElement("main"),original=document.createElement("button");host.append(original);document.body.append(host);let rejected=0;
  try{await t.openLocalEditor({host,initial:{kind:"document",documentJson:"{}"}});}catch{rejected++;}const invalidKept=host.firstChild===original;
  const abort=new AbortController();try{await t.openLocalEditor({host,initial:{kind:"document",documentJson:t.editor.view().documentJson},signal:abort.signal,resolveAsset:()=>{abort.abort();return undefined;}});}catch(error){if(error.name==="AbortError")rejected++;}const abortedKept=host.firstChild===original;
  const second=await t.openLocalEditor({host,initial:{kind:"empty",documentId:"retry-document",blockId:"retry-p"}});second.execute({kind:"insertPlainText",text:"Retry works"});const before=second.checkpointJson();try{await t.openLocalEditor({host});}catch{rejected++;}const retained=second.checkpointJson()===before,typed=second.surface.textContent.includes("Retry works");second.dispose();const third=await t.openLocalEditor({host});third.dispose();host.remove();return {rejected,invalidKept,abortedKept,retained,typed,errors:t.errors};
 });expect(result).toEqual({rejected:3,invalidKept:true,abortedKept:true,retained:true,typed:true,errors:[]});
});
test("aborting one startup promptly releases its host without cancelling the runtime shared by a second startup",async({page})=>{
 let release;const gate=new Promise(resolve=>{release=resolve;}),requests=[];
 await page.route(/breditor_wasm_bg.*\.wasm$/,async route=>{requests.push(route.request().url());await gate;await route.continue();});
 try{
  await ready(page,"/startup.html");await page.evaluate(()=>{const t=window.startupSdk;t.abort=new AbortController();t.original=document.querySelector("#first").firstChild;t.first=t.openLocalEditor({host:document.querySelector("#first"),signal:t.abort.signal}).then(()=>"unexpected success",error=>error.name);});await expect.poll(()=>requests.length).toBe(1);
  await page.evaluate(()=>window.startupSdk.abort.abort());expect(await page.evaluate(()=>window.startupSdk.first)).toBe("AbortError");expect(await page.evaluate(()=>document.querySelector("#first").firstChild===window.startupSdk.original)).toBe(true);
  await page.evaluate(()=>{const t=window.startupSdk;t.second=t.openLocalEditor({host:document.querySelector("#second"),initial:{kind:"empty",documentId:"second",blockId:"second-p"}});});release();const result=await page.evaluate(async()=>{const editor=await window.startupSdk.second;editor.execute({kind:"insertPlainText",text:"Shared initialization survives"});const text=editor.surface.textContent;editor.dispose();const reused=await window.startupSdk.openLocalEditor({host:document.querySelector("#first")});reused.dispose();return text;});expect(result).toContain("Shared initialization survives");expect(requests).toHaveLength(1);
 }finally{release();}
});
test("installed native caret typing retains inherited styles through successive keys reload and context changes",async({page})=>{
 await ready(page);await page.evaluate(()=>{const t=window.sdk;t.editor.execute({kind:"setInlineFormat",data:{change:{kind:"remove",format:"breditor/strong"},targets:[{block:"p",start:"1",end:"4"}]}});const selection=t.range("p",1);selection.anchor.affinity=selection.focus.affinity="before";t.editor.execute({kind:"setSelection",selection});t.editor.focus();});
 await page.keyboard.type("XY");await expect(block(page,"p").locator("strong")).toHaveText("aXY");await expect(block(page,"p")).toHaveText("aXY🙂b");const expected=await page.evaluate(()=>{const t=window.sdk,document=t.editor.view().documentJson;t.editor.execute({kind:"undo"});t.editor.execute({kind:"undo"});t.editor.execute({kind:"redo"});t.editor.execute({kind:"redo"});if(t.editor.view().documentJson!==document)throw Error("typing history differs");t.save();return document;});
 await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>window.sdk.editor.view().documentJson)).toBe(expected);await page.evaluate(()=>window.sdk.editor.focus());await page.keyboard.type("Z");await expect(block(page,"p").locator("strong")).toHaveText("aXYZ");
 await page.evaluate(()=>{const t=window.sdk;t.editor.execute({kind:"setSelection",selection:t.range("p",6)});t.editor.focus();});await page.keyboard.type("QW");await expect(block(page,"p")).toHaveText("aXYZ🙂QWb");await expect(block(page,"p").locator("strong")).toHaveText("aXYZ");expect(await page.evaluate(()=>window.sdk.errors)).toEqual([]);
});
test("installed shared caret typing retains inherited styles through offline peer edits selective history and restart",async({page})=>{
 await ready(page,"/shared.html");await page.evaluate(()=>{const t=window.sharedSdk;t.a.dispatch({commands:[{kind:"set_format",data:{block:"p",offset:1,length:3,format:{type:"breditor/strong",properties:{}},enabled:false}}]});const selection=t.range("p",1);selection.anchor.affinity=selection.focus.affinity="before";t.da.select(selection);t.da.focus();});await page.keyboard.type("XY");await expect(page.locator('#a [data-rich-text="p"] strong')).toHaveText("aXY");
 await page.evaluate(()=>{const t=window.sharedSdk;t.db.select(t.range("caption",0));t.db.focus();});await page.keyboard.type("R");
 const result=await page.evaluate(async()=>{const t=window.sharedSdk;await t.sync();const after=t.a.documentJson();t.a.undo();t.a.undo();await t.sync();const undo={text:t.da.surface.querySelector('[data-rich-text="p"]').textContent,caption:t.da.surface.querySelector("figcaption").textContent};t.a.redo();t.a.redo();await t.sync();const exact=t.a.documentJson()===after,saved=t.a.checkpointJson();t.da.dispose();const restored=new t.SharedRichEditor(t.profile.restore("room",saved));try{restored.type("Z");restored.select(t.range("p",6));restored.type("QW");const find=node=>node.properties?.["breditor/block-id"]==="p"?node:(node.children??[]).map(find).find(Boolean),runs=find(JSON.parse(restored.documentJson()).root).children;return {undo,exact,runs,errors:t.errors};}finally{restored.dispose();t.db.dispose();t.profile.free();}});
 expect(result).toEqual({undo:{text:"a🙂b",caption:"Rxy🙂"},exact:true,runs:[{kind:"text",text:"aXYZ",formats:[{type:"breditor/strong",properties:{}}]},{kind:"text",text:"🙂QWb",formats:[]}],errors:[]});
});
