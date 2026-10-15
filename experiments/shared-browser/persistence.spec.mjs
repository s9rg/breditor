import {test,expect} from "@playwright/test";
import {compareEngineExports} from "../collaboration/browser/compare-exports.mjs";
test.beforeEach(async({page})=>{await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");});
test("exclusive writer recovery saves table image and remote text history across a real page reload",async({page})=>{
 const data=JSON.parse(await page.evaluate(async()=>{
  const t=window.sharedTools,database=`shared-recovery-${crypto.randomUUID()}`,options={database,room:"room",writer:"101",create:()=>new t.wasm.RichReplicaProbe(t.vector.rich_local_input,"101"),restore:j=>t.wasm.RichReplicaProbe.restore("room",j)};
  const session=await t.SharedPersistentSession.open(options),a=session.core,b=new t.SharedRichEditor(t.wasm.RichReplicaProbe.join_frame("room","202",a.updateFrame()));
  a.dispatch({commands:[{kind:"resize_column",data:{block:"table-block",column:"c",width:270}},{kind:"set_image_alt",data:{block:"image-block",text:"Saved diagram",decorative:false}}]});
  b.dispatch({commands:[{kind:"insert_text",data:{block:"caption",offset:0,text:"Remote "}}]});await a.receiveFrame(b.updateFrame());a.undo();await session.flush();
  const checkpoint=a.checkpointJson(),current=a.view(),saved=session.state(),frame=a.updateFrame();await session.close();b.dispose();return JSON.stringify({database,checkpoint,current,saved,frame});
 }));
 expect(data.saved.status).toBe("saved");await page.reload();await expect(page.locator("#status")).toHaveText("Ready");
 const r=JSON.parse(await page.evaluate(async data=>{
  const t=window.sharedTools,s=await t.SharedPersistentSession.open({database:data.database,room:"room",writer:"101",create:()=>{throw Error("Must restore the saved writer");},restore:j=>t.wasm.RichReplicaProbe.restore("room",j)}),a=s.core,exact=a.checkpointJson()===data.checkpoint,current=a.view();a.redo();await s.flush();
  const expected=new t.SharedRichEditor(t.wasm.RichReplicaProbe.restore("room",data.checkpoint));expected.redo();const result={recovered:s.recovered,exact,current,cases:[{name:"reloaded-redo",native:JSON.parse(expected.updateFrame()).bytes,wasm:JSON.parse(a.updateFrame()).bytes}],future:a.checkpointJson()===expected.checkpointJson(),state:s.state()};expected.dispose();await s.close();return JSON.stringify(result);
 },data));expect(r).toMatchObject({recovered:true,exact:true,current:data.current,future:true,state:{status:"saved"}});for(const value of await compareEngineExports(r.cases))expect(value).toMatchObject({operationsEqual:true,stateEqual:true,causalVersionEqual:true});
});
test("another tab cannot clone the same writer even under a different database name",async({page,context})=>{
 const database=`writer-lock-${Date.now()}`;await page.evaluate(async database=>{const t=window.sharedTools;t.session=await t.SharedPersistentSession.open({database,room:"room",writer:"9007199254740993",create:()=>new t.wasm.RichReplicaProbe(t.vector.rich_local_input,"9007199254740993"),restore:j=>t.wasm.RichReplicaProbe.restore("room",j)});},database);
 const other=await context.newPage();await other.goto("/");await expect(other.locator("#status")).toHaveText("Ready");
 expect(await other.evaluate(async database=>{const t=window.sharedTools;try{await t.SharedPersistentSession.open({database:`${database}-other`,room:"room",writer:"9007199254740993",create:()=>{throw Error("Factory must not run before lock acquisition");},restore:()=>{throw Error("Restore must not run");}});return"accepted";}catch(e){return e.code;}},database)).toBe("writer_in_use");
 // Closing the tab releases its Web Lock without an explicit application close.
 await page.close();const r=await other.evaluate(async database=>{const t=window.sharedTools,s=await t.SharedPersistentSession.open({database,room:"room",writer:"9007199254740993",create:()=>{throw Error("Saved session missing");},restore:j=>t.wasm.RichReplicaProbe.restore("room",j)});const recovered=s.recovered;await s.close();return recovered;},database);expect(r).toBe(true);await other.close();
});
test("failed factory or wrong-writer restore releases the lease without overwriting a durable checkpoint",async({page})=>{
 const r=await page.evaluate(async()=>{const t=window.sharedTools,database=`failed-open-${crypto.randomUUID()}`,base={database,room:"room",writer:"101",create:()=>new t.wasm.RichReplicaProbe(t.vector.rich_local_input,"101"),restore:j=>t.wasm.RichReplicaProbe.restore("room",j)};
  let factory=false;try{await t.SharedPersistentSession.open({...base,create:()=>{throw Error("Expected factory failure");}});}catch{factory=true;}
  const first=await t.SharedPersistentSession.open(base),before=first.core.checkpointJson();await first.close();let identity;try{await t.SharedPersistentSession.open({...base,restore:()=>new t.wasm.RichReplicaProbe(t.vector.rich_local_input,"202")});}catch(e){identity=e.code;}
  const final=await t.SharedPersistentSession.open(base),exact=final.core.checkpointJson()===before;await final.close();return{factory,identity,exact};});expect(r).toEqual({factory:true,identity:"session_identity",exact:true});
});
test("quota failure stays explicit and can retry the newest complete checkpoint without dropping history",async({page})=>{
 const r=JSON.parse(await page.evaluate(async()=>{const t=window.sharedTools,errors=[],s=await t.SharedPersistentSession.open({database:`quota-${crypto.randomUUID()}`,room:"room",writer:"101",create:()=>new t.wasm.RichReplicaProbe(t.vector.rich_local_input,"101"),restore:j=>t.wasm.RichReplicaProbe.restore("room",j),onError:e=>errors.push(String(e))});
  // Inject only the host storage failure; content and future recovery remain real Rust/Wasm.
  const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==="journals")throw new DOMException("Functional quota fixture","QuotaExceededError");return original.apply(this,args);};
  s.core.dispatch({commands:[{kind:"insert_text",data:{block:"caption",offset:0,text:"Offline "}}]});let rejected=false;try{await s.flush();}catch{rejected=true;}const failed=s.state().status;s.core.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"Latest "}}]});IDBObjectStore.prototype.put=original;await s.retry();const checkpoint=s.core.checkpointJson(),state=s.state();await s.close();return JSON.stringify({rejected,failed,state,errors:errors.length,checkpoint});}));expect(r).toMatchObject({rejected:true,failed:"failed",state:{status:"saved"}});expect(r.errors).toBeGreaterThan(0);expect(r.checkpoint).toContain("Latest ");expect(r.checkpoint).toContain("Offline ");
});
test("old private journals are rejected before restore without overwriting their stored bytes",async({page})=>{
 const result=await page.evaluate(async()=>{const t=window.sharedTools,database=`old-journal-${crypto.randomUUID()}`,base={database,room:"room",writer:"101",create:()=>new t.wasm.RichReplicaProbe(t.vector.rich_local_input,"101"),restore:j=>t.wasm.RichReplicaProbe.restore("room",j)};
  const first=await t.SharedPersistentSession.open(base),old=JSON.parse(first.core.checkpointJson());old.version=11;const bytes=JSON.stringify(old);await first.close();
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(database,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise((resolve,reject)=>{const tx=db.transaction("journals","readwrite");tx.objectStore("journals").put(bytes,["room","101"]);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
  let callbacks=0,error;try{await t.SharedPersistentSession.open({...base,create:()=>{callbacks++;throw Error("Must not replace an old journal");},restore:()=>{callbacks++;throw Error("Must reject the old family before replay");}});}catch(e){error=e.code;}
  const retained=await new Promise((resolve,reject)=>{const tx=db.transaction("journals","readonly"),request=tx.objectStore("journals").get(["room","101"]);let value;request.onsuccess=()=>value=request.result;tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(tx.error);});db.close();
  // The rejected restore must release its writer lock, including across database names.
  const fresh=await t.SharedPersistentSession.open({...base,database:`${database}-new`});await fresh.close();return{error,callbacks,exact:retained===bytes};});
 expect(result).toEqual({error:"session_identity",callbacks:0,exact:true});
});
