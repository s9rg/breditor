/** Genuine parent/child retirement across late SDK work and original writes. */
import test from 'node:test';import assert from 'node:assert/strict';
import {nativeSuggestionSession,families} from './fixtures/native-suggestion-delivery/session.mjs';
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};},turn=()=>new Promise(resolve=>setImmediate(resolve));
const options=family=>({family,scope:'document-v1',natural:true,owned:true,choice:null,withRevisions:true,prepare:family.kind!=='original'});
const busy=e=>e.code==='native_recovery_busy';
for(const family of families){
 test(family.name+': parent close drains an actual receipt write before releasing its original queue loan',{timeout:120000},()=>nativeSuggestionSession(options(family),async f=>{
  f.suggestions=f.openNative();f.nativeRevision=f.openRevision();const entered=deferred(),release=deferred();let staged=false,held=false,closed=false;
  const off=f.nativeRevision.subscribe(()=>{if(f.nativeRevision.status(f.revisionInfo.id).receipt)staged=true;});
  f.faults.transaction=(name,tx)=>{if(!staged||held||name!==(family.kind==='original'?f.revisionDatabase:f.database))return;held=true;const wrap=listener=>event=>{entered.resolve();void release.promise.then(()=>{if(typeof listener==='function')listener.call(tx,event);else listener.handleEvent(event);});};let handler=null;Object.defineProperty(tx,'oncomplete',{configurable:true,get:()=>handler,set:value=>{handler=value?wrap(value):null;}});const add=tx.addEventListener.bind(tx);tx.addEventListener=(kind,listener,opts)=>add(kind,kind==='complete'?wrap(listener):listener,opts);};
  const connection=f.nativeRevision.connect();void connection.catch(()=>{});let closing;
  try{await entered.promise;f.faults.transaction=undefined;closing=f.suggestions.close().then(()=>{closed=true;});await turn();assert.equal(closed,false);assert.throws(()=>f.hold.close(),busy);await assert.rejects(f.queue.close(),e=>e.code==='suggestion_recovery_in_use');release.resolve();await closing;await assert.rejects(connection);assert.equal(f.nativeRevision.state().status,'closed');assert.equal(f.nativeRevision.status(f.revisionInfo.id).localSaved,true);assert.ok(f.outbox.exportRecovery().retained[0].receipt);assert.throws(()=>f.queue.packet(f.revisionInfo.suggestion.id),e=>e.code==='suggestion_unknown');
  }finally{off();release.resolve();f.faults.transaction=undefined;await closing;await connection.catch(()=>{});}
  f.suggestions=f.openNative();f.nativeRevision=f.openRevision();await f.nativeRevision.retryLocal();await f.nativeRevision.connect();assert.equal(f.queue.packet(f.revisionInfo.suggestion.id),f.childPacket);assert.equal(f.requests.filter(r=>r.kind==='suggestionRevisionPublish').length,1);await f.finishAndCold();f.evidence('late-committed-receipt-drain');
 }));
 test(family.name+': closing the native context cancels a child Connect and ignores its late token result',{timeout:120000},()=>nativeSuggestionSession(options(family),async f=>{
  f.suggestions=f.openNative();f.nativeRevision=f.openRevision();const entered=deferred(),release=deferred(),queue=f.queue.exportRecovery(),outbox=f.outbox.exportRecovery();f.faults.token=async()=>{entered.resolve();await release.promise;return '0'.repeat(64);};const connection=f.nativeRevision.connect();void connection.catch(()=>{});
  try{await entered.promise;await f.context.close();await assert.rejects(connection);assert.equal(f.nativeRevision.state().status,'closed');const sent=f.requests.length;release.resolve();await turn();await turn();assert.equal(f.requests.length,sent);assert.deepEqual(f.queue.exportRecovery(),queue);assert.deepEqual(f.outbox.exportRecovery(),outbox);assert.throws(()=>f.source.core.select(null),busy);}
  finally{release.resolve();await connection.catch(()=>{});}
  f.faults.token=undefined;await f.renewNative();f.suggestions=f.openNative();f.nativeRevision=f.openRevision();await f.nativeRevision.connect();await f.finishAndCold();f.evidence('context-close-late-token');
 }));
 test(family.name+': metadata parent close waits for a borrowed Connect without owning or disconnecting its document transport',{timeout:120000},()=>nativeSuggestionSession(options(family),async f=>{
  f.suggestions=f.openNative();f.nativeRevision=f.openRevision();const entered=deferred(),release=deferred();let closed=false;f.faults.token=async()=>{entered.resolve();await release.promise;return '0'.repeat(64);};const connection=f.nativeRevision.connect();void connection.catch(()=>{});let closing;
  try{await entered.promise;closing=f.suggestions.close().then(()=>{closed=true;});await turn();assert.equal(closed,false);assert.throws(()=>f.hold.close(),busy);release.resolve();await assert.rejects(connection);await closing;assert.equal(closed,true);assert.equal(f.requests.filter(r=>r.kind==='suggestionRevisionPublish').length,0);assert.deepEqual(f.outbox.exportRecovery(),f.pendingRevisions);}
  finally{release.resolve();await closing;await connection.catch(()=>{});}
  f.faults.token=undefined;await f.renewNative();f.suggestions=f.openNative();f.nativeRevision=f.openRevision();await f.nativeRevision.connect();await f.finishAndCold();f.evidence('parent-close-borrowed-connect');
 }));
 test(family.name+': reentrant close during child options cannot leak an opening slot or an outbox loan',{timeout:120000},()=>nativeSuggestionSession(options(family),async f=>{
  f.suggestions=f.openNative();let closing;assert.throws(()=>f.openRevision({get onState(){closing=f.suggestions.close();return()=>{};}}),e=>e.code==='native_suggestion_closed');await closing;assert.equal(f.requests.filter(r=>r.kind==='suggestionRevisionPublish').length,0);assert.equal(f.tokenCalls,0);f.suggestions=f.openNative();f.nativeRevision=f.openRevision();await f.nativeRevision.connect();await f.finishAndCold();f.evidence('reentrant-child-open-close');
 }));
}
