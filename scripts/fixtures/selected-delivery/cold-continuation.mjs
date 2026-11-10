
/** Close actual owners, reopen their persisted files/cores and resume the
 * remaining authenticated sources. Native service/receipts are not simulated. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import * as api from '../../../packages/breditor-collaboration/dist/index.js';
import {SharedServerLogGenerationDeliveryPathRecoveryHost as PathHost} from '../../../packages/breditor-collaboration/dist/generation_delivery_path_control/host.js';
import {SelectedNativeDeliveryJournal as Journal} from '../../../packages/breditor-collaboration/dist/selected_delivery_journal/coordinator.js';
import {previewSelectedNativeDeliveryJournalResume as previewLocal,previewSelectedNativeDeliveryJournalHandover as previewHandover} from '../../../packages/breditor-collaboration/dist/selected_delivery_journal/resume_preview.js';
import {withSelectedNativeDeliverySources} from '../../../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import {withNativeRelayDelivery} from '../../../packages/breditor-collaboration/dist/relay/native_delivery.js';
import {createPreparedSelectedNativeRelayDelivery} from '../../../packages/breditor-collaboration/dist/selected_delivery_preparation/coordinator.js';
import * as native from '../../../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
export async function controls(host,previous,scope){
 const actual=await host.refreshAfter(previous),baseline=await host.refresh(),hosts=[];
 const current=async item=>{const value=await api.SharedServerLogGenerationRecoveryHost.open({endpoint:item.endpoint,expected:item.selection,principal:'operator',getToken:()=>host.operatorToken(item),checkAuthority:()=>scope.check()});hosts.push(value);return value;};
 const delivery=async item=>{const value=await api.SharedServerLogGenerationDeliveryRecoveryHost.open({endpoint:item.deliveryEndpoint,expected:item.deliverySelection,current:await current(item),principal:'operator',getToken:()=>host.operatorToken(item),checkAuthority:()=>scope.check()});hosts.push(value);return value;};
 let server,inventory;
 try{const latest=await delivery(actual),base=await delivery(baseline),path=await PathHost.open({endpoint:baseline.deliveryPathEndpoint,expected:baseline.deliveryPathSelection,current:base,principal:'operator',getToken:()=>host.operatorToken(baseline),checkAuthority:()=>scope.check()});hosts.push(path);
  server=await api.SharedServerLogGenerationRoomArchive.read(new Blob([readFileSync(join(dirname(actual.path),'server-after.backup'))]),actual.selection.source.server,{wasm:native,checkAuthority:()=>scope.check()});inventory=await api.SharedServerLogGenerationParticipantInventory.read(new Blob([readFileSync(join(dirname(actual.path),'inventory.json'))]),actual.selection.source.participants);
  return {actual,baseline:base,previous:latest,path,server,inventory,close(){inventory.dispose();server.dispose();for(const item of hosts.toReversed())item.close();}};
 }catch(error){inventory?.dispose();server?.dispose();for(const item of hosts.toReversed())item.close();throw error;}
}
export async function handoverControls(host,actual,scope){
 const hosts=[];
 let server,inventory;
 const auth={principal:'operator',getToken:()=>host.operatorToken(actual),checkAuthority:()=>scope.check()};
 try{
  const current=await api.SharedServerLogGenerationRecoveryHost.open({...auth,endpoint:actual.endpoint,expected:actual.selection});
  hosts.push(current);
  const delivery=await api.SharedServerLogGenerationDeliveryRecoveryHost.open({...auth,endpoint:actual.deliveryEndpoint,expected:actual.deliverySelection,current});
  hosts.push(delivery);
  const path=await PathHost.openHandover({...auth,endpoint:actual.handoverEndpoint,expected:actual.handoverSelection,current:delivery});
  hosts.push(path);
  const root=dirname(actual.path);
  server=await api.SharedServerLogGenerationRoomArchive.read(new Blob([readFileSync(join(root,'server-after.backup'))]),actual.selection.source.server,{wasm:native,checkAuthority:scope.check});
  inventory=await api.SharedServerLogGenerationParticipantInventory.read(new Blob([readFileSync(join(root,'inventory.json'))]),actual.selection.source.participants);
  return {actual,path,delivery,server,inventory,close(){inventory.dispose();server.dispose();for(const item of hosts.toReversed())item.close();}};
 }catch(error){inventory?.dispose();server?.dispose();for(const item of hosts.toReversed())item.close();throw error;}
}
export async function continueAfterRealColdOpen({session,host,fixture,previous,head,identity,adapters,contexts,oldGate,handover=false}){
 const oldCores=session.owner.clients.map(row=>row.core),basis=head.entries.at(-1).current;assert.equal(head.head.sequence,2);const endedCalls=session.f.oldCalls;let freshPolicyCalls=0;await session.cold(basis,{checkAuthority(){freshPolicyCalls++;}});assert.ok(freshPolicyCalls>0);assert.equal(session.f.oldCalls,endedCalls,'An ended whole-room job guard must never be revived for cold startup');console.log('COLD_STEP fresh constructor-owned native cores');
 assert.equal(session.owner.clients.length,7);for(const row of session.owner.clients)assert.equal(oldCores.includes(row.core),false,'Cold reopen must construct genuinely new native cores');assert.throws(()=>oldGate.check());
 const sealed=handover?await host.handover():undefined;
 if(sealed){
  assert.notDeepEqual(sealed.selection.source.origin,identity.prepared.server.source.origin);
  assert.equal(sealed.clientEndpoint,host.initial.clientEndpoint);
  console.log('HANDOVER_STEP actual sealed successor with a changed restore origin');
 }
 const preview=handover?previewHandover:previewLocal;
 const resume=handover?Journal.resumeAcrossHandover:Journal.resume;
 let result,approvals=0,tokens=0,owner;
 await withSelectedNativeDeliverySources(session.owner,session.input(),async(scope,sources)=>{
  const fresh=sealed?await handoverControls(host,sealed,scope):await controls(host,previous,scope);
  const input={identity,...(handover?{}:{baseline:fresh.baseline,previous:fresh.previous}),path:fresh.path,server:fresh.server,inventory:fresh.inventory,checkAuthority:()=>scope.check()};
  try{
   await assert.rejects(preview({...scope},input));await assert.rejects(resume({...scope},{...input,expected:{},approve(){approvals++;return true;}}));assert.equal(approvals,0);
   const missing={...identity,database:identity.database+'-missing'};await assert.rejects(preview(scope,{...input,identity:missing}));assert.equal((await indexedDB.databases()).some(row=>row.name===missing.database),false);
   await assert.rejects(preview(scope,{...input,path:{...fresh.path}}));
   const expected=await preview(scope,input);console.log('COLD_STEP complete journal/path/client preview');assert.equal(expected.head.sequence,2);assert.deepEqual(expected.journal,identity);
   await assert.rejects(resume(scope,{...input,expected,approve(){approvals++;return false;}}));assert.equal(approvals,1,'A saved journal must never bypass a new decision');
   const again=await preview(scope,input);assert.deepEqual(again,expected,'Refusal must preserve all facts and release actual resources');
   await assert.rejects(resume(scope,{...input,expected:{...expected,head:{...expected.head,sha256:'0'.repeat(64)}},approve(){approvals++;return true;}}));assert.equal(approvals,1,'Stale choice refuses before approval');

   // A matching head/count/length cannot hide changed OLD bytes during the
   // approval callback. Restore only this controlled fixture after refusal.
   const original=await head.entries[0].server.arrayBuffer(),changed=original.slice(0);new Uint8Array(changed)[changed.byteLength-1]^=1;
   const replace=bytes=>new Promise((resolve,reject)=>{const q=indexedDB.open(identity.database,1);q.onupgradeneeded=()=>{q.transaction.abort();reject(Error('Existing journal required'));};q.onerror=()=>reject(q.error);q.onsuccess=()=>{const db=q.result,tx=db.transaction('servers','readwrite');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(tx.error);};tx.objectStore('servers').put(bytes,0);};});
   try{await assert.rejects(resume(scope,{...input,expected,async approve(){approvals++;await replace(changed);return true;}}));assert.equal(approvals,2);}finally{await replace(original);}
   console.log('COLD_STEP old-byte corruption after approval refused');
   owner=await resume(scope,{...input,expected,approve(choice){approvals++;assert.deepEqual(choice,expected);return true;}});assert.equal(approvals,3);console.log('COLD_STEP fresh approved gate and immutable resume checkpoint');
   let observed=await owner.readFacts();assert.equal(observed.head.sequence,3);if(handover)assert.equal(observed.entries[3].event.control.kind,'handover');for(let i=0;i<head.entries.length;i++){assert.deepEqual(observed.entries[i].event,head.entries[i].event);for(const name of ['current','server','inventory']){const a=name==='current'?observed.entries[i].current.file:observed.entries[i][name],b=name==='current'?head.entries[i].current.file:head.entries[i][name];assert.deepEqual(Buffer.from(await a.arrayBuffer()),Buffer.from(await b.arrayBuffer()));}}
   assert.throws(()=>createPreparedSelectedNativeRelayDelivery(oldGate,scope,sources[0].source,'comment'));
   previous=fresh.actual;
  }finally{fresh.close();}
  try{
   for(const id of ['independent-delivery','restored-graph']){
    const row=sources.find(row=>row.id===id),parent=row.source.parent,storage=parent.kind==='generation'?parent.source.session:parent.session,client=fixture.clients.find(value=>value.writer===row.source.core.writerClockV2(storage.reviewRelayIdentity().documentWriter).writer),auth=await host.authentication(client),context=owner.createDelivery(row.source,'comment');contexts.push(context);
    const common={getToken:()=>{scope.check();tokens++;return auth.getToken();},autoConnect:false,requestTimeoutMs:5000},doc=api.createSharedIndependentRelaySync(storage,withNativeRelayDelivery({...common,identity:auth.document},context)),review=api.createSharedIndependentReviewRelaySync(storage,withNativeRelayDelivery({...common,identity:auth.review,flushDocument:()=>doc.flush()},context));adapters.push(doc,review);
    await doc.connect();await doc.flush();await review.connect();await review.flush();assert.equal(doc.state().pending,false);assert.equal(review.state().pending,false);
    const fresh=handover?await handoverControls(host,await host.refresh(),scope):await controls(host,previous,scope);
    try{
     const input={server:fresh.server,inventory:fresh.inventory};
     head=handover?await owner.recordAcrossHandover({...input,path:fresh.path}):await owner.record({...input,baseline:fresh.baseline,previous:fresh.previous});
     previous=fresh.actual;
    }finally{fresh.close();}
    assert.equal(doc.state().status,'closed');assert.equal(review.state().status,'closed');console.log('COLD_STEP real resumed receipts '+id);
   }
   head=await owner.readFacts();assert.equal(head.head.sequence,5);assert.equal(head.entries.length,6);if(handover)assert.deepEqual(head.entries.slice(3).map(row=>row.event.control.kind),['handover','handover','handover']);result=await scope.retainCurrent();assert.ok(tokens>0);
  }finally{await owner?.close();}
 });
 assert.equal(session.f.oldCalls,endedCalls,'Cold delivery must not call the ended job policy');return {current:result,head,approvals,tokens};
}
