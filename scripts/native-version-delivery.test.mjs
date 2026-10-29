import test from 'node:test';import assert from 'node:assert/strict';
import {families,nativeVersionSession} from './fixtures/native-version-delivery/session.mjs';
import {createNativeVersionDelivery} from '../packages/breditor-collaboration/dist/versions/native_delivery.js';
const busy=e=>e?.code==='native_recovery_busy';
for(const family of families)for(const wire of [1,2])for(const scope of wire===1?['original']:['original','general-v1','document-v1'])for(const natural of [false,true])test(family.name+' / wire '+wire+' / '+scope+' / '+(natural?'typing-v1':'explicit')+': exact held catalog publication, lazy remote cache, receipts and cold native histories',{timeout:120000},async()=>nativeVersionSession({family,wire,scope,natural},async f=>{
 let wrongTokens=0;const wrong={getToken(){wrongTokens++;throw Error('Wrong token must never execute');}};
 assert.throws(()=>createNativeVersionDelivery({...f.catalog},f.delivery,wrong));assert.throws(()=>createNativeVersionDelivery(f.catalog,{...f.delivery},wrong));assert.equal(wrongTokens,0);
 assert.throws(()=>f.openNative({...f.options,identity:f.versionIdentity}));
 f.versions=f.openNative();assert.throws(()=>f.openNative());assert.throws(()=>f.session.core.select(null),busy);assert.throws(()=>f.catalog.saveVersion('Forbidden while held','3'));assert.throws(()=>f.catalog.connect());await assert.rejects(f.catalog.retry());await assert.rejects(f.catalog.close());
 f.shadows();await f.versions.connect();assert.equal(f.catalog.versionStatus(f.named.id).accepted,null);assert.equal(f.versions.state().waitingForDocument,true);assert.equal(f.catalog.versionPacket(f.named.id),f.packet);
 await f.doc.connect();await f.doc.flush();await f.review.connect();await f.review.flush();await f.versions.refresh();await f.versions.flushShared();
 const accepted=f.catalog.versionStatus(f.named.id);assert.ok(accepted.accepted);assert.equal(accepted.localSaved,true);assert.equal(accepted.queued,false);assert.equal(f.catalog.versionPacket(f.named.id),f.packet);assert.throws(()=>f.session.core.select(null),busy);
 const remote=await f.publishRemote();await f.versions.refresh();assert.equal(f.catalog.versionStatus(remote.info.id).cached,false);const before=f.httpRequests.filter(p=>p.includes('/packets/')).length;
 const copies=await Promise.all([f.versions.loadVersion(remote.info.id),f.versions.loadVersion(remote.info.id)]);assert.deepEqual(copies,[remote.packet,remote.packet]);assert.equal(f.httpRequests.filter(p=>p.includes('/packets/')).length-before,1);assert.equal(f.catalog.versionStatus(remote.info.id).localSaved,true);assert.equal(f.freshTokenCalls>0,true);
 const record=f.catalog.exportRecovery();await f.finishAndCold();assert.deepEqual(f.catalog.exportRecovery(),record);assert.equal(f.catalog.versionPacket(remote.info.id),remote.packet);f.evidence();
}));
