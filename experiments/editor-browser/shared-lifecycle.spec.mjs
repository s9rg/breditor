import {test,expect} from "@playwright/test";
async function ready(page,path="/shared-session.html"){await page.goto(path);await expect(page.locator("#ready")).toHaveText("Ready");}

test("installed durable SDK restores exact mixed-content and selective peer history after close and page reload",async({page})=>{
 await ready(page);await page.evaluate(()=>{const t=window.durableSdk;t.a.select(t.range("deep-head",0));t.a.focus();});await page.keyboard.type("Local ");
 await page.evaluate(()=>{const t=window.durableSdk;t.b.select(t.range("caption",0));t.b.focus();});await page.keyboard.type("Peer ");
 const saved=await page.evaluate(async()=>{const t=window.durableSdk;await t.sync();t.a.select(t.range("p",0,1));const after=t.a.view().documentJson;t.a.core.undo();if(!t.a.view().documentJson.includes("Peer "))throw Error("Undo lost peer caption");t.a.core.redo();if(t.a.view().documentJson!==after)throw Error("Selective Redo differs");await t.a.flush();await t.b.flush();const result={checkpoint:t.a.checkpointJson(),document:t.a.view().documentJson};await t.a.close();await t.b.close();return result;});
 await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>({recovered:window.durableSdk.a.recovered,checkpoint:window.durableSdk.a.checkpointJson(),document:window.durableSdk.a.view().documentJson}))).toEqual({recovered:true,...saved});await expect(page.locator("#a ul ul")).toHaveText("Local Nested idea");await expect(page.locator("#a table")).toHaveCount(1);
 const future=await page.evaluate(async()=>{const t=window.durableSdk;t.a.core.undo();const kept=t.a.view().documentJson.includes("Peer ");t.a.core.redo();await t.sync();await t.a.flush();return {kept,exact:t.a.view().documentJson,errors:t.errors};});expect(future).toEqual({kept:true,exact:saved.document,errors:[]});
});

test("installed durable SDK excludes duplicate writers and rolls back a cancelled render without freeing its saved history",async({page})=>{
 await ready(page);const result=await page.evaluate(async()=>{
  const t=window.durableSdk,host=document.createElement("main"),original=document.createElement("button");host.append(original);document.body.append(host);let duplicate;
  try{await t.openSharedEditor({...t.options,database:"different-store",host});}catch(error){duplicate=error.code;}
  const checkpoint=t.a.checkpointJson();await t.a.close();const abort=new AbortController();let cancelled;
  try{await t.openSharedEditor({...t.options,host,signal:abort.signal,resolveAsset:()=>{abort.abort();return undefined;}});}catch(error){cancelled=error.name;}
  const kept=host.firstChild===original,reopened=await t.openSharedEditor({...t.options,host}),exact=reopened.checkpointJson()===checkpoint;await reopened.close();host.remove();return {duplicate,cancelled,kept,exact};
 });expect(result).toEqual({duplicate:"writer_in_use",cancelled:"AbortError",kept:true,exact:true});
});

test("installed durable close seals publications and retains a failed save until exact recovery succeeds",async({page})=>{
 await ready(page);const result=await page.evaluate(async()=>{
  const t=window.durableSdk,put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException("Expected quota failure","QuotaExceededError");};
  let failed=false,mutating,duplicate;let checkpoint;
  try{
   t.a.select(t.range("p",0));t.a.core.type("Unsaved ");checkpoint=t.a.checkpointJson();try{await t.a.close();}catch{failed=true;}
   try{t.a.core.type("Must reject");}catch(error){mutating=error.code;}
   const host=document.createElement("main");try{await t.openSharedEditor({...t.options,host,database:"other-store"});}catch(error){duplicate=error.code;}
  }finally{IDBObjectStore.prototype.put=put;}
  const retained=t.a.checkpointJson()===checkpoint;await t.a.close();const reopened=await t.openSharedEditor({...t.options,host:document.querySelector("#a")});const exact=reopened.checkpointJson()===checkpoint,recovered=reopened.recovered;await reopened.close();return {failed,mutating,duplicate,retained,exact,recovered,surfaces:document.querySelectorAll("#a [role=textbox]").length};
 });expect(result).toEqual({failed:true,mutating:"retired",duplicate:"writer_in_use",retained:true,exact:true,recovered:true,surfaces:0});
});

test("closing a held shared writer rejects queued remote admission and recovery can receive it later",async({page})=>{
 await ready(page);const result=await page.evaluate(async()=>{
  const t=window.durableSdk,release=t.a.core.holdRemotes();t.b.core.dispatch({commands:[{kind:"insert_text",data:{block:"caption",offset:0,text:"Deferred peer "}}]});
  const frame=t.b.core.updateFrame(),pending=t.a.core.receiveFrame(frame).then(()=>"unexpected admission",error=>error.code),checkpoint=t.a.checkpointJson();await t.a.close();release();const reason=await pending;
  const reopened=await t.openSharedEditor({...t.options,host:document.querySelector("#a")}),exact=reopened.checkpointJson()===checkpoint;await reopened.core.receiveFrame(frame);const kept=reopened.view().documentJson.includes("Deferred peer ");await reopened.close();return {reason,exact,kept};
 });expect(result).toEqual({reason:"retired",exact:true,kept:true});
});

