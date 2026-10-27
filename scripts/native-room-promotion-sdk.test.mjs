/** Actual seven-source-path promotion under all four independent document/
 * comment history pairs. No browser, power-loss or server activation claim. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {IDBObjectStore} from 'fake-indexeddb';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {preparedRoomRun} from './fixtures/native-room-run/session.mjs';
import {takeWithAbortReentry} from './fixtures/native-room-run/take-reentry.mjs';
import {nativePair,databaseNames} from './fixtures/native-room-retirement/session.mjs';
import {sourceByteSnapshots,assertSourceBytesUnchanged} from './fixtures/native-actor-custody/storage_bytes.mjs';
import {RoomExecutionAttempt as Attempt} from '../packages/breditor-collaboration/dist/native_room_execution_run/attempt.js';
import {RoomRunSuccessorRecipient as Recipient} from '../packages/breditor-collaboration/dist/native_room_execution_run/successor_recipient.js';
import {StoppedActorCohort} from '../packages/breditor-collaboration/dist/persistence/stopped_actor_cohort.js';
import {RecoveryLease} from '../packages/breditor-collaboration/dist/participant_recovery/lease.js';
import {SharedWriterLease} from '../packages/breditor-collaboration/dist/persistence/writer_lease.js';
import {ReviewWriterLease} from '../packages/breditor-collaboration/dist/persistence/review_writer_lease.js';
import {thirdPixel,thirdAsset,ParticipantFixtureImage} from './fixtures/review-assets/participant-pixels.mjs';
import {saveEvidence} from './candidate-release/evidence.mjs';
let fixtures,transport;before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});
after(async()=>{transport?.restore();await fixtures?.close();if(fixtures){const rows=[];for(const row of fixtures.manifest.cases){let code;try{await fetch(row.endpoint,{signal:AbortSignal.timeout(2000)});}catch(error){code=error.cause?.code;}rows.push({endpoint:row.endpoint,closed:code==='ECONNREFUSED'});}saveEvidence(fixtures.directory+'/room-promotion-endpoints-closed.json',{rows});assert.ok(rows.every(row=>row.closed));}});
function actors(f){return f.s.f.f.rows.map(row=>({room:row.owner.options.room,writer:row.client.writer,actor:row.client.actor}));}
const documentAcquire=SharedWriterLease.acquire,reviewAcquire=ReviewWriterLease.acquire;
async function held(rows){for(const row of rows){await assert.rejects(documentAcquire.call(SharedWriterLease,row.room,row.writer),e=>e.code==='writer_in_use');await assert.rejects(reviewAcquire.call(ReviewWriterLease,row.room,row.actor),e=>e.code==='review_writer_in_use');}}
async function released(rows){for(const row of rows){const doc=await documentAcquire.call(SharedWriterLease,row.room,row.writer),review=await reviewAcquire.call(ReviewWriterLease,row.room,row.actor);await review.close();await doc.close();}}
for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])test('usable room promotion '+documentSegmented+'/'+reviewSegmented+' preserves both Undo lanes after the old job ends',async()=>{
 const tag='room-promotion-'+documentSegmented+'-'+reviewSegmented,f=await preparedRoomRun(fixtures,tag,{documentSegmented,reviewSegmented}),controller=new AbortController();let attempt,owner,acquisitions=0,assetChecks=0,assetAllowed=true,dispatches=0;
 const replaced=[['owner',Recipient.prototype.owner],['take',Recipient.prototype.take],['activate',Recipient.prototype.activate]],commit=StoppedActorCohort.prototype.commit;
 try{const source=await sourceByteSnapshots(),rows=actors(f.f);attempt=Attempt.begin(f.f.s.owner,{...f.reads,signal:controller.signal},f.options);assert.throws(()=>attempt.takeOwner());
  SharedWriterLease.acquire=function(...args){acquisitions++;return documentAcquire.apply(this,args);};
  await attempt.run(()=>true);const expected=await attempt.previewPromotion();assert.deepEqual(expected.identity,f.options.expected);assert.equal('core' in expected,false);assert.throws(()=>attempt.takeOwner());
  const promoting=attempt.promote({expected,async approve(choice){assert.deepEqual(choice,expected);await assert.rejects(attempt.promote({expected,approve:()=>true,checkAssetAuthority(){}}),e=>e.code==='room_execution_busy');assert.throws(()=>attempt.takeOwner(),e=>e.code==='room_execution_busy');
   if(!documentSegmented&&!reviewSegmented){for(const[name]of replaced)Recipient.prototype[name]=()=>{dispatches++;throw Error('Replaced recipient method inside final handoff');};StoppedActorCohort.prototype.commit=()=>{dispatches++;throw Error('Replaced whole-cohort commit inside final handoff');};}return true;},checkAssetAuthority(){assetChecks++;if(!assetAllowed)throw Error('Current asset grant revoked');}});
  await assert.rejects(attempt.run(()=>true),e=>e.code==='room_execution_busy');const result=await promoting;assert.equal(result.scope,'local-native-packet-selected-asset-and-actor-ownership');assert.deepEqual(result.choice,expected);assert.equal(dispatches,0);
  // Ending the finite recovery job must not revoke the new owner's separately
  // selected native/asset lifetime policies. The async result itself is DATA.
  controller.abort();owner=attempt.takeOwner();assert.throws(()=>attempt.takeOwner());await attempt.close();assert.equal(owner.clients.length,7);assert.equal(acquisitions,0);await held(rows);
  for(const client of owner.clients){const old=f.f.clients.find(row=>row.id===client.id);assert.deepEqual(nativePair(client.core),old.pair,client.id);assert.equal(client.core.documentJson(),old.document,client.id);assert.equal(client.core.undo(),true,client.id);assert.equal(client.core.redo(),true,client.id);assert.equal(client.core.documentJson(),old.document,client.id);assert.equal(client.core.undoReview().kind,'committed',client.id);assert.equal(client.core.redoReview().kind,'committed',client.id);}
  const first=owner.clients[0],before=first.core.documentJson();first.core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'after handoff '}}]});assert.notEqual(first.core.documentJson(),before);assert.equal(first.core.undo(),true);assert.equal(first.core.documentJson(),before);assert.equal(first.core.redo(),true);
  // The ordinary fixture decoder admits only two exact PNGs. This third,
  // independently CRC/inflate-checked fixture tests a new unreferenced upload.
  Object.defineProperty(globalThis,'Image',{value:ParticipantFixtureImage,configurable:true});
  const port=owner.assets(first.id),asset=await port.ingest(new Blob([thirdPixel],{type:'image/png'}));assert.equal(asset.asset,thirdAsset);assert.ok((await port.list()).some(row=>row.asset===thirdAsset&&row.status==='pending'));assert.ok(assetChecks>0);assetAllowed=false;await assert.rejects(port.list());assetAllowed=true;
  const cut=await owner.capture(f.f.s.input());assert.equal(cut.uploads.length,7);await assertSourceBytesUnchanged(source);await held(rows);assert.equal(acquisitions,0);SharedWriterLease.acquire=documentAcquire;
  await owner.close();owner=undefined;await released(rows);await assertSourceBytesUnchanged(source);saveEvidence(fixtures.directory+'/'+tag+'.json',{passed:true,documentSegmented,reviewSegmented,sourcePaths:7,actualActorLocks:14,ordinaryWriterReacquisitions:acquisitions,oldJobEndedBeforeTake:true,futureBothLaneUndoRedo:true,futureNativeEdits:true,futureUnreferencedPendingUpload:true,independentAssetGrant:true,sourceSchemaAndBytesUnchanged:true,serverActivated:false});
 }finally{for(const[name,value]of replaced)Recipient.prototype[name]=value;StoppedActorCohort.prototype.commit=commit;SharedWriterLease.acquire=documentAcquire;try{await owner?.discardAndClose();}finally{try{await attempt?.close();}finally{await f.close();}}}
});
test('refused approval, aborted approval storage and real journal-close failure preserve reachable actors and retry the exact saved handoff',async()=>{
 const f=await preparedRoomRun(fixtures,'room-promotion-retry',{documentSegmented:true,reviewSegmented:false}),journalLeases=new Set();let attempt,owner,inserted=0,closeFault=0,approvals=0;
 const acquire=RecoveryLease.acquire,close=RecoveryLease.prototype.close,add=IDBObjectStore.prototype.add;
 try{const source=await sourceByteSnapshots(),rows=actors(f.f);RecoveryLease.acquire=async function(name){const lease=await acquire.call(this,name);if(name===JSON.stringify(f.options.expected.database))journalLeases.add(lease);return lease;};
  attempt=Attempt.begin(f.f.s.owner,f.reads,f.options);await attempt.run(()=>true);const expected=await attempt.previewPromotion(),names=await databaseNames();
  // Reflection itself can execute application code. A genuine nested preview
  // must refuse before it starts a read; busy refusal cannot clear the outer task.
  let nested,reflected=false;const refused=attempt.promote(new Proxy({expected,approve:()=>{approvals++;return false;},checkAssetAuthority(){}},{ownKeys(target){if(!reflected){reflected=true;nested=attempt.previewPromotion();void nested.catch(()=>{});}return Reflect.ownKeys(target);}}));void refused.catch(()=>{});
  assert.equal(reflected,true);await assert.rejects(nested,e=>e.code==='room_execution_busy');await assert.rejects(refused);assert.throws(()=>attempt.takeOwner());await held(rows);assert.deepEqual(await databaseNames(),names);
  IDBObjectStore.prototype.add=function(...args){const q=add.apply(this,args);if(!inserted&&this.transaction.db.name===f.layout.approvalDatabase){inserted++;this.transaction.abort();}return q;};
  await assert.rejects(attempt.promote({expected,approve:()=>{approvals++;return true;},checkAssetAuthority(){}}));IDBObjectStore.prototype.add=add;assert.equal(inserted,1);assert.throws(()=>attempt.takeOwner());await held(rows);assert.deepEqual(await databaseNames(),names);await assertSourceBytesUnchanged(source);
  RecoveryLease.prototype.close=function(...args){if(!closeFault&&journalLeases.has(this)){closeFault++;return Promise.reject(Error('Test-owned actual execution journal close failure'));}return close.apply(this,args);};
  await assert.rejects(attempt.promote({expected,approve:()=>{approvals++;return true;},checkAssetAuthority(){}}));assert.equal(closeFault,1);assert.throws(()=>attempt.takeOwner());await held(rows);assert.ok((await databaseNames()).includes(f.layout.approvalDatabase));await assertSourceBytesUnchanged(source);
  RecoveryLease.prototype.close=close;const after=await attempt.previewPromotion();assert.deepEqual(after,expected);await attempt.promote({expected:after,approve:()=>{approvals++;return true;},checkAssetAuthority(){}});const taken=takeWithAbortReentry(attempt);owner=taken.owner;assert.equal(taken.fired,true,'A real abort observer ran during finite-job cleanup');assert.equal(taken.nestedCode,'room_execution_busy');assert.equal(taken.outerFailed,false);assert.equal(approvals,4);await attempt.close();await held(rows);assert.equal(owner.clients.length,7);await assertSourceBytesUnchanged(source);await owner.close();owner=undefined;await released(rows);
 }finally{RecoveryLease.acquire=acquire;RecoveryLease.prototype.close=close;IDBObjectStore.prototype.add=add;try{await owner?.discardAndClose();}finally{try{await attempt?.close();}finally{await f.close();}}}
});
