/** End-to-end original intent finalization while native recovery remains held. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeSuggestionSession,families} from './fixtures/native-suggestion-delivery/session.mjs';
import {createNativeSuggestionDelivery} from '../packages/breditor-collaboration/dist/suggestions/native_delivery.js';
const busy=e=>['native_recovery_busy','suggestion_recovery_in_use','native_suggestion_queue_in_use'].includes(e?.code);
for(const family of families)for(const scope of ['original','general-v1','document-v1'])for(const natural of [false,true])for(const owned of [false,true]){
 test(family.name+' / '+scope+' / '+(natural?'typing-v1':'explicit')+' / '+(owned?'owned':'unowned')+': original suggestion finalizes under native custody and cold-reopens both histories',{timeout:120000},()=>nativeSuggestionSession({family,scope,natural,owned,prepare:family.kind!=='original'},async f=>{
  const q=f.queue,c=f.source.core;
  assert.throws(()=>createNativeSuggestionDelivery({...q},f.doc,f.context));
  assert.throws(()=>createNativeSuggestionDelivery(q,{...f.doc},f.context),e=>e.code==='native_suggestion_transport');
  assert.throws(()=>f.openNative({autoStart:true}),e=>e.code==='native_suggestion_options');
  assert.equal(f.tokenCalls,0);
  f.suggestions=f.openNative();
  assert.throws(()=>f.openNative(),busy);
  assert.throws(()=>c.select(null),busy);
  assert.throws(()=>q.stopRetryingDecision(f.info.id),busy);
  f.shadow(f.source,['save','flush']);f.shadow(q,['receiveVerifiedPublication','receiveVerifiedDecision','cacheVerifiedProposal']);f.shadow(c,['adoptSuggestionHistory']);f.shadow(f.doc,['requestSuggestion']);
  await f.suggestions.connect();await f.suggestions.flushShared();
  const status=q.status(f.info.id);
  assert.equal(status.localSaved,true);assert.equal(status.publish,false);assert.equal(status.intent.requested,'accept');assert.equal(status.intent.retry,false);assert.equal(status.decision.decision,'accept');assert.equal(status.decision.acceptingWriter,f.identity.documentWriter);
  assert.equal(q.packet(f.info.id),f.packet);assert.equal((c.documentJson().match(/Suggested once /g)??[]).length,1);
  assert.equal(f.requests.filter(r=>r.kind==='suggestionPublish').length,1);assert.equal(f.requests.filter(r=>r.kind==='suggestionDecide').length,1);
  assert.throws(()=>c.select(null),busy);assert.throws(()=>q.stopRetryingDecision(f.info.id),busy);
  if(owned)assert.ok(c.adoptedSuggestion(f.info.id));else assert.equal(c.adoptedSuggestion(f.info.id),null);
  await f.finishAndCold();f.evidence();
 }));
}
