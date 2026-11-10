/** Actual native histories, complete source/packet cuts, both upload generations
 * and authenticated owned native controls. No reconstructed core or fake server.
 * Setup exchanges are explicit; the new reader must never synchronize anything. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {generationCompleteControlFixtures} from './fixtures/generation-recovery-control/complete-fixtures.mjs';
import {completeControlTransport} from './fixtures/physical-recovery-control/complete-transport.mjs';
import {generationSelectedSession as selectedProviderSession,selectedNativePairs,selectStart} from './fixtures/selected-generation-reconciliation/session.mjs';
import {generationBoundSession as allBoundSession} from './fixtures/selected-generation-reconciliation/all-bound.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';
import {UnavailableUploadImage,unavailableUpload,unavailableAsset} from './fixtures/physical-recovery-control/unavailable-upload.mjs';
import {RetainedPhysicalRoot as Root} from '../packages/breditor-collaboration/dist/physical_room_operation_v3/retained_root.js';
let fixtures,transport,sequence=0;
before(async()=>{fixtures=await generationCompleteControlFixtures(new URL('../',import.meta.url).pathname);transport=completeControlTransport(fixtures.manifest);});
after(async()=>{transport?.restore();await fixtures?.close();});
const tag=()=> 'selected-generation-reconciliation-'+sequence++;
const read=(s,extra={})=>s.owner.readGenerationReconciliation(s.host,{...s.input(),...extra});
function counts(native){let documents=0,documentBehind=0,reviews=0,reviewBehind=0,unbound=0,retainedStores=0;for(const row of native.participants){assert.equal(row.documentHeads.length,native.documentAuthors.length);documents+=row.documentHeads.length;documentBehind+=row.documentHeads.filter((head,i)=>BigInt(head)<BigInt(native.documentAuthors[i].acceptedThrough)).length;assert.equal(row.review.heads.length,row.review.kind==='bound'?native.reviewAuthors.length:0);reviews+=row.review.heads.length;reviewBehind+=row.review.heads.filter((head,i)=>BigInt(head)<BigInt(native.reviewAuthors[i].acceptedThrough)).length;unbound+=Number(row.review.kind==='unbound');retainedStores+=row.retainedStores.length;}return{documents,documentBehind,reviews,reviewBehind,unbound,retainedStores};}
function frozen(value){if(value!==null&&typeof value==='object'){assert.ok(Object.isFrozen(value));for(const row of Object.values(value))frozen(row);}}
function futureUndo(owner){for(const row of owner.clients){const document=row.core.documentJson();assert.equal(row.core.redo(),true);assert.equal(row.core.undo(),true);assert.equal(row.core.documentJson(),document);assert.equal(row.core.redoReview().kind,'committed');assert.equal(row.core.undoReview().kind,'committed');}}
// Every current profile/wire pair is independently prepared by the native
// producer. Both original digest semantics remain authoritative, not translated.
for(let index=0;index<10;index++)test('all seven bound clients check every accepted author: native profile/wire '+index,async()=>{
 const s=await allBoundSession(fixtures,tag(),{item:fixtures.manifest.cases[index]});try{const native=selectedNativePairs(s.owner,false),db=await snapshotReadDatabases(),report=await read(s);assert.equal(report.kind,report.heads.length?'pending':'checked');assert.equal(report.native.kind,'covered');assert.equal(report.format,'breditor/selected-generation-reconciliation-read');assert.equal(Object.hasOwn(report.provider.control.source,'ancestor'),false);assert.equal(Object.hasOwn(report.provider.control.source,'localOrigin'),false);for(const requirement of report.heads){assert.equal(requirement.relation,'local-ahead');assert.ok(BigInt(requirement.localThrough)>BigInt(requirement.acceptedThrough));}assert.equal(report.native.ownStreams.kind,'covered');assert.equal(report.provider.kind,'checked');assert.equal(report.native.participants.length,7);assert.equal(report.native.documentAuthors.filter(row=>row.kind==='registered').length,7);assert.equal(report.native.reviewAuthors.length,7);const tally=counts(report.native);assert.equal(tally.documentBehind,0);assert.equal(tally.reviewBehind,0);assert.equal(tally.documents,7*report.native.documentAuthors.length);assert.equal(tally.reviews,49);assert.equal(tally.unbound,0);assert.equal(tally.retainedStores,fixtures.fixture(fixtures.manifest.cases[index]).atomic?21:7);assert.equal(report.provider.uploads.length,14);assert.deepEqual(selectedNativePairs(s.owner,false),native);assert.deepEqual(await snapshotReadDatabases(),db);frozen(report);assert.equal('activate'in report,false);assert.equal('clients'in report,false);assert.equal('receipt'in report,false);futureUndo(s.owner);}finally{await s.close();}
});
for(const[documentSegmented,reviewSegmented]of[[false,false],[false,true],[true,false],[true,true]])test('all seven family coverage stays pending for genuinely missing peers/unbound lanes '+documentSegmented+'/'+reviewSegmented,async()=>{
 const s=await selectedProviderSession(fixtures,tag(),{documentSegmented,reviewSegmented});try{const native=selectedNativePairs(s.owner,reviewSegmented),db=await snapshotReadDatabases(),report=await read(s);assert.equal(report.kind,'pending');assert.equal(report.native.kind,'pending');assert.equal(report.provider.kind,'checked');assert.deepEqual(counts(report.native),{documents:63,documentBehind:21,reviews:28,reviewBehind:24,unbound:3,retainedStores:12});assert.deepEqual(selectedNativePairs(s.owner,reviewSegmented),native);assert.deepEqual(await snapshotReadDatabases(),db);futureUndo(s.owner);}finally{await s.close();}
});
for(const lane of['document','review'])test('genuine foreign '+lane+' author fork refuses before provider I/O even if other peer prefixes are behind',async()=>{
 const s=await allBoundSession(fixtures,tag(),{converge:false,...(lane==='document'?{forkPeer:true}:{forkReview:true})});try{const native=selectedNativePairs(s.owner,false),db=await snapshotReadDatabases();assert.equal((await s.owner.capture(s.input())).uploads.length,7);const calls=transport.requests.length;await assert.rejects(read(s),error=>error.code==='inventory_fork');assert.equal(transport.requests.length,calls);assert.deepEqual(selectedNativePairs(s.owner,false),native);assert.deepEqual(await snapshotReadDatabases(),db);futureUndo(s.owner);}finally{await s.close();}
});
test('partial room cannot send a subset as complete provider availability',async()=>{
 const s=await selectedProviderSession(fixtures,tag(),{subset:['original','local-operation-flat'],documentSegmented:false,reviewSegmented:false});try{const native=selectedNativePairs(s.owner,false),db=await snapshotReadDatabases(),start=transport.requests.length,report=await read(s);assert.equal(report.kind,'pending');assert.equal(report.native.kind,'pending');assert.equal(report.native.participants.length,2);assert.ok(report.native.ownStreams.unreconciledParticipants.length>0);assert.equal(report.provider.provider,null);assert.ok(transport.requests.length>start);assert.equal(transport.requests.slice(start).some(row=>row.assets),false);assert.deepEqual(selectedNativePairs(s.owner,false),native);assert.deepEqual(await snapshotReadDatabases(),db);}finally{await s.close();}
});
test('cold selected owner keeps later offline edits, comments and unreferenced receipts without claiming global coverage',async()=>{
 const s=await selectedProviderSession(fixtures,tag(),{documentSegmented:true,reviewSegmented:true});
 try{
  const basis=await s.retain();
  const oldCores=new Set(s.owner.clients.map(row=>row.core));
  assert.equal(oldCores.size,7);
  for(const row of s.owner.clients){
   selectStart(row.core);
   row.core.type('later offline reconciliation work ');
   assert.equal(row.core.redoReview().kind,'committed');
  }
  Object.defineProperty(globalThis,'Image',{value:UnavailableUploadImage,configurable:true});
  const id=s.owner.clients.at(-1).id;
  await s.owner.assets(id).ingest(new Blob([unavailableUpload],{type:'image/png'}));
  await s.owner.assets(id).flush(async()=> 'earned-offline-reconciliation-not-provider-proof');
  const native=selectedNativePairs(s.owner,true),oldAuthorityCalls=s.f.oldCalls;
  let freshAuthorityCalls=0;
  await s.cold(basis,{checkAuthority(){freshAuthorityCalls++;}});
  assert.ok(freshAuthorityCalls>0);
  assert.equal(s.f.oldCalls,oldAuthorityCalls);
  assert.ok(s.owner.clients.every(row=>!oldCores.has(row.core)));
  const db=await snapshotReadDatabases(),report=await read(s);
  assert.equal(report.kind,'pending');
  assert.equal(report.provider.kind,'pending');
  assert.ok(report.provider.provider.missing.some(row=>row.kind==='uploadBytes'&&row.contentAsset===unavailableAsset));
  assert.equal((await s.owner.assets(id).get(unavailableAsset)).storageRef,'earned-offline-reconciliation-not-provider-proof');
  assert.deepEqual(selectedNativePairs(s.owner,true),native);
  assert.deepEqual(await snapshotReadDatabases(),db);
  for(const row of s.owner.clients){
   const document=row.core.documentJson();
   assert.equal(row.core.undo(),true);
   assert.doesNotMatch(row.core.documentJson(),/later offline reconciliation work/);
   assert.equal(row.core.redo(),true);
   assert.equal(row.core.documentJson(),document);
   assert.equal(row.core.undoReview().kind,'committed');
   assert.equal(row.core.redoReview().kind,'committed');
  }
 }finally{await s.close();}
});
test('fresh denied operator, abort and close during authentication cannot publish the combined report',async()=>{
 const s=await selectedProviderSession(fixtures,tag(),{subset:['original','local-operation-flat'],documentSegmented:false,reviewSegmented:false});let closing;try{const db=await snapshotReadDatabases(),native=selectedNativePairs(s.owner,false);s.allowToken(false);await assert.rejects(read(s));s.allowToken(true);assert.deepEqual(await snapshotReadDatabases(),db);const controller=new AbortController();s.onToken(()=>controller.abort());await assert.rejects(read(s,{signal:controller.signal}));assert.deepEqual(selectedNativePairs(s.owner,false),native);assert.deepEqual(await snapshotReadDatabases(),db);assert.equal((await read(s)).kind,'pending');s.onToken(()=>{closing=s.owner.close();});await assert.rejects(read(s));await closing;assert.deepEqual(await snapshotReadDatabases(),db);}finally{await closing;await s.close();}
});
test('the selected owner uses the canonical genuine root visitor, not an overridden report-producing method',async()=>{
 const s=await selectedProviderSession(fixtures,tag(),{subset:['original','local-operation-flat'],documentSegmented:false,reviewSegmented:false}),original=Root.prototype.visitReconciliationRecordCut;let calls=0;try{Root.prototype.visitReconciliationRecordCut=()=>{calls++;return Promise.resolve({native:{kind:'covered'},kind:'checked'});};const report=await read(s);assert.equal(calls,0);assert.equal(report.kind,'pending');assert.equal(report.native.participants.length,2);}finally{Root.prototype.visitReconciliationRecordCut=original;await s.close();}
});
// A real selected-store release acknowledgement is held after its genuine
// callback finishes. Native changes here are no longer inside temporary source
// reservations: only the final root-owned witness can catch the stale report.
for(const how of['abort','close','document','review'])test('actual '+how+' after selected release cannot publish stale reconciliation',async()=>{
 const s=await allBoundSession(fixtures,tag()),controller=new AbortController(),locks=navigator.locks,original=locks.request,target='breditor/assets-custody/'+s.owner.approval().choice.adoption.participants[0].targetDatabase;let work,closing,finish,delayed=false,entered;
 const atRelease=new Promise(resolve=>{entered=resolve;}),release=new Promise(resolve=>{finish=resolve;});
 try{const core=s.owner.clients[0].core,documentBefore=core.documentJson(),before=selectedNativePairs(s.owner,false),db=await snapshotReadDatabases();locks.request=function(name,options,run){const result=original.call(this,name,options,run);if(name===target&&!delayed){delayed=true;return result.then(async value=>{entered();await release;return value;});}return result;};work=read(s,{signal:controller.signal});await Promise.race([atRelease,work.then(()=>{throw Error('Reader published before actual selected release');})]);const refused=assert.rejects(work,error=>how==='abort'?/aborted/.test(error.code??''):how==='close'?/closed/.test(error.code??''):error.code==='inventory_source');if(how==='abort')controller.abort();else if(how==='close'){closing=s.owner.close();assert.throws(()=>core.type('retired synchronously'));}else if(how==='document'){selectStart(core);core.type('new native edit after cleanup ');}else assert.equal(core.redoReview().kind,'committed');finish();await refused;await closing;if(how==='abort'||how==='close')assert.deepEqual(await snapshotReadDatabases(),db);if(how!=='close'){if(how==='document'){const changed=core.documentJson();assert.match(changed,/new native edit after cleanup/);assert.equal(core.undo(),true);assert.equal(core.documentJson(),documentBefore);assert.equal(core.redo(),true);assert.equal(core.documentJson(),changed);}else if(how==='review'){assert.notDeepEqual(selectedNativePairs(s.owner,false),before);assert.equal(core.undoReview().kind,'committed');}else assert.deepEqual(selectedNativePairs(s.owner,false),before);assert.equal((await read(s)).native.kind,'covered');}}finally{finish?.();await work?.catch(()=>{});await closing;if(original)locks.request=original;await s.close();}
});
test('fresh independent permission runs after real cleanup and cannot mutate native state or cancel unnoticed',async()=>{
 const s=await allBoundSession(fixtures,tag()),locks=navigator.locks,original=locks.request,target='breditor/assets-custody/'+s.owner.approval().choice.adoption.participants[0].targetDatabase;
 try{const core=s.owner.clients[0].core;for(const how of['deny','falsey','abort','document','review']){let released=false,acted=false;const controller=new AbortController(),document=core.documentJson(),native=selectedNativePairs(s.owner,false),db=await snapshotReadDatabases();locks.request=function(name,options,run){const result=original.call(this,name,options,run);return name===target?result.then(value=>{released=true;return value;}):result;};const work=read(s,{signal:controller.signal,checkAuthority(){if(!released||acted)return;acted=true;if(how==='deny')throw Error('Final independent read permission refused');if(how==='falsey')throw undefined;if(how==='abort')controller.abort();else if(how==='document'){selectStart(core);core.type('final callback native edit ');}else core.redoReview();}});await assert.rejects(work,error=>how==='deny'||how==='falsey'?error.code==='participant_authority':how==='abort'?/aborted/.test(error.code??''):error.code==='inventory_source');assert.equal(acted,true);locks.request=original;if(how==='document'){assert.match(core.documentJson(),/final callback native edit/);assert.equal(core.undo(),true);assert.equal(core.documentJson(),document);}else if(how==='review'){assert.notDeepEqual(selectedNativePairs(s.owner,false),native);assert.equal(core.undoReview().kind,'committed');}else{assert.deepEqual(selectedNativePairs(s.owner,false),native);assert.deepEqual(await snapshotReadDatabases(),db);}assert.equal((await read(s)).native.kind,'covered');}}
 finally{locks.request=original;await s.close();}
});
