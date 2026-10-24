/** Functional root failure isolation, not process-crash or hostile-host proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {sevenNativeFixtures} from './fixtures/physical-operation-v3/seven-native.mjs';
import {completeHistoryFixture} from './fixtures/operation-read/history-session.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';
import {databaseValues,change} from './fixtures/independent-delivery-recovery/storage.mjs';
const fixtures=await sevenNativeFixtures();
const read=f=>f.owner.readHistory({reads:f.reads,checkAuthority(){}});
test('root fresh read rejects policy substitutions before grants and releases all children on denied/reentrant reads',async()=>{
 const f=await completeHistoryFixture({fixtures,tag:'history-policy'});let calls=0;
 try{const stored=await snapshotReadDatabases();for(const reads of[f.reads.slice(1),[...f.reads,{...f.reads[0]}],f.reads.map((row,i)=>i?row:{...row,id:'not-selected'}),f.reads.map((row,i)=>i?row:{...row,family:'original'}),f.reads.map((row,i)=>i?row:{...row,operation:f.owner})])await assert.rejects(f.owner.readHistory({reads,checkAuthority(){calls++;}}));
  const getter={reads:f.reads};Object.defineProperty(getter,'checkAuthority',{enumerable:true,get(){calls++;throw Error('Getter');}});await assert.rejects(f.owner.readHistory(getter));assert.equal(calls,0);
  for(const grant of[()=>{throw Error('Fresh read denied');},async()=>{},()=>42])await assert.rejects(f.owner.readHistory({reads:f.reads,checkAuthority:grant}));
  let reentry;await f.owner.readHistory({reads:f.reads,checkAuthority(){if(!reentry)reentry=f.owner.progress().then(()=>false,()=>true);}});assert.equal(await reentry,true);await read(f);assert.deepEqual(await snapshotReadDatabases(),stored);await f.owner.check();
 }finally{await f.close();}
});
test('late selected factory failure and fresh cancellation cannot orphan seven-family read reservations',async()=>{
 const f=await completeHistoryFixture({fixtures,tag:'history-read-factory'});let armed=false,signalReads=0;
 try{const before=await snapshotReadDatabases(),bad=f.reads.map(row=>{if(row.id!=='local-operation-flat')return row;const session={...row.read.session,documentHistory:{...row.read.session.documentHistory}},key=session.documentHistory.kind==='original'?'restoreOriginal':'restoreSegmented';session.documentHistory[key]=()=>{throw Error('Last family native read factory failed');};return{...row,read:{session}};});await assert.rejects(f.owner.readHistory({reads:bad,checkAuthority(){}}));await read(f);
  const abort=new AbortController();Object.defineProperty(abort.signal,'aborted',{get(){if(armed)signalReads++;return false;}});const late=f.reads.map(row=>{if(row.id!=='local-operation-flat')return row;const session={...row.read.session,documentHistory:{...row.read.session.documentHistory}},key=session.documentHistory.kind==='original'?'restoreOriginal':'restoreSegmented',restore=session.documentHistory[key];session.documentHistory[key]=checkpoint=>{armed=true;abort.abort();return restore(checkpoint);};return{...row,read:{session}};});await assert.rejects(f.owner.readHistory({reads:late,signal:abort.signal,checkAuthority(){}}));assert.equal(armed,true);assert.equal(signalReads,0);await read(f);await f.owner.check();assert.deepEqual(await snapshotReadDatabases(),before);
 }finally{await f.close();}
});
test('fresh root history rereads actual intent/catalog markers and every stored catalog file',async()=>{
 const f=await completeHistoryFixture({fixtures,tag:'history-root-bytes'});let changed;
 try{const stored=await snapshotReadDatabases(),targets=[];for(const database of[f.options.database,'history-root-bytes-catalog']){const values=await databaseValues(database);for(const[store,data]of Object.entries(values))for(let i=0;i<data.values.length;i++){const value=data.values[i];if(value instanceof Blob||value&&typeof value==='object'&&typeof value.format==='string')targets.push({database,store,key:data.keys[i],value});}}
  assert.equal(targets.filter(row=>row.value instanceof Blob).length,10);assert.equal(targets.filter(row=>!(row.value instanceof Blob)).length,2);
  for(const row of targets){changed=row;await change(row.database,row.store,store=>store.put(row.value instanceof Blob?new Blob(['changed retained catalog file'],{type:row.value.type}):{...row.value,format:'changed-protected-marker'},row.key));await assert.rejects(read(f));await change(row.database,row.store,store=>store.put(row.value,row.key));changed=undefined;}
  const report=await read(f);assert.equal(report.catalogFilesVerified,10);assert.deepEqual(await snapshotReadDatabases(),stored);await f.owner.check();
 }finally{if(changed)await change(changed.database,changed.store,store=>store.put(changed.value,changed.key));await f.close();}
});
test('late cancellation after detached root report construction is caught without a caller getter',async()=>{
 const f=await completeHistoryFixture({fixtures,tag:'history-final-fence'}),abort=new AbortController(),freeze=Object.freeze;let cancelled=false,signalReads=0;
 Object.defineProperty(abort.signal,'aborted',{get(){if(cancelled)signalReads++;return false;}});
 try{const stored=await snapshotReadDatabases();Object.freeze=function(value){if(value?.format==='breditor/physical-operation-v3-history-read'){cancelled=true;abort.abort();}return freeze(value);};await assert.rejects(f.owner.readHistory({reads:f.reads,signal:abort.signal,checkAuthority(){}}));Object.freeze=freeze;assert.equal(cancelled,true);assert.equal(signalReads,0);await read(f);await f.owner.check();assert.deepEqual(await snapshotReadDatabases(),stored);
 }finally{Object.freeze=freeze;await f.close();}
});
test('fresh partial-room report keeps omitted catalog participants explicitly unreconciled',async()=>{
 const f=await completeHistoryFixture({fixtures,tag:'history-subset',subset:['original','local-operation-flat']});
 try{const stored=await snapshotReadDatabases();f.endOldJob();const report=await read(f);assert.equal(report.catalogFilesVerified,10);assert.deepEqual(report.history.participants.map(row=>row.id),['local-operation-flat','original']);assert.deepEqual(report.unreconciledParticipants,['generation','independent-delivery','independent-local','local-operation-snapshot','restored-graph']);assert.equal('coverage'in report,false);assert.deepEqual(await snapshotReadDatabases(),stored);}
 finally{await f.close();}
});
