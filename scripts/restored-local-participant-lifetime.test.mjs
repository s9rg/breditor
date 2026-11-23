/** Actual current-policy, native/upload custody and retryable parent cleanup. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {IDBDatabase} from 'fake-indexeddb';
import * as api from '../packages/breditor-collaboration/dist/index.js';import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentLocalParticipant as OldParent} from '../packages/breditor-collaboration/dist/independent_local_operation/participant.js';import {captureLocalOperationBackup as capture} from '../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js';
import {DetachedRestoredLocalInput as Input} from '../packages/breditor-collaboration/dist/restored_local_operation/input.js';
import {RecoveryLease} from '../packages/breditor-collaboration/dist/participant_recovery/lease.js';
import {localParticipantUnitHost} from './fixtures/independent-local-operation/participant.mjs';import {restoredLocalFixture} from './fixtures/restored-local-operation/session.mjs';
import {insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';import {pixel,secondAsset} from './fixtures/review-assets/pixels.mjs';
import {RestoredLocalOperationJournal as Journal,openRestoredLocalJournalForParticipant as openRestoredLocalJournalForParent} from '../packages/breditor-collaboration/dist/restored_local_operation/journal.js';import {openRestoredLocalUploadsForParticipant as openRestoredLocalUploadsForParent} from '../packages/breditor-collaboration/dist/restored_local_operation/participant_assets.js';
import {OperationalRestoredLocalParticipant as Parent} from '../packages/breditor-collaboration/dist/restored_local_operation/participant.js';
const runtime=process.env.BREDITOR_RESTORED_LOCAL_PARTICIPANT_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname,bytes=async file=>Buffer.from(await file.arrayBuffer());let host;const options=f=>({...f.options,cohort:{parentDatabase:f.value.f.tag+'-restored-parent',uploadsDatabase:f.value.f.tag+'-restored-uploads'}});
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant:OldParent,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});after(()=>host?.free());

test('all four namespaces precede authority reentry; fake parent flags issue no child opening',async()=>{
 const f=await restoredLocalFixture(host,capture);let p,input,armed=true,calls=0;const nested=[];
 try{const o=options(f);input=await Input.read(f.file,o);const before=await indexedDB.databases(),denied={...o,checkAuthority(){calls++;}};await assert.rejects(openRestoredLocalJournalForParent({ready:true},denied,f.file));await assert.rejects(openRestoredLocalUploadsForParent({ready:true},input,{database:o.cohort.uploadsDatabase,checkAuthority(){calls++;}},false));assert.equal(calls,0);assert.deepEqual(await indexedDB.databases(),before);
  p=await Parent.begin(f.file,{...o,checkAuthority(){if(armed){armed=false;nested.push(Parent.resume(o).then(()=>assert.fail('Nested parent escaped'),error=>assert.equal(error.code,'restored_local_participant_busy')));}}});await Promise.all(nested);assert.equal(nested.length,1);await p.check();
 }finally{await p?.discardAndClose();input?.dispose();await f.close();}
});
test('the whole source factory and destination choice is snapshotted before authority',async()=>{
 const f=await restoredLocalFixture(host,capture);let p,reads=0,armed=true;
 try{const o=options(f),mutable={...o.sourceFactory,documentHistory:{...o.sourceFactory.documentHistory},review:{...o.sourceFactory.review}},provided={...o,get sourceFactory(){reads++;return mutable;},checkAuthority(){if(armed){armed=false;mutable.documentHistory.restoreSegmented=()=>{throw Error('Late native factory');};mutable.review.actor='late';provided.database='late-journal';}}};p=await Parent.begin(f.file,provided);assert.equal(reads,1);assert.deepEqual(p.readableSource(),f.value.live);await p.check();}
 finally{await p?.discardAndClose();await f.close();}
});
test('a denied last namespace-release grant preserves actual upload exclusion and source for retry',async()=>{
 const f=await restoredLocalFixture(host,capture),close=RecoveryLease.prototype.close;let p,parts,foreign,allowed=true,armed=false,fired=false;
 try{const o=options(f);p=await Parent.begin(f.file,{...o,checkAuthority(){if(!allowed)throw Error('Final parent grant ended');}});foreign=await rich.RichAssetStore.openRetained(o.cohort.uploadsDatabase);RecoveryLease.prototype.close=async function(){const result=await close.call(this);if(armed&&!fired){fired=true;allowed=false;}return result;};armed=true;await assert.rejects(p.intoParts());assert.equal(fired,true);assert.deepEqual(p.readableSource(),f.value.live);assert.deepEqual(await bytes(p.blob(f.value.f.reference.asset,f.value.f.reference.generation)),pixel);await assert.rejects(foreign.cancel(secondAsset),error=>error.code==='asset_custody_busy');RecoveryLease.prototype.close=close;allowed=true;parts=await p.intoParts();await parts.uploads.cancel(secondAsset);await foreign.retry(secondAsset);insertCleanupText(parts.source.session.core,'After denied parent handoff ');await parts.source.session.flush();}
 finally{RecoveryLease.prototype.close=close;allowed=true;await parts?.source.session.discardAndClose();parts?.uploads.close();foreign?.close();await p?.discardAndClose();await f.close();}
});
test('a transient namespace-release failure retries the same real owners',async()=>{
 const f=await restoredLocalFixture(host,capture),close=RecoveryLease.prototype.close;let p,parts,foreign,failOnce=true;
 try{const o=options(f);p=await Parent.begin(f.file,o);foreign=await rich.RichAssetStore.openRetained(o.cohort.uploadsDatabase);RecoveryLease.prototype.close=async function(){if(failOnce){failOnce=false;throw Error('One real namespace release failed');}return close.call(this);};await assert.rejects(p.intoParts());await assert.rejects(foreign.cancel(secondAsset),error=>error.code==='asset_custody_busy');assert.deepEqual(p.readableSource(),f.value.live);RecoveryLease.prototype.close=close;parts=await p.intoParts();await parts.uploads.cancel(secondAsset);assert.deepEqual(await bytes(parts.input.file()),await bytes(f.file));}
 finally{RecoveryLease.prototype.close=close;await parts?.source.session.discardAndClose();parts?.uploads.close();foreign?.close();await p?.discardAndClose();await f.close();}
});
for(const lane of ['document','review'])test(`actual ${lane} changes inside the last grant refuse a stale parent handoff`,async()=>{
 const f=await restoredLocalFixture(host,capture),close=RecoveryLease.prototype.close;
 const session=api.SharedIndependentHistoryPersistentSession.prototype,flush=session.flush,opened=[];
 let p,parts,foreign,nativeSource,armed=false,fired=false;
 try{
  const o=options(f);
  // Observe the real session's initial flush, after production captures its
  // static opening intrinsic. Keep every native and storage operation intact.
  session.flush=async function(){await flush.call(this);opened.push(this);};
  try{p=await Parent.begin(f.file,{...o,checkAuthority(){if(armed&&!fired){fired=true;if(lane==='document')insertCleanupText(nativeSource.core,'Final parent native mutation ');else nativeSource.core.dispatchReview({kind:'create_thread',data:{anchorJson:nativeSource.core.captureReviewAnchor({kind:'document'}),body:'Final parent review mutation'}});}}});}
  finally{session.flush=flush;}
  assert.equal(opened.length,1);
  [nativeSource]=opened;
  assert.deepEqual(nativeSource.exportRecovery(),f.value.live);
  foreign=await rich.RichAssetStore.openRetained(o.cohort.uploadsDatabase);
  RecoveryLease.prototype.close=async function(){const result=await close.call(this);armed=true;return result;};
  await assert.rejects(p.intoParts(),error=>error.code==='restored_local_handoff_changed');
  assert.equal(fired,true);
  await assert.rejects(foreign.cancel(secondAsset),error=>error.code==='asset_custody_busy');
  RecoveryLease.prototype.close=close;armed=false;
  await nativeSource.flush();await p.check();parts=await p.intoParts();
  assert.equal(parts.source.session,nativeSource);
  assert.notDeepEqual(parts.source.session.exportRecovery(),f.value.live);
 }
 finally{RecoveryLease.prototype.close=close;armed=false;await parts?.source.session.discardAndClose();parts?.uploads.close();foreign?.close();await p?.discardAndClose();await f.close();}
});
test('a denied final parent-handle close reopens only actual retained storage on retry',async()=>{
 const f=await restoredLocalFixture(host,capture),close=IDBDatabase.prototype.close;let p,parts,foreign,allowed=true,armed=false,fired=false;
 try{const o=options(f);p=await Parent.begin(f.file,{...o,checkAuthority(){if(!allowed)throw Error('Final handle grant ended');}});foreign=await rich.RichAssetStore.openRetained(o.cohort.uploadsDatabase);IDBDatabase.prototype.close=function(){const result=close.call(this);if(armed&&!fired&&this.name===o.cohort.parentDatabase){fired=true;allowed=false;}return result;};armed=true;await assert.rejects(p.intoParts());assert.equal(fired,true);assert.deepEqual(p.readableSource(),f.value.live);await assert.rejects(foreign.cancel(secondAsset),error=>error.code==='asset_custody_busy');IDBDatabase.prototype.close=close;allowed=true;await p.check();parts=await p.intoParts();assert.deepEqual(await bytes(parts.input.blob(f.value.f.reference.asset,f.value.f.reference.generation)),pixel);}
 finally{IDBDatabase.prototype.close=close;allowed=true;await parts?.source.session.discardAndClose();parts?.uploads.close();foreign?.close();await p?.discardAndClose();await f.close();}
});
test('retired input-wrapper disposal can deny the last barrier without losing independent baselines',async()=>{
 const f=await restoredLocalFixture(host,capture),dispose=rich.RichAssetArchive.prototype.dispose,close=RecoveryLease.prototype.close;let p,parts,allowed=true,armed=false,fired=false;
 try{const o=options(f);p=await Parent.begin(f.file,{...o,checkAuthority(){if(!allowed)throw Error('Input wrapper disposal denied final grant');}});rich.RichAssetArchive.prototype.dispose=function(){const result=dispose.call(this);if(armed&&!fired){fired=true;allowed=false;}return result;};RecoveryLease.prototype.close=async function(){const result=await close.call(this);armed=true;return result;};await assert.rejects(p.intoParts());assert.equal(fired,true);assert.deepEqual(p.readableSource(),f.value.live);assert.deepEqual(await bytes(p.blob(f.value.f.reference.asset,f.value.f.reference.generation)),pixel);rich.RichAssetArchive.prototype.dispose=dispose;RecoveryLease.prototype.close=close;allowed=true;await p.check();parts=await p.intoParts();insertCleanupText(parts.source.session.core,'After independent input disposal ');await parts.source.session.flush();}
 finally{rich.RichAssetArchive.prototype.dispose=dispose;RecoveryLease.prototype.close=close;allowed=true;await parts?.source.session.discardAndClose();parts?.uploads.close();await p?.discardAndClose();await f.close();}
});
test('failed source-owned journal cleanup retries rather than recreating a native editor',async()=>{
 const f=await restoredLocalFixture(host,capture),close=RecoveryLease.prototype.close;let p,failOnce=true;
 try{const o=options(f);p=await Parent.begin(f.file,o);RecoveryLease.prototype.close=async function(){if(failOnce){failOnce=false;throw Error('Source journal release failed');}return close.call(this);};await assert.rejects(p.close());RecoveryLease.prototype.close=close;await p.close();p=await Parent.resume(o);assert.deepEqual(p.readableSource(),f.value.live);await p.check();}
 finally{RecoveryLease.prototype.close=close;await p?.discardAndClose();await f.close();}
});
test('ordinary parent close waits for the actual upload callback before releasing parent namespaces',async()=>{
 const f=await restoredLocalFixture(host,capture),request=navigator.locks.request;let p,closing,arrive,release;const reached=new Promise(resolve=>{arrive=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 try{const o=options(f);navigator.locks.request=function(name,options,run){const actual=request.call(this,name,options,run);return name==='breditor/assets-custody/'+o.cohort.uploadsDatabase&&options.mode==='exclusive'?actual.then(async value=>{arrive();await gate;return value;}):actual;};p=await Parent.begin(f.file,o);let done=false;closing=p.close().then(()=>{done=true;});await reached;assert.equal(done,false);await assert.rejects(RecoveryLease.acquire(JSON.stringify(o.cohort.parentDatabase)),error=>error.code==='recovery_in_use');release();await closing;p=await Parent.resume(o);await p.check();}
 finally{release();await closing;navigator.locks.request=request;await p?.discardAndClose();await f.close();}
});
