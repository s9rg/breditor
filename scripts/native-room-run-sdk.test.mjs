/** Real seven-family execution from immutable intent through actual native
 * replacements and every selected upload. Controlled browser storage/locks are
 * not cold-process, physical crash, provider or serving certification. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {IDBObjectStore} from 'fake-indexeddb';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {preparedRoomRun,rawRows} from './fixtures/native-room-run/session.mjs';
import {databaseNames} from './fixtures/native-room-retirement/session.mjs';
import {sourceByteSnapshots,assertSourceBytesUnchanged} from './fixtures/native-actor-custody/storage_bytes.mjs';
import {RoomExecutionAttempt as Attempt} from '../packages/breditor-collaboration/dist/native_room_execution_run/attempt.js';
import {selectedOwnerHasRetiredActors,retrySelectedActorCleanup} from '../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import {RecoveryLease} from '../packages/breditor-collaboration/dist/participant_recovery/lease.js';
import {SharedWriterLease} from '../packages/breditor-collaboration/dist/persistence/writer_lease.js';
import {ReviewWriterLease} from '../packages/breditor-collaboration/dist/persistence/review_writer_lease.js';
import {saveEvidence} from './candidate-release/evidence.mjs';
let fixtures,transport;before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});
after(async()=>{transport?.restore();await fixtures?.close();if(fixtures){const rows=[];for(const row of fixtures.manifest.cases){let code;try{await fetch(row.endpoint,{signal:AbortSignal.timeout(2000)});}catch(error){code=error.cause?.code;}rows.push({endpoint:row.endpoint,closed:code==='ECONNREFUSED'});}saveEvidence(fixtures.directory+'/room-run-endpoints-closed.json',{rows});assert.ok(rows.every(row=>row.closed));}});
function actors(f){return f.s.f.f.rows.map(row=>({room:row.owner.options.room,writer:row.client.writer,actor:row.client.actor}));}
async function held(rows){for(const row of rows){await assert.rejects(SharedWriterLease.acquire(row.room,row.writer),e=>e.code==='writer_in_use');await assert.rejects(ReviewWriterLease.acquire(row.room,row.actor),e=>e.code==='review_writer_in_use');}}
async function released(rows){for(const row of rows){const doc=await SharedWriterLease.acquire(row.room,row.writer),review=await ReviewWriterLease.acquire(row.room,row.actor);await review.close();await doc.close();}}
test('synchronous attempt owns the complete warm execution before START, retirement, targets and asset adoption can fail',async()=>{
 const f=await preparedRoomRun(fixtures,'room-run-success',{documentSegmented:true,reviewSegmented:false});let attempt;const acquire=SharedWriterLease.acquire;let acquisitions=0;
 try{const names=await databaseNames(),source=await sourceByteSnapshots(),rows=actors(f.f);let approval=0,probe=false,inProbe=false;const reentries=[];
  const chosen={...f.reads,checkAuthority(){if(inProbe)throw Error('Reentrant run invoked the authority callback again');if(probe){probe=false;inProbe=true;try{reentries.push(attempt.run(()=>true).then(()=>({ready:true}),error=>({ready:false,code:error.code})));}finally{inProbe=false;}}}};
  attempt=Attempt.begin(f.f.s.owner,chosen,f.options);assert.throws(()=>Attempt.begin(f.f.s.owner,f.reads,f.options),e=>e.code==='asset_adoption_busy');await assert.rejects(f.f.s.owner.close(),e=>e.code==='asset_adoption_busy');assert.equal(attempt instanceof Promise,false);assert.deepEqual(await databaseNames(),names);assert.equal('clients' in attempt,false);assert.equal('activate' in attempt,false);assert.equal('takeActors' in attempt,false);
  SharedWriterLease.acquire=function(...args){acquisitions++;return acquire.apply(this,args);};
  const running=attempt.run(async choice=>{approval++;assert.deepEqual(choice.identity,f.options.expected);const events=await rawRows(f.options.expected.database,'events');assert.equal(events[0].event.stage,'start');for(const client of f.f.clients)assert.equal(client.core.documentJson(),client.document);probe=true;return true;});
  await assert.rejects(attempt.run(()=>true),e=>e.code==='room_execution_busy');const result=await running;
  assert.equal(result.state,'targets-and-assets-ready');assert.equal(result.scope,'held-local-replacement-only');assert.equal(approval,1);assert.deepEqual(await Promise.all(reentries),[{ready:false,code:'room_execution_busy'}]);assert.equal(acquisitions,0);assert.throws(()=>f.f.s.owner.clients);await assertSourceBytesUnchanged(source);
  SharedWriterLease.acquire=acquire;await held(rows);
  for(const name of [f.layout.catalogDatabase,f.layout.operationDatabase,f.layout.adoptionDatabase,...f.layout.participants.map(row=>row.selectedUploadsDatabase),...f.data.choice.plan.preparation.plan.participants.flatMap(row=>row.namespaces.map(ns=>ns.database))])assert.ok((await databaseNames()).includes(name),name);
  const events=await rawRows(f.options.expected.database,'events');assert.equal(events.at(-1).event.stage,'assets-ready');assert.ok(events.some(row=>row.event.stage==='retired'));
  // Repeating a ready run requires a fresh decision and reads actual targets;
  // a journal's terminal-looking marker never returns an unchecked result.
  const replay=await attempt.run(()=>{approval++;return true;});assert.ok(replay.head.sequence>result.head.sequence);assert.equal(approval,2);await assertSourceBytesUnchanged(source);
  await attempt.close();await released(rows);assert.ok((await databaseNames()).includes(f.options.expected.database));
  saveEvidence(fixtures.directory+'/room-run-success.json',{passed:true,actualFamilies:7,actualActorLocks:14,ordinaryWriterReacquisitions:acquisitions,fullSelectedUploads:7,freshApprovalOnReadyReplay:true,sourceSchemaAndBytesUnchanged:true,coldProcessRecovery:false,servingActivated:false});
 }finally{SharedWriterLease.acquire=acquire;await attempt?.close();await f.close();}
});
test('refused approval, forged retirement DATA and closing an unstarted attempt never discard live originals',async()=>{
 const f=await preparedRoomRun(fixtures,'room-run-refused');let attempt;
 try{const source=await sourceByteSnapshots(),names=await databaseNames();attempt=Attempt.begin(f.f.s.owner,f.reads,f.options);await assert.rejects(retrySelectedActorCleanup(f.f.s.owner));assert.equal(selectedOwnerHasRetiredActors(f.f.s.owner),false);
  await assert.rejects(attempt.run(()=>false));for(const row of f.f.clients)assert.equal(row.core.documentJson(),row.document);await attempt.close();attempt=undefined;
  await assertSourceBytesUnchanged(source);assert.deepEqual(await databaseNames(),[...names,f.options.expected.database].sort());
  attempt=Attempt.resume(f.f.s.owner,f.reads,f.options);let enter,release;const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve);
  const waiting=attempt.run(()=>{enter();return gate;}),observed=waiting.then(()=>({ready:true}),error=>({ready:false,error}));await entered;await attempt.close();assert.equal((await observed).ready,false);release(true);attempt=undefined;for(const row of f.f.clients)assert.equal(row.core.documentJson(),row.document);
  assert.throws(()=>Attempt.begin({},f.reads,f.options));assert.throws(()=>Attempt.begin(f.f.s.owner,f.reads,{...f.options,expected:{...f.options.expected,database:f.layout.operationDatabase}}));
 }finally{await attempt?.close();await f.close();}
});
test('actual failed old cleanup retains all writer locks in the same owner and resumes only through genuine custody',async()=>{
 const f=await preparedRoomRun(fixtures,'room-run-old-cleanup',{documentSegmented:false,reviewSegmented:true});let attempt;const close=RecoveryLease.prototype.close;let injected=0,approvals=0;
 try{const source=await sourceByteSnapshots(),rows=actors(f.f);attempt=Attempt.begin(f.f.s.owner,f.reads,f.options);
  RecoveryLease.prototype.close=function(...args){if(!injected&&selectedOwnerHasRetiredActors(f.f.s.owner)){injected++;return Promise.reject(Error('Test-owned actual old cleanup failure'));}return close.apply(this,args);};
  await assert.rejects(attempt.run(()=>{approvals++;return true;}));assert.equal(injected,1);assert.equal(selectedOwnerHasRetiredActors(f.f.s.owner),true);await held(rows);assert.throws(()=>f.f.s.owner.clients);await assertSourceBytesUnchanged(source);
  RecoveryLease.prototype.close=close;const result=await attempt.run(()=>{approvals++;return true;});assert.equal(result.state,'targets-and-assets-ready');assert.equal(approvals,2);assert.equal(selectedOwnerHasRetiredActors(f.f.s.owner),false);await held(rows);await assertSourceBytesUnchanged(source);await attempt.close();await released(rows);
 }finally{RecoveryLease.prototype.close=close;await attempt?.close();await f.close();}
});
test('failed selected-upload insertion retains actual target borrowers and replays the exact existing asset stage without overwrite',async()=>{
 const f=await preparedRoomRun(fixtures,'room-run-asset-retry',{documentSegmented:true,reviewSegmented:true});let attempt;const add=IDBObjectStore.prototype.add;let injected=0,approvals=0;
 try{const source=await sourceByteSnapshots(),rows=actors(f.f),selected=new Set(f.layout.participants.map(row=>row.selectedUploadsDatabase));attempt=Attempt.begin(f.f.s.owner,f.reads,f.options);
  IDBObjectStore.prototype.add=function(...args){const q=add.apply(this,args);if(!injected&&selected.has(this.transaction.db.name)&&this.name==='assets'){injected++;this.transaction.abort();}return q;};
  await assert.rejects(attempt.run(()=>{approvals++;return true;}));assert.equal(injected,1);await held(rows);await assertSourceBytesUnchanged(source);
  IDBObjectStore.prototype.add=add;const result=await attempt.run(()=>{approvals++;return true;});assert.equal(result.state,'targets-and-assets-ready');assert.equal(approvals,2);await held(rows);await assertSourceBytesUnchanged(source);await attempt.close();await released(rows);
 }finally{IDBObjectStore.prototype.add=add;await attempt?.close();await f.close();}
});
