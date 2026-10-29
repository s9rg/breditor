/** Permanent observer contracts stay distinct from document authors in recovery. */
import test from 'node:test';import assert from 'node:assert/strict';
import {nativeSuggestionSession,families} from './fixtures/native-suggestion-delivery/session.mjs';
for(const family of families)for(const scope of ['original','general-v1','document-v1'])for(const natural of [false,true])for(const choice of ['reject','accept']){
 test(family.name+' / '+scope+' / '+(natural?'typing-v1':'explicit')+' / '+choice+': native observer retains zero author prefix and original decision policy',{timeout:120000},()=>nativeSuggestionSession({family,scope,natural,observer:true,choice,prepare:family.kind!=='original'},async f=>{
  f.suggestions=f.openNative();f.shadow(f.source,['save','flush']);
  await f.suggestions.connect();
  assert.equal(f.suggestions.state().permissions.canAccept,false);
  if(choice==='accept'){
   await assert.rejects(f.suggestions.flushShared(),e=>e.code==='permission_denied');
   assert.equal(f.queue.status(f.info.id).intent.retry,true);assert.equal(f.queue.status(f.info.id).decision,null);
   assert.equal(f.requests.filter(r=>r.kind==='suggestionDecide').length,0);
  }else{
   await f.suggestions.flushShared();assert.equal(f.queue.status(f.info.id).decision.decision,'reject');assert.equal(f.queue.status(f.info.id).intent.retry,false);assert.equal(f.queue.status(f.info.id).localSaved,true);
   assert.equal(f.requests.filter(r=>r.kind==='suggestionDecide').length,1);
  }
  assert.equal(f.source.core.writerClockV2(f.identity.documentWriter).through,'0');assert.equal(f.source.core.view().readOnly,true);
  assert.equal(f.requests.filter(r=>r.testPrincipal===f.identity.principal&&['register','resume','submit'].includes(r.kind)).length,0);assert.ok(f.requests.some(r=>r.testPrincipal===f.identity.principal&&r.kind==='resumeObserver'));
  assert.equal(f.queue.packet(f.info.id),f.packet);assert.ok(!f.source.core.documentJson().includes('Suggested once '));
  await f.finishAndCold();f.evidence();
 }));
}
