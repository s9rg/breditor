/** Real SDK lifecycle boundaries, including permanent observer cancellation. */
import test from 'node:test';import assert from 'node:assert/strict';
import {nativeSuggestionSession,families} from './fixtures/native-suggestion-delivery/session.mjs';
import {createNativeRelayDelivery} from '../packages/breditor-collaboration/dist/relay/native_delivery.js';
import {createNativeSuggestionDelivery} from '../packages/breditor-collaboration/dist/suggestions/native_delivery.js';
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {resolve,promise};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
for(const family of families)for(const observer of [false,true])test(family.name+' / '+(observer?'observer':'author')+': closing cancels Connect, drains actual SDK work and never resumes a late token',{timeout:120000},()=>nativeSuggestionSession({family,observer,choice:observer?'reject':'accept',scope:'document-v1',natural:true,owned:!observer,prepare:family.kind!=='original'},async f=>{
 const entered=deferred(),release=deferred(),q=f.queue;
 const other=createNativeRelayDelivery({native:f.hold,session:f.source,core:f.source.core,reviewCeiling:'comment',checkAuthority(){}});
 try{assert.throws(()=>createNativeSuggestionDelivery(q,f.doc,other),e=>e.code==='native_suggestion_transport');}finally{await other.close();}
 f.faults.token=async()=>{entered.resolve();await release.promise;return '0'.repeat(64);};
 f.suggestions=f.openNative();const connection=f.suggestions.connect();void connection.catch(()=>{});
 try{await entered.promise;assert.throws(()=>f.hold.close(),e=>e.code==='native_recovery_busy');await assert.rejects(q.close(),e=>e.code==='suggestion_recovery_in_use');
  await f.context.close();await assert.rejects(connection);f.hold.check();assert.throws(()=>f.source.core.select(null),e=>e.code==='native_recovery_busy');
  const sent=f.requests.length;release.resolve();await turn();await turn();assert.equal(f.requests.length,sent);assert.deepEqual(q.exportRecovery(),f.pending);await assert.rejects(f.suggestions.connect());
 }finally{release.resolve();await connection.catch(()=>{});}
 await f.finishAndCold();f.evidence('cancelled-late-token');
}));
for(const family of families)test(family.name+': concurrent authenticated remote downloads cache one exact original packet during native custody',{timeout:120000},()=>nativeSuggestionSession({family,scope:'document-v1',natural:true,owned:true,prepare:family.kind!=='original'},async f=>{
 const remote=await f.publishRemote();f.suggestions=f.openNative();await f.suggestions.connect();await f.suggestions.flushShared();
 const before=f.requests.filter(r=>r.kind==='suggestionPacket').length;
 const packets=await Promise.all([f.suggestions.loadSuggestion(remote.info.id),f.suggestions.loadSuggestion(remote.info.id)]);assert.deepEqual(packets,[remote.packet,remote.packet]);assert.equal(f.requests.filter(r=>r.kind==='suggestionPacket').length,before+1);
 const row=f.queue.exportRecovery().retained.find(row=>row.packet===remote.packet);assert.equal(row.origin,'remote');assert.equal(row.publish,false);assert.equal(row.intent,null);assert.deepEqual(row.publication,remote.publication);assert.equal(f.queue.status(remote.info.id).localSaved,true);
 assert.equal(await f.suggestions.loadSuggestion(remote.info.id),remote.packet);assert.equal(f.requests.filter(r=>r.kind==='suggestionPacket').length,before+1);
 await f.finishAndCold();assert.equal(f.queue.packet(remote.info.id),remote.packet);f.evidence('remote-lazy-cache');
}));
