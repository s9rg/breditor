import {test,expect} from "@playwright/test";
const modes=[{name:"durableSdk",path:"/shared-session.html?history=typing",language:1},{name:"sharedV2",path:"/shared-structural.html?history=typing",language:2}];
const paragraph=page=>page.locator('#a [data-rich-text="p"]');
async function ready(page,path){await page.goto(path);await expect(page.locator("#ready")).toHaveText("Ready");await page.evaluate(()=>{window.typingDiagnostic=[];const t=window.sharedV2??window.durableSdk;if(!t)return;const core=t.a.core;for(const name of ["typeUser","deleteUserRange","closeTypingGroup","select"]){const method=core[name].bind(core);core[name]=(...args)=>{const entry={method:name,args,start:performance.now(),before:core.view().revision};window.typingDiagnostic.push(entry);try{return method(...args);}finally{entry.end=performance.now();entry.after=core.view().revision;entry.depth=core.view().undoDepth;}};}});}
async function caret(page,name,block="p",offset=1){await page.evaluate(({name,block,offset})=>{const t=window[name];t.a.select(t.range(block,offset));t.a.focus();},{name,block,offset});}
// Real key delivery can exceed 750ms while this candidate is busy in Rust/toolbar reads.
// Assert the exact declared clock contract, not an assumption about machine speed.
// The real-Wasm probe separately forces <=750/>750 hints and proves actual grouping.
async function burstUnits(page,method,count){return page.evaluate(({method,count})=>{const entries=window.typingDiagnostic.filter(e=>e.method===method).slice(-count),index=method==="typeUser"?1:2;if(entries.length!==count)throw Error("Missing native user-input calls");return entries.reduce((units,e,i)=>units+(i===0||BigInt(e.args[index])-BigInt(entries[i-1].args[index])>750n?1:0),0);},{method,count});}
test.afterEach(async({page},info)=>{
 if(page.isClosed())return;
 const input=await page.evaluate(()=>window.typingDiagnostic).catch(()=>null);
 if(input?.length)await info.attach("shared-typing-input-timing",{body:JSON.stringify(input),contentType:"application/json"});
 if(info.status!==info.expectedStatus){const value=await page.evaluate(()=>{const t=window.sharedV2??window.durableSdk??window.sharedReactSdk;if(!t)return null;const e=t.a??t.ref?.current?.getEditor();return {input:window.typingDiagnostic,errors:t.errors,view:e?.view(),checkpoint:e?.checkpointJson()};}).catch(error=>({diagnosticError:String(error)}));await info.attach("shared-typing-native-journal",{body:JSON.stringify(value),contentType:"application/json"});}
});