test("a real IndexedDB upgrade retains the unsaved retired journal for explicit recovery in a new store",async({page})=>{
 await ready(page);const result=await page.evaluate(async()=>{
  const t=window.durableSdk,put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException("Expected quota failure","QuotaExceededError");};
  t.a.select(t.range("p",0));t.a.core.type("Before upgrade ");try{await t.a.flush();}catch{}
  const checkpoint=t.a.checkpointJson();IDBObjectStore.prototype.put=put;
  const upgraded=await new Promise((resolve,reject)=>{const request=indexedDB.open(t.options.database,2);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});upgraded.close();
  let retired,duplicate;try{t.a.core.type("Must reject");}catch(error){retired=error.code;}
  const host=document.createElement("main");try{await t.openSharedEditor({...t.options,database:"other-db",host});}catch(error){duplicate=error.code;}
  const exact=t.a.checkpointJson()===checkpoint,status=t.a.state().status;await t.a.discardAndClose();
  const restored=await t.openSharedEditor({...t.options,host:document.querySelector("#a"),database:"explicit-upgrade-recovery",initial:{kind:"checkpoint",checkpointJson:checkpoint}}),recovered=restored.checkpointJson()===checkpoint;await restored.close();return {retired,duplicate,exact,status,recovered};
 });expect(result).toEqual({retired:"retired",duplicate:"writer_in_use",exact:true,status:"failed",recovered:true});
});

test("installed shared React owns one durable writer across renders key changes unmount and real reload",async({page})=>{
 const requests=[];page.on("request",request=>requests.push(request.url()));await ready(page,"/shared-react.html");await page.evaluate(()=>{const t=window.sharedReactSdk;t.original=t.ref.current.getEditor();t.ref.current.focus();});await page.keyboard.type("Durable ");
 const checkpoint=await page.evaluate(()=>window.sharedReactSdk.ref.current.checkpointJson());await page.locator("#rerender").click();await expect(page.locator("#render-count")).toHaveText("1");expect(await page.evaluate(()=>({same:window.sharedReactSdk.original===window.sharedReactSdk.ref.current.getEditor(),checkpoint:window.sharedReactSdk.ref.current.checkpointJson()}))).toEqual({same:true,checkpoint});
 await page.evaluate(()=>window.sharedReactSdk.ref.current.focus());await page.keyboard.type("React");expect(await page.evaluate(()=>window.sharedReactSdk.lastCallback)).toBe(1);await page.locator("#switch").click();await expect.poll(()=>page.evaluate(()=>window.sharedReactSdk.ready)).toBe(2);await expect(page.locator('[data-rich-text="react-p"]')).toHaveText("Durable React");expect(await page.evaluate(()=>window.sharedReactSdk.ref.current.getEditor().recovered)).toBe(true);
 const exact=await page.evaluate(async()=>{const editor=window.sharedReactSdk.ref.current.getEditor();await editor.flush();return editor.checkpointJson();});await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>window.sharedReactSdk.ref.current.checkpointJson())).toBe(exact);
 await page.evaluate(()=>{window.sharedReactSdk.last=window.sharedReactSdk.ref.current.getEditor();});await page.locator("#toggle").click();await expect(page.locator('[role="textbox"]')).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>window.sharedReactSdk.last.state().status)).toBe("closed");await page.locator("#toggle").click();await expect.poll(()=>page.evaluate(()=>window.sharedReactSdk.ready)).toBe(2);await expect(page.locator('[data-rich-text="react-p"]')).toHaveText("Durable React");expect(await page.evaluate(()=>({errors:window.sharedReactSdk.errors,closeErrors:window.sharedReactSdk.closeErrors}))).toEqual({errors:[],closeErrors:[]});expect(requests.some(url=>/breditor_wasm_bg.*\.wasm/.test(url))).toBe(false);
});

test("installed shared React hands off quota-failed retirement and retries without losing its old journal",async({page})=>{
 await ready(page,"/shared-react.html");await page.evaluate(()=>{const t=window.sharedReactSdk;t.put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException("Expected quota failure","QuotaExceededError");};t.ref.current.focus();});await page.keyboard.type("Keep me");
 const checkpoint=await page.evaluate(()=>window.sharedReactSdk.ref.current.checkpointJson());await page.locator("#switch").click();await expect(page.getByRole("alert")).toBeVisible();expect(await page.evaluate(()=>({checkpoint:window.sharedReactSdk.ref.current.checkpointJson(),recoveries:window.sharedReactSdk.recoveries.length>0,ready:window.sharedReactSdk.ready}))).toEqual({checkpoint,recoveries:true,ready:1});
 await page.evaluate(()=>{IDBObjectStore.prototype.put=window.sharedReactSdk.put;});await page.getByRole("button",{name:"Retry",exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.sharedReactSdk.ready)).toBe(2);await expect(page.locator('[data-rich-text="react-p"]')).toHaveText("Keep me");expect(await page.evaluate(()=>window.sharedReactSdk.ref.current.checkpointJson())).toBe(checkpoint);
});

test("unmount during shared React Wasm initialization never leases or announces a late writer",async({page})=>{
 let release;const gate=new Promise(resolve=>{release=resolve;}),requests=[];await page.route(/breditor_shared_bg.*\.wasm$/,async route=>{requests.push(route.request().url());await gate;await route.continue();});
 try{
  await page.goto("/shared-react.html");await expect.poll(()=>requests.length).toBe(1);await page.locator("#toggle").click();release();await expect(page.locator('[role="textbox"]')).toHaveCount(0);expect(await page.evaluate(()=>window.sharedReactSdk.ready)).toBe(0);
  await page.locator("#toggle").click();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>({ready:window.sharedReactSdk.ready,closeErrors:window.sharedReactSdk.closeErrors,errors:window.sharedReactSdk.errors}))).toEqual({ready:1,closeErrors:[],errors:[]});expect(requests).toHaveLength(1);
 }finally{release();}
});
