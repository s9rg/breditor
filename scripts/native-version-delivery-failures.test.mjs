/** Actual server acceptance and actual storage failures; no ACK is manufactured. */
import test from 'node:test';import assert from 'node:assert/strict';
import {families,nativeVersionSession} from './fixtures/native-version-delivery/session.mjs';
const busy=e=>e?.code==='native_recovery_busy',pause=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}
for(const family of families){
 test(family.name+': denied authentication retains exact pending bytes and both histories',{timeout:120000},async()=>nativeVersionSession({family},async f=>{
  const before=f.catalog.exportRecovery(),requests=f.wireRequests.length;f.versions=f.openNative({...f.options,getToken:()=>'0'.repeat(64)});
  await assert.rejects(f.versions.connect());assert.equal(f.versions.state().canPublish,null);assert.deepEqual(f.catalog.exportRecovery(),before);assert.equal(f.catalog.versionStatus(f.named.id).accepted,null);assert.equal(f.wireRequests.slice(requests).some(kind=>['resume','submit','reviewResume','reviewSubmit'].includes(kind)),false);assert.throws(()=>f.session.core.select(null),busy);await f.finishAndCold();assert.deepEqual(f.catalog.exportRecovery(),before);f.evidence('denied');
 }));
 test(family.name+': a real receipt-write abort retains the original server winner and exact retry without republishing',{timeout:120000},async()=>nativeVersionSession({family},async f=>{
  f.versions=f.openNative();await f.doc.connect();await f.doc.flush();await f.review.connect();await f.review.flush();let armed=false,aborted=0;
  f.faults.afterPublish=()=>{armed=true;};
  f.faults.afterCommit=(_name,tx)=>{if(armed&&f.catalog.versionStatus(f.named.id).accepted){armed=false;aborted++;queueMicrotask(()=>{try{tx.abort();}catch{}});}};
  await assert.rejects(f.versions.connect());assert.equal(aborted,1);f.faults.afterPublish=undefined;f.faults.afterCommit=undefined;
  const uncertain=f.catalog.versionStatus(f.named.id);assert.ok(uncertain.accepted);assert.equal(uncertain.localSaved,false);assert.equal(uncertain.queued,false);assert.equal(f.catalog.versionPacket(f.named.id),f.packet);assert.equal(f.httpRequests.filter(p=>p.endsWith('/publish')).length,1);
  await f.versions.retryLocal();await f.versions.refresh();await f.versions.flushShared();assert.deepEqual(f.catalog.versionStatus(f.named.id).accepted,uncertain.accepted);assert.equal(f.catalog.versionStatus(f.named.id).localSaved,true);assert.equal(f.httpRequests.filter(p=>p.endsWith('/publish')).length,1);await f.finishAndCold();f.evidence('receipt-abort-retry');
 }));
 test(family.name+': authority refusal after actual metadata commitment retains committed facts for cold reopen',{timeout:120000},async()=>nativeVersionSession({family},async f=>{
  f.versions=f.openNative();await f.doc.connect();await f.doc.flush();await f.review.connect();await f.review.flush();let armed=false,committed=0;
  f.faults.afterPublish=()=>{armed=true;};
  f.faults.afterCommit=(_name,tx)=>{if(armed&&f.catalog.versionStatus(f.named.id).accepted){armed=false;tx.addEventListener('complete',()=>{committed++;f.authorize(false);});}};
  await assert.rejects(f.versions.connect());assert.equal(committed,1);f.faults.afterCommit=undefined;f.faults.afterPublish=undefined;
  const status=f.catalog.versionStatus(f.named.id);assert.ok(status.accepted);assert.equal(status.localSaved,true);assert.equal(status.queued,false);const actual=f.catalog.exportRecovery();await f.versions.close();await f.delivery.close();await assert.rejects(f.versions.connect());
  assert.deepEqual(await f.durableCatalog(),actual,'A refused success must still retain the exact actually committed record');
  f.authorize(true);await f.renewNative();f.versions=f.openNative();assert.throws(()=>f.session.core.select(null),busy);await f.versions.retryLocal();assert.deepEqual(await f.durableCatalog(),actual);await f.versions.connect();await f.versions.flushShared();assert.equal(f.httpRequests.filter(p=>p.endsWith('/publish')).length,1);await f.finishAndCold();assert.deepEqual(f.catalog.versionStatus(f.named.id).accepted,status.accepted);f.evidence('committed-refused');
 }));
 test(family.name+': a lost publish reply drains actual late work, then catches up under a new context without unlocking or republishing',{timeout:120000},async()=>nativeVersionSession({family},async f=>{
  f.versions=f.openNative();await f.doc.connect();await f.doc.flush();await f.review.connect();await f.review.flush();const entered=deferred(),late=deferred();f.faults.afterPublish=async()=>{entered.resolve();await late.promise;};
  const pending=f.versions.connect();void pending.catch(()=>{});let ending;
  try{await entered.promise;let closed=false;ending=f.delivery.close().then(()=>{closed=true;});await pause();assert.equal(closed,false);assert.throws(()=>f.held.close(),busy);assert.throws(()=>f.session.core.select(null),busy);late.resolve();await assert.rejects(pending);await ending;assert.equal(closed,true);assert.equal(f.versions.state().status,'closed');assert.equal(f.catalog.versionStatus(f.named.id).accepted,null);assert.equal(f.catalog.versionStatus(f.named.id).queued,true);assert.equal(f.httpRequests.filter(p=>p.endsWith('/publish')).length,1);
   f.faults.afterPublish=undefined;await f.renewNative();assert.throws(()=>f.session.core.select(null),busy);f.versions=f.openNative();await f.versions.connect();await f.versions.flushShared();assert.ok(f.catalog.versionStatus(f.named.id).accepted);assert.equal(f.catalog.versionStatus(f.named.id).localSaved,true);assert.equal(f.httpRequests.filter(p=>p.endsWith('/publish')).length,1);await f.finishAndCold();f.evidence('lost-reply-renewed');
  }finally{late.resolve();await pending.catch(()=>{});await ending;f.faults.afterPublish=undefined;}
 }));
}
