/** Actual-native catalog interruption/race cases. No production test hooks or fabricated ready owners. */
import assert from "node:assert/strict";
import {IDBObjectStore} from "fake-indexeddb";
import {requests,missing,readRecord,changeRecord,changeFile,dump} from "./storage.mjs";

export async function exerciseCatalogFaults({api,archive,sources,tag,counts}){
 async function run(name,body,extra={}){
  const prefix=`${tag}-${name}`,open={database:`${prefix}-catalog`,expected:archive.selection(),checkAuthority(){},...extra},context={catalog:undefined,chosen:requests(sources,prefix),open};
  context.close=async()=>{await context.catalog?.close();context.catalog=undefined;};context.resume=async()=>{await context.close();const {signal:_signal,...again}=open;context.catalog=await api.SharedRoomRecoveryCatalog.resume(again);};
  try{context.catalog=await api.SharedRoomRecoveryCatalog.begin({...open,archive});await body(context);}finally{await context.catalog?.discardAndClose();}
 }
 // Root commit ambiguity must not restart a completed child from an empty document.
 for(const target of ["started","complete","checked"]){const controller=new AbortController();await run(`lost-ack-${target}`,async ctx=>{
  const put=IDBObjectStore.prototype.put;let fired=false;try{IDBObjectStore.prototype.put=function(value,...args){const r=put.call(this,value,...args);if(!fired&&this.name==="catalog"&&this.transaction.db.name===ctx.open.database&&(target==="checked"?value.phase==="checked":value.participants?.[0]?.state===target)){fired=true;this.transaction.addEventListener("complete",()=>controller.abort(),{once:true});}return r;};await assert.rejects(ctx.catalog.stage(ctx.chosen),e=>e.code==="catalog_aborted");}finally{IDBObjectStore.prototype.put=put;}
  assert.equal(fired,true);const retained=await readRecord(ctx.open.database);if(target==="started"){assert.equal(retained.participants[0].state,"started");assert.equal(await missing(ctx.chosen[0].recovery.database),true);}if(target==="complete")assert.equal(retained.participants[0].state,"complete");if(target==="checked")assert.equal(retained.phase,"checked");
  await ctx.resume();assert.equal((await ctx.catalog.stage(ctx.chosen)).kind,"checked");counts.lostAcknowledgementResumes++;
 },{signal:controller.signal});}
 await run("parent-complete-abort",async ctx=>{
  const put=IDBObjectStore.prototype.put;let fired=false;try{IDBObjectStore.prototype.put=function(value,...args){const r=put.call(this,value,...args);if(!fired&&this.name==="catalog"&&this.transaction.db.name===ctx.open.database&&value.participants?.[0]?.state==="complete"){fired=true;this.transaction.abort();}return r;};await assert.rejects(ctx.catalog.stage(ctx.chosen),e=>e.code==="catalog_storage");}finally{IDBObjectStore.prototype.put=put;}
  assert.equal(fired,true);assert.equal((await readRecord(ctx.open.database)).participants[0].state,"started");await ctx.resume();assert.equal((await ctx.catalog.stage(ctx.chosen)).kind,"checked");counts.parentMarkerAbortResumes++;
 });
 await run("plan-abort",async ctx=>{
  const put=IDBObjectStore.prototype.put;let fired=false;try{IDBObjectStore.prototype.put=function(value,...args){const r=put.call(this,value,...args);if(!fired&&this.name==="catalog"&&this.transaction.db.name===ctx.open.database&&value.phase==="staging"){fired=true;this.transaction.abort();}return r;};await assert.rejects(ctx.catalog.stage(ctx.chosen),e=>e.code==="catalog_storage");}finally{IDBObjectStore.prototype.put=put;}
  assert.equal((await ctx.catalog.progress()).phase,"retained");assert.equal((await ctx.catalog.stage(ctx.chosen)).kind,"checked");counts.planAbortRetries++;
 });
 await run("mutated-request",async ctx=>{
  const first=ctx.chosen[0],original=first.recovery.session.options.restore,document=first.recovery.destinations.document,working=ctx.catalog.stage(ctx.chosen);assert.throws(()=>ctx.catalog.stage(ctx.chosen),e=>e.code==="catalog_in_use");first.recovery.destinations.document=`${tag}-PRIVATE-MUTATED-TARGET`;first.recovery.session.options.restore=()=>{throw Error("PRIVATE-MUTATED-FACTORY");};
  try{assert.equal((await working).kind,"checked");assert.equal(await missing(document),false);assert.equal(await missing(first.recovery.destinations.document),true);counts.policySnapshots++;}finally{first.recovery.destinations.document=document;first.recovery.session.options.restore=original;}
 });
 await run("changed-target",async ctx=>{
  assert.equal((await ctx.catalog.stage(ctx.chosen)).kind,"checked");await ctx.close();const name=ctx.chosen[0].recovery.destinations.document,before=await dump(name),db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  try{await new Promise((resolve,reject)=>{const tx=db.transaction("journals","readwrite"),s=tx.objectStore("journals"),r=s.openCursor();r.onsuccess=()=>{const cursor=r.result;cursor.update({...cursor.value,documentCheckpointJson:cursor.value.documentCheckpointJson+" "});};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}finally{db.close();}
  const changed=await dump(name);assert.notDeepEqual(changed,before);await ctx.resume();await assert.rejects(ctx.catalog.stage(ctx.chosen),e=>e.code==="catalog_restore");assert.deepEqual(await dump(name),changed);counts.changedTargetRefusals++;
 });
 await run("changed-file",async ctx=>{await ctx.close();await changeFile(ctx.open.database,"server",new Blob(["changed native bundle"]));await assert.rejects(ctx.resume(),e=>["catalog_integrity","catalog_budget"].includes(e.code));counts.changedFileRefusals++;});
 await run("promoted-marker",async ctx=>{
  const controller=new AbortController(),put=IDBObjectStore.prototype.put;let fired=false;const active=ctx.catalog;await active.close();ctx.catalog=await api.SharedRoomRecoveryCatalog.resume({...ctx.open,signal:controller.signal});
  try{IDBObjectStore.prototype.put=function(value,...args){const r=put.call(this,value,...args);if(!fired&&this.name==="catalog"&&this.transaction.db.name===ctx.open.database&&value.phase==="staging"){fired=true;this.transaction.addEventListener("complete",()=>controller.abort(),{once:true});}return r;};await assert.rejects(ctx.catalog.stage(ctx.chosen),e=>e.code==="catalog_aborted");}finally{IDBObjectStore.prototype.put=put;}
  await ctx.close();await changeRecord(ctx.open.database,value=>({...value,phase:"checked",participants:value.participants.map(row=>({...row,state:"complete"}))}));await ctx.resume();await assert.rejects(ctx.catalog.stage(ctx.chosen),e=>e.code==="catalog_missing");assert.equal(await missing(ctx.chosen[0].recovery.database),true);counts.fabricatedCompletionRefusals++;
 });
 await run("close-during-restore",async ctx=>{
  let entered,release;const started=new Promise(resolve=>{entered=resolve;}),blocked=new Promise(resolve=>{release=resolve;}),o=ctx.chosen[0].recovery.session.options,original=o.restore;let once=false;
  o.restore=async(...args)=>{if(!once){once=true;entered();await blocked;}return original(...args);};const staging=ctx.catalog.stage(ctx.chosen);await started;const refused=assert.rejects(staging,e=>["catalog_closed","catalog_restore"].includes(e.code)),closing=ctx.catalog.close();release();await refused;await closing;ctx.catalog=undefined;o.restore=original;await ctx.resume();assert.equal((await ctx.catalog.stage(ctx.chosen)).kind,"checked");counts.closeDuringRestoreResumes++;
 });
 let allowed=true,reenter=false,holder;const checkAuthority=()=>{if(!allowed)throw Error("PRIVATE-REVOKED");if(reenter){reenter=false;assert.throws(()=>holder.stage([]),e=>e.code==="catalog_in_use");counts.reentrancyRefusals++;}};
 await run("authority",async ctx=>{holder=ctx.catalog;reenter=true;assert.equal((await holder.stage(ctx.chosen)).kind,"checked");allowed=false;await assert.rejects(holder.progress(),e=>e.code==="catalog_authority"&&!String(e).includes("PRIVATE"));counts.authorityRefusals++;}, {checkAuthority});
 for(const checkAuthority of [()=>true,async()=>{throw Error("PRIVATE-ASYNC");},()=>{throw Error("PRIVATE-DENIED");}]){
  const database=`${tag}-bad-authority-${counts.authorityRefusals}`;await assert.rejects(api.SharedRoomRecoveryCatalog.begin({database,archive,expected:archive.selection(),checkAuthority}),e=>e.code==="catalog_authority"&&!String(e).includes("PRIVATE"));assert.equal(await missing(database),true);counts.authorityRefusals++;
 }
}