for(const mode of modes){
 test(`shared V${mode.language} fully invisible grouped Undo still autosaves a new exact journal`,async({page})=>{
  await ready(page,mode.path);const result=await page.evaluate(async name=>{const t=window[name],a=t.a.core,b=t.b.core;a.select(t.range("caption",1));a.typeUser("A","1");a.typeUser("B","2");await b.receiveFrame(a.updateFrame());b.dispatch({commands:[{kind:"delete_text",data:{block:"caption",offset:1,length:2}}]});await a.receiveFrame(b.updateFrame());
   const before=a.checkpointJson(),document=a.documentJson(),events=[];const stop=a.subscribe(event=>events.push(event));const changed=a.undo();stop();const undoCheckpoint=a.checkpointJson();await t.a.flush();const stored=await new Promise((resolve,reject)=>{const request=indexedDB.open(t.options.database,1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction("journals","readonly"),get=tx.objectStore("journals").get(["room","101"]);tx.oncomplete=()=>{resolve(get.result);db.close();};};});
   a.setReadOnly(true);const checkpoint=a.checkpointJson();let denied;try{a.typeUser("No","1");}catch(error){denied=error.code;}const unchanged=a.checkpointJson()===checkpoint;await t.a.close();await t.b.close();const recovered=await t.openSharedEditor({...t.options,host:window.document.querySelector("#a")});const value={changed,published:events.length,exact:recovered.checkpointJson()===checkpoint,newJournal:undoCheckpoint!==before,undoSaved:stored.checkpointJson===undoCheckpoint,document:recovered.view().documentJson===document,depth:recovered.view().undoDepth,denied,unchanged,policyReset:recovered.view().readOnly!==true,errors:t.errors};await recovered.close();return value;
  },mode.name);expect(result).toEqual({changed:false,published:1,exact:true,newJournal:true,undoSaved:true,document:true,depth:0,denied:"read_only",unchanged:true,policyReset:true,errors:[]});
 });
 test(`shared V${mode.language} trusted typing deletion and exact durable reload preserve grouped future history`,async({page})=>{
  await ready(page,mode.path);await caret(page,mode.name);const original=await page.evaluate(name=>window[name].a.view().documentJson,mode.name);await page.keyboard.type("ABC");await expect(paragraph(page)).toHaveText("aABC🙂b");
  const typed=await burstUnits(page,"typeUser",3);expect(await page.evaluate(name=>{const v=window[name].a.view();return [v.historyGrouping,v.undoDepth,v.historyStepCount];},mode.name)).toEqual(["typing-v1",typed,3]);
  await page.keyboard.press("Backspace");await page.keyboard.press("Backspace");const deleted=await burstUnits(page,"deleteUserRange",2);await expect(paragraph(page)).toHaveText("aA🙂b");expect(await page.evaluate(name=>{const v=window[name].a.view();return [v.undoDepth,v.historyStepCount];},mode.name)).toEqual([typed+deleted,5]);
  for(let i=0;i<deleted;i++)await page.keyboard.press("Control+z");await expect(paragraph(page)).toHaveText("aABC🙂b");await page.evaluate(({name,deleted})=>{for(let i=0;i<deleted;i++)window[name].a.core.redo();},{name:mode.name,deleted});
  const saved=await page.evaluate(async name=>{const e=window[name].a;e.closeTypingGroup();await e.flush();return {checkpoint:e.checkpointJson(),document:e.view().documentJson};},mode.name);expect(JSON.parse(saved.checkpoint).format).toBe("breditor/shared-typing-session");
  await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(name=>{const e=window[name].a;return {checkpoint:e.checkpointJson(),document:e.view().documentJson};},mode.name)).toEqual(saved);
  const future=await page.evaluate(({name,count})=>{const t=window[name],e=t.a.core;for(let i=0;i<count;i++)e.undo();const before=e.documentJson();for(let i=0;i<count;i++)e.redo();return {before,after:e.documentJson(),errors:t.errors};},{name:mode.name,count:typed+deleted});expect(future).toEqual({before:original,after:saved.document,errors:[]});
 });

 test(`shared V${mode.language} intent boundaries do not repaint or move focus and pauses separate bursts`,async({page})=>{
  await ready(page,mode.path);await caret(page,mode.name);await page.keyboard.type("AB");const base=await burstUnits(page,"typeUser",2);expect(await page.evaluate(name=>window[name].a.view().undoDepth,mode.name)).toBe(base);
  expect(await page.evaluate(name=>{const t=window[name],e=t.a,node=e.surface.querySelector('[data-rich-text="p"]'),s=getSelection(),anchor=s.anchorNode,offset=s.anchorOffset,revision=e.view().revision;e.surface.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}));let stale=false;try{e.core.typeUser("No","bad",revision);}catch(error){stale=error.code==="stale_observation";}return {stale,same:node===e.surface.querySelector('[data-rich-text="p"]'),focus:document.activeElement===e.surface,caret:anchor===s.anchorNode&&offset===s.anchorOffset};},mode.name)).toEqual({stale:true,same:true,focus:true,caret:true});
  await page.keyboard.type("C");await page.keyboard.press("ArrowLeft");await page.keyboard.press("ArrowRight");await page.keyboard.type("D");await page.waitForTimeout(800);await page.keyboard.type("E");expect(await page.evaluate(name=>window[name].a.view().undoDepth,mode.name)).toBe(base+3);
  await page.evaluate(name=>{const t=window[name],button=document.createElement("button");button.id="outside";document.body.append(button);button.focus();const s=getSelection(),r=document.createRange();r.selectNodeContents(document.querySelector('#b [data-rich-text="caption"]'));s.removeAllRanges();s.addRange(r);document.dispatchEvent(new Event("selectionchange"));t.a.focus();},mode.name);await page.keyboard.type("F");await expect(paragraph(page)).toHaveText("aABCDEF🙂b");
  expect(await page.evaluate(name=>({depth:window[name].a.view().undoDepth,errors:window[name].errors}),mode.name)).toEqual({depth:base+4,errors:[]});
 });

 test(`shared V${mode.language} concurrent text survives selective grouped Undo and saved continuation`,async({page})=>{
  await ready(page,mode.path);await caret(page,mode.name);await page.keyboard.type("AB");const units=await burstUnits(page,"typeUser",2);
  await page.evaluate(async name=>{const t=window[name];t.b.core.dispatch({commands:[{kind:"insert_text",data:{block:"caption",offset:0,text:"Peer "}},{kind:"insert_text",data:{block:"p",offset:1,text:"Foreign"}}]});await t.sync();},mode.name);
  await page.keyboard.type("C");expect(await page.evaluate(name=>window[name].a.view().undoDepth,mode.name)).toBe(units+1);
  const after=await page.evaluate(name=>window[name].a.view().documentJson,mode.name);
  await page.evaluate(({name,count})=>{for(let i=0;i<count;i++)window[name].a.core.undo();},{name:mode.name,count:units+1});await expect(paragraph(page)).toHaveText("aForeign🙂b");await expect(page.locator('#a [data-rich-text="caption"]')).toHaveText("Peer xy🙂");
  await page.evaluate(async({name,count})=>{const e=window[name].a;for(let i=0;i<count;i++)e.core.redo();await e.flush();},{name:mode.name,count:units+1});expect(await page.evaluate(name=>window[name].a.view().documentJson,mode.name)).toBe(after);
  const checkpoint=await page.evaluate(name=>window[name].a.checkpointJson(),mode.name);await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(name=>window[name].a.checkpointJson(),mode.name)).toBe(checkpoint);
  await page.evaluate(({name,count})=>{const e=window[name].a.core;for(let i=0;i<count;i++)e.undo();for(let i=0;i<count;i++)e.redo();},{name:mode.name,count:units+1});expect(await page.evaluate(name=>({document:window[name].a.view().documentJson,errors:window[name].errors}),mode.name)).toEqual({document:after,errors:[]});
 });

 test(`shared V${mode.language} paste composition hard breaks and directional forward deletion stay intentional`,async({page})=>{
  await ready(page,mode.path);await caret(page,mode.name);const original=await page.evaluate(name=>window[name].a.view().documentJson,mode.name);await page.keyboard.type("AB");const typed=await burstUnits(page,"typeUser",2);
  await page.evaluate(name=>{const e=window[name].a,event=new ClipboardEvent("paste",{clipboardData:new DataTransfer(),bubbles:true,cancelable:true});event.clipboardData.setData("text/plain","Paste");e.surface.dispatchEvent(event);},mode.name);await page.keyboard.type("C");
  await page.evaluate(name=>{const e=window[name].a;e.surface.dispatchEvent(new CompositionEvent("compositionstart",{bubbles:true}));e.surface.querySelector('[data-rich-text="p"]').textContent="aABPasteCに🙂b";e.surface.dispatchEvent(new CompositionEvent("compositionend",{bubbles:true}));},mode.name);
  await expect.poll(()=>page.evaluate(name=>window[name].a.view().undoDepth,mode.name)).toBe(typed+3);await page.keyboard.type("D");await expect(paragraph(page)).toHaveText("aABPasteCにD🙂b");expect(await page.evaluate(name=>window[name].a.view().undoDepth,mode.name)).toBe(typed+4);
  await page.evaluate(({name,count})=>{const e=window[name].a.core;for(let i=0;i<count;i++)e.undo();},{name:mode.name,count:typed+4});expect(await page.evaluate(name=>window[name].a.view().documentJson,mode.name)).toBe(original);
  await caret(page,mode.name,"caption",0);await page.keyboard.press("Delete");await page.keyboard.press("Delete");const deleted=await burstUnits(page,"deleteUserRange",2);await expect(page.locator('#a [data-rich-text="caption"]')).toHaveText("🙂");expect(await page.evaluate(name=>window[name].a.view().undoDepth,mode.name)).toBe(deleted);
  for(let i=0;i<deleted;i++)await page.keyboard.press("Control+z");await expect(page.locator('#a [data-rich-text="caption"]')).toHaveText("xy🙂");
  if(mode.language===2){await caret(page,mode.name,"code",0);await page.keyboard.type("let");const first=await burstUnits(page,"typeUser",3);await page.keyboard.press("Enter");await page.keyboard.type("new");const second=await burstUnits(page,"typeUser",3);expect(await page.evaluate(name=>window[name].a.view().undoDepth,mode.name)).toBe(first+1+second);}
  expect(await page.evaluate(name=>window[name].errors,mode.name)).toEqual([]);
 });

 test(`shared V${mode.language} stored grouped family refuses a default open and supports explicit upgrade without losing Redo`,async({page})=>{
  await ready(page,mode.path);await caret(page,mode.name);await page.keyboard.type("AB");
  const result=await page.evaluate(async name=>{const t=window[name];t.a.closeTypingGroup();const checkpoint=t.a.checkpointJson();await t.a.close();const host=document.querySelector("#a"),original=document.createElement("button");host.append(original);let rejected;
   try{await t.openSharedEditor({...t.options,history:"explicit",host});}catch(error){rejected=error.code;}const kept=host.firstChild===original;
   let e=await t.openSharedEditor({...t.options,host}),exact=e.checkpointJson()===checkpoint;await e.close();await t.b.close();
   e=await t.openSharedEditor({...t.options,host,database:"legacy-upgrade",history:"explicit"});e.select(t.range("p",1));e.core.type("Old");e.core.undo();const legacy=e.checkpointJson();await e.close();
   e=await t.openSharedEditor({...t.options,host,database:"legacy-upgrade",history:"typing-v1"});const redo=e.view().redoDepth;e.core.redo();const restored=e.view().documentJson.includes("Old");await e.close();return {rejected,kept,exact,legacy:JSON.parse(legacy).format,redo,restored,errors:t.errors};
  },mode.name);expect(result).toEqual({rejected:"session_history",kept:true,exact:true,legacy:"breditor/rich-replica-journal",redo:1,restored:true,errors:[]});
 });
}

