/** Real revision commitment, dependent queue bridging and original final winners
 * across source-owned write faults. No receipt/effect/clock is fabricated. */
import test from 'node:test';import assert from 'node:assert/strict';
import {nativeSuggestionSession,families} from './fixtures/native-suggestion-delivery/session.mjs';
const setup=family=>({family,scope:'document-v1',natural:true,owned:true,choice:null,withRevisions:true,prepare:family.kind!=='original'});
const count=f=>f.requests.filter(r=>r.kind==='suggestionRevisionPublish').length;
for(const family of families){
 test(family.name+': an aborted original outbox receipt retains its actual server winner and exact retry',{timeout:120000},()=>nativeSuggestionSession(setup(family),async f=>{
  f.suggestions=f.openNative();f.nativeRevision=f.openRevision();let armed=false;const off=f.nativeRevision.subscribe(()=>{if(!armed&&f.nativeRevision.status(f.revisionInfo.id).receipt){armed=true;f.faults.abortDatabase=family.kind==='original'?f.revisionDatabase:f.database;}});
  try{await assert.rejects(f.nativeRevision.connect(),e=>e.code==='local_save_failed');}finally{off();}
  assert.equal(armed,true);const status=f.nativeRevision.status(f.revisionInfo.id);assert.ok(status.receipt);assert.equal(status.retry,false);assert.equal(status.localSaved,false);assert.equal((await f.durableOutbox()).retained[0].receipt,null);assert.equal(count(f),1);assert.throws(()=>f.queue.packet(f.revisionInfo.suggestion.id),e=>e.code==='suggestion_unknown');
  await f.nativeRevision.retryLocal();await f.nativeRevision.connect();assert.equal(f.nativeRevision.status(f.revisionInfo.id).localSaved,true);assert.deepEqual(f.nativeRevision.status(f.revisionInfo.id).receipt,status.receipt);assert.equal(f.queue.packet(f.revisionInfo.suggestion.id),f.childPacket);assert.equal(count(f),1);await f.finishAndCold();f.evidence('outbox-abort');
 }));
 test(family.name+': authority loss after committed outbox bytes preserves durable facts and fresh retry',{timeout:120000},()=>nativeSuggestionSession(setup(family),async f=>{
  f.suggestions=f.openNative();f.nativeRevision=f.openRevision();let staged=false,committed=false;const off=f.nativeRevision.subscribe(()=>{if(f.nativeRevision.status(f.revisionInfo.id).receipt)staged=true;});
  f.faults.transaction=(name,tx)=>{if(staged&&!committed&&name===(family.kind==='original'?f.revisionDatabase:f.database))tx.addEventListener('complete',()=>{if(!committed){committed=true;f.authorize(false);}});};
  try{await assert.rejects(f.nativeRevision.connect());}finally{off();f.faults.transaction=undefined;}
  assert.equal(committed,true);const status=f.nativeRevision.status(f.revisionInfo.id);assert.ok(status.receipt);assert.equal(status.localSaved,true);assert.deepEqual((await f.durableOutbox()).retained[0].receipt,status.receipt);assert.equal(count(f),1);
  f.authorize(true);await f.renewNative();f.suggestions=f.openNative();f.nativeRevision=f.openRevision();await f.nativeRevision.retryLocal();await f.nativeRevision.connect();assert.deepEqual(f.nativeRevision.status(f.revisionInfo.id).receipt,status.receipt);assert.equal(count(f),1);assert.equal(f.queue.packet(f.revisionInfo.suggestion.id),f.childPacket);await f.finishAndCold();f.evidence('postcommit-authority');
 }));
 test(family.name+': a lost authentic revision reply is resolved from its original committed feed',{timeout:120000},()=>nativeSuggestionSession(setup(family),async f=>{
  f.suggestions=f.openNative();f.nativeRevision=f.openRevision();let dropped=false,receipt;
  f.faults.reply=(envelope,_deliver,socket)=>{const result=envelope.result;if(!dropped&&result.kind==='suggestionRevisionAdmission'&&result.admission.kind==='durable'){dropped=true;receipt=result.admission.revision;f.authorize(false);socket.close();return true;}return false;};
  await assert.rejects(f.nativeRevision.connect());assert.equal(dropped,true);assert.equal(f.nativeRevision.status(f.revisionInfo.id).receipt,null);assert.equal(f.nativeRevision.status(f.revisionInfo.id).retry,true);assert.equal(count(f),1);
  f.faults.reply=undefined;f.authorize(true);await f.renewNative();f.suggestions=f.openNative();f.nativeRevision=f.openRevision();await f.nativeRevision.connect();assert.deepEqual(f.nativeRevision.status(f.revisionInfo.id).receipt,receipt);assert.equal(f.nativeRevision.status(f.revisionInfo.id).localSaved,true);assert.equal(count(f),1);await f.finishAndCold();f.evidence('lost-revision-reply');
 }));
 test(family.name+': a failed child-cache bridge retries original records without resubmitting its committed revision',{timeout:120000},()=>nativeSuggestionSession(setup(family),async f=>{
  f.suggestions=f.openNative();f.nativeRevision=f.openRevision();let armed=false;const off=f.queue.subscribe(()=>{if(!armed&&f.queue.proposals().some(info=>info.id===f.revisionInfo.suggestion.id)){armed=true;f.faults.abortDatabase=family.kind==='original'?f.queueDatabase:f.database;}});
  try{await assert.rejects(f.nativeRevision.connect(),e=>e.code==='local_save_failed');}finally{off();}
  assert.equal(armed,true);assert.equal(f.nativeRevision.status(f.revisionInfo.id).localSaved,true);assert.equal(f.queue.status(f.revisionInfo.suggestion.id).localSaved,false);assert.equal(f.nativeRevision.state().status,'local-save-failed');assert.equal(count(f),1);
  await f.nativeRevision.retryLocal();await f.nativeRevision.connect();assert.equal(f.queue.status(f.revisionInfo.suggestion.id).localSaved,true);assert.equal(count(f),1);await f.finishAndCold();f.evidence('child-bridge-abort');
 }));
 test(family.name+': an actual final Accept retains the losing original revision without publishing its child',{timeout:120000},()=>nativeSuggestionSession({...setup(family),choice:'accept'},async f=>{
  f.suggestions=f.openNative();await f.suggestions.connect();await f.suggestions.flushShared();const accepted=f.source.core.documentJson();f.nativeRevision=f.openRevision();await f.nativeRevision.connect();const status=f.nativeRevision.status(f.revisionInfo.id);assert.equal(status.receipt,null);assert.equal(status.retry,false);assert.equal(status.conflict.decision.decision,'accept');assert.equal(status.conflict.successor,null);assert.equal(status.localSaved,true);assert.equal(f.source.core.documentJson(),accepted);assert.throws(()=>f.queue.packet(f.revisionInfo.suggestion.id),e=>e.code==='suggestion_unknown');assert.equal(count(f),1);await f.finishAndCold();f.evidence('original-accept-conflict');
 }));
 test(family.name+': a competing real revision wins; lazy native proof download keeps the losing local draft exact',{timeout:120000},()=>nativeSuggestionSession(setup(family),async f=>{
  f.suggestions=f.openNative();await f.suggestions.connect();await f.suggestions.flushShared();const remote=await f.publishCompetingRevision();f.nativeRevision=f.openRevision();await f.nativeRevision.connect();const status=f.nativeRevision.status(f.revisionInfo.id);assert.equal(status.receipt,null);assert.equal(status.retry,false);assert.equal(status.conflict.successor.revision.id,remote.info.id);assert.equal(status.conflict.decision.decision,'reject');assert.equal(status.packet,f.revisionPacket);assert.throws(()=>f.queue.packet(f.revisionInfo.suggestion.id),e=>e.code==='suggestion_unknown');
  f.nativeRevision.disconnect();const before=f.outbox.exportRecovery(),downloads=f.requests.filter(r=>r.kind==='suggestionRevisionPacket').length,[first,second]=await Promise.all([f.nativeRevision.loadRevision(remote.info.id),f.nativeRevision.loadRevision(remote.info.id)]);assert.deepEqual(first,second);assert.equal(first.packet,remote.packet);assert.equal(first.previousPacket,f.packet);assert.equal(first.source.kind,'verified');assert.equal(f.requests.filter(r=>r.kind==='suggestionRevisionPacket').length,downloads+1);assert.deepEqual(f.outbox.exportRecovery(),before);assert.equal(f.nativeRevision.revisions().length,1);await f.finishAndCold();f.evidence('competing-revision-and-lazy-proof');
 }));
}
