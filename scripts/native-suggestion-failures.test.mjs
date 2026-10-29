/** Actual native server decisions across local aborts and lost responses.
 * These faults interrupt real operations; no ACK, metadata or effect is mocked. */
import test from 'node:test';import assert from 'node:assert/strict';
import {nativeSuggestionSession,families} from './fixtures/native-suggestion-delivery/session.mjs';
const options=family=>({family,scope:'document-v1',natural:true,owned:true,prepare:family.kind!=='original'});
const count=(f,kind)=>f.requests.filter(r=>r.kind===kind).length;
for(const family of families){
 test(family.name+': failed receipt persistence preserves the actual server winner and retries without reaccepting',{timeout:120000},()=>nativeSuggestionSession(options(family),async f=>{
  f.suggestions=f.openNative();let armed=false;
  const off=f.queue.subscribe(()=>{if(!armed&&f.queue.status(f.info.id).decision){armed=true;f.faults.abortDatabase=family.kind==='original'?f.queueDatabase:f.database;}});
  try{await assert.rejects(async()=>{await f.suggestions.connect();await f.suggestions.flushShared();},e=>e.code==='local_save_failed');}finally{off();}
  assert.equal(armed,true);const status=f.queue.status(f.info.id);assert.equal(status.localSaved,false);assert.equal(status.decision.decision,'accept');assert.equal(status.intent.retry,false);assert.ok(f.source.core.adoptedSuggestion(f.info.id));assert.equal(count(f,'suggestionDecide'),1);
  const durable=await f.durableQueue();assert.equal(durable.retained[0].decision,null);
  await f.suggestions.retryLocal();await f.suggestions.connect();await f.suggestions.flushShared();
  assert.equal(f.queue.status(f.info.id).localSaved,true);assert.deepEqual(f.queue.status(f.info.id).decision,status.decision);assert.equal(count(f,'suggestionDecide'),1);assert.equal(count(f,'suggestionPublish'),1);
  await f.finishAndCold();f.evidence('receipt-abort-retry');
 }));
 test(family.name+': authority loss after an actual committed receipt preserves durable facts and fresh-context retry',{timeout:120000},()=>nativeSuggestionSession(options(family),async f=>{
  f.suggestions=f.openNative();let staged=false,committed=false;
  const off=f.queue.subscribe(()=>{if(f.queue.status(f.info.id).decision)staged=true;});
  f.faults.transaction=(name,tx)=>{if(staged&&!committed&&name===(family.kind==='original'?f.queueDatabase:f.database))tx.addEventListener('complete',()=>{if(!committed){committed=true;f.authorize(false);}});};
  try{await assert.rejects(async()=>{await f.suggestions.connect();await f.suggestions.flushShared();});}finally{off();f.faults.transaction=undefined;}
  assert.equal(committed,true);const status=f.queue.status(f.info.id);assert.equal(status.localSaved,true);assert.equal(status.decision.decision,'accept');assert.equal(status.intent.retry,false);assert.equal((await f.durableQueue()).retained[0].decision.decision,'accept');
  await assert.rejects(f.suggestions.refresh(),e=>e.code==='participant_authority');
  f.authorize(true);await f.renewNative();f.suggestions=f.openNative();await f.suggestions.retryLocal();await f.suggestions.connect();await f.suggestions.flushShared();
  assert.deepEqual(f.queue.status(f.info.id).decision,status.decision);assert.equal(count(f,'suggestionDecide'),1);assert.equal(count(f,'suggestionPublish'),1);
  await f.finishAndCold();f.evidence('postcommit-authority');
 }));
 test(family.name+': a real lost Accept response recovers its original server decision without a second decision',{timeout:120000},()=>nativeSuggestionSession(options(family),async f=>{
  f.suggestions=f.openNative();let dropped=false,serverDecision;
  f.faults.reply=(envelope,_deliver,socket)=>{const result=envelope.result;if(!dropped&&result.kind==='suggestionDecisionAdmission'&&result.admission.kind==='durable'){dropped=true;serverDecision=result.admission.decision;f.authorize(false);socket.close();return true;}return false;};
  await assert.rejects(async()=>{await f.suggestions.connect();await f.suggestions.flushShared();});
  assert.equal(dropped,true);assert.equal(f.queue.status(f.info.id).decision,null);assert.equal(f.queue.status(f.info.id).intent.retry,true);assert.equal(count(f,'suggestionDecide'),1);
  f.faults.reply=undefined;f.authorize(true);await f.renewNative();f.suggestions=f.openNative();await f.suggestions.connect();await f.suggestions.flushShared();
  assert.deepEqual(f.queue.status(f.info.id).decision,serverDecision);assert.equal(f.queue.status(f.info.id).localSaved,true);assert.equal(count(f,'suggestionDecide'),1);assert.equal(count(f,'suggestionPublish'),1);
  await f.finishAndCold();f.evidence('lost-accept-response');
 }));
 test(family.name+': denied current authentication preserves original pending bytes and both offline histories',{timeout:120000},()=>nativeSuggestionSession(options(family),async f=>{
  const source=f.recovery(),pending=f.queue.exportRecovery();f.badToken(true);f.suggestions=f.openNative();
  await assert.rejects(f.suggestions.connect());assert.deepEqual(f.queue.exportRecovery(),pending);assert.deepEqual(f.recovery(),source);assert.equal(count(f,'suggestionPublish'),0);assert.equal(count(f,'suggestionDecide'),0);
  f.badToken(false);await f.renewNative();f.suggestions=f.openNative();await f.suggestions.connect();await f.suggestions.flushShared();assert.equal(f.queue.status(f.info.id).localSaved,true);assert.equal(count(f,'suggestionDecide'),1);
  await f.finishAndCold();f.evidence('authentication-denied');
 }));
}