test("shared React typing policy stays with its owner across renders and exact durable reopen",async({page})=>{
 await ready(page,"/shared-react.html?history=typing");await page.evaluate(()=>{const t=window.sharedReactSdk;t.original=t.ref.current.getEditor();t.ref.current.focus();});await page.keyboard.type("ABC");
 const saved=await page.evaluate(async()=>{const t=window.sharedReactSdk;t.ref.current.closeTypingGroup();await t.ref.current.getEditor().flush();return t.ref.current.checkpointJson();});await page.locator("#rerender").click();await expect(page.locator("#render-count")).toHaveText("1");expect(await page.evaluate(()=>window.sharedReactSdk.original===window.sharedReactSdk.ref.current.getEditor())).toBe(true);
 await page.locator("#switch").click();await expect.poll(()=>page.evaluate(()=>window.sharedReactSdk.ready)).toBe(2);expect(await page.evaluate(()=>window.sharedReactSdk.ref.current.checkpointJson())).toBe(saved);
 await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>window.sharedReactSdk.ref.current.checkpointJson())).toBe(saved);expect(await page.evaluate(()=>window.sharedReactSdk.ref.current.getEditor().view().undoDepth)).toBe(1);
 await page.evaluate(()=>window.sharedReactSdk.ref.current.getEditor().core.undo());await expect(page.locator('[data-rich-text="react-p"]')).toHaveText("");await page.evaluate(()=>window.sharedReactSdk.ref.current.getEditor().core.redo());await expect(page.locator('[data-rich-text="react-p"]')).toHaveText("ABC");expect(await page.evaluate(()=>window.sharedReactSdk.errors)).toEqual([]);
});
