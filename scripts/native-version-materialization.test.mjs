/** Actual original Native version protocol and genuine held store loans.
 * Dependency downloads must not submit outstanding document/comment work or
 * publish versions. Failed bodies and failed local writes retain exact facts. */
import test from 'node:test';import assert from 'node:assert/strict';
import {families,nativeVersionSession} from './fixtures/native-version-delivery/session.mjs';
import {NativeVersionPacketMaterializer} from '../packages/breditor-collaboration/dist/versions/materialize_packet.js';
const pair=core=>[core.checkpointJson(),core.reviewHistoryPolicy()==='segmented-v1'?core.reviewSegmentedCheckpoint():core.reviewCheckpoint()];
async function knownRemote(f){f.versions=f.openNative();await f.versions.connect();const remote=await f.publishRemote();await f.versions.refresh();assert.equal(f.catalog.versionStatus(remote.info.id).cached,false);assert.equal(f.catalog.versionStatus(f.named.id).queued,true);await f.versions.close();f.versions=undefined;return remote;}
test('a copied view cannot construct a materializer or inspect credentials',()=>{let reads=0;const store={get options(){reads++;throw Error('No copied credentials');}};assert.throws(()=>new NativeVersionPacketMaterializer({store,port:{}}),e=>e.code==='version_native_delivery_source');assert.equal(reads,0);});
for(const family of families)test(family.name+': dependency-only materialization retains pending publication and exact future native histories',{timeout:120000},()=>nativeVersionSession({family,wire:2},async f=>{
 const remote=await knownRemote(f),before=f.catalog.exportRecovery(),native=pair(f.session.core),wire=f.wireRequests.length,http=f.httpRequests.length;let flushes=0;
 f.versions=f.openNative({...f.options,flushDocument:async()=>{flushes++;throw Error('Dependency reads cannot flush document delivery');}});f.shadows();
 f.faults.beforeFetch=(url,options)=>{assert.match(new URL(url).pathname,/\/document-versions\/v1\/packets\//);assert.equal(options.method,'GET');};
 const results=await Promise.all([f.versions.materializeVersion(remote.info.id),f.versions.materializeVersion(remote.info.id)]);assert.deepEqual(results,[remote.packet,remote.packet]);assert.equal(f.httpRequests.length-http,1);assert.equal(f.wireRequests.length,wire);assert.equal(flushes,0);assert.equal(f.versions.state().status,'offline');
 const after=f.catalog.exportRecovery();assert.deepEqual(after.catalog,before.catalog);assert.deepEqual(after.packets.slice(0,before.packets.length),before.packets);assert.equal(after.packets.length,before.packets.length+1);assert.deepEqual(pair(f.session.core),native);assert.equal(f.catalog.versionStatus(f.named.id).queued,true);assert.equal(f.catalog.versionStatus(f.named.id).accepted,null);assert.equal(f.catalog.versionStatus(remote.info.id).cached,true);assert.equal(f.catalog.versionStatus(remote.info.id).localSaved,true);
 assert.equal(await f.versions.materializeVersion(remote.info.id),remote.packet);assert.equal(f.httpRequests.length-http,1);await assert.rejects(f.versions.materializeVersion('sha256:'+'0'.repeat(64)),e=>e.code==='version_unknown');assert.equal(f.httpRequests.length-http,1);
 f.faults.beforeFetch=undefined;await f.finishAndCold();assert.deepEqual(f.catalog.exportRecovery(),after);f.evidence('dependency-only-materialization');
}));
test('wrong packet bytes refuse before cache mutation and keep queued local intentions',{timeout:120000},()=>nativeVersionSession({},async f=>{
 const remote=await knownRemote(f),before=f.catalog.exportRecovery(),native=pair(f.session.core),fetch=globalThis.fetch;
 f.versions=f.openNative();globalThis.fetch=(url,options)=>new URL(url).pathname.includes('/document-versions/v1/packets/')?Promise.resolve(new Response(f.packet,{status:200,headers:{'content-type':'application/json','x-breditor-catalog':f.versionIdentity.binding}})):fetch(url,options);
 try{await assert.rejects(f.versions.materializeVersion(remote.info.id),e=>e.code==='version_receipt_mismatch');assert.deepEqual(f.catalog.exportRecovery(),before);assert.deepEqual(pair(f.session.core),native);assert.equal(f.catalog.versionStatus(remote.info.id).cached,false);}finally{globalThis.fetch=fetch;}
}));
test('authority revoked inside the token callback makes no HTTP request and changes no cache',{timeout:120000},()=>nativeVersionSession({},async f=>{
 const remote=await knownRemote(f),before=f.catalog.exportRecovery(),http=f.httpRequests.length;
 f.versions=f.openNative({...f.options,getToken:async signal=>{f.authorize(false);return f.options.getToken(signal);}});
 try{await assert.rejects(f.versions.materializeVersion(remote.info.id));assert.equal(f.httpRequests.length,http);assert.deepEqual(f.catalog.exportRecovery(),before);}finally{f.authorize(true);}
}));
test('terminal close excludes new work immediately and drains a real delayed request before releasing its loan',{timeout:120000},()=>nativeVersionSession({},async f=>{
 const remote=await knownRemote(f),before=f.catalog.exportRecovery();let enter,release;const entered=new Promise(resolve=>{enter=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 f.versions=f.openNative();f.faults.beforeFetch=async url=>{if(new URL(url).pathname.includes('/document-versions/v1/packets/')){enter();await gate;}};
 const pending=f.versions.materializeVersion(remote.info.id),rejected=assert.rejects(pending);let closing,finished=false;
 try{await entered;closing=f.versions.close().then(()=>{finished=true;});await assert.rejects(f.versions.materializeVersion(remote.info.id));assert.throws(()=>f.openNative());await new Promise(resolve=>setImmediate(resolve));assert.equal(finished,false);assert.deepEqual(f.catalog.exportRecovery(),before);release();await rejected;await closing;assert.deepEqual(f.catalog.exportRecovery(),before);assert.equal(f.catalog.versionStatus(remote.info.id).cached,false);}
 finally{release();await rejected;await closing;f.faults.beforeFetch=undefined;}
}));
test('failed actual cache persistence stays locally unconfirmed until explicit same-loan retry',{timeout:120000},()=>nativeVersionSession({},async f=>{
 const remote=await knownRemote(f),before=f.catalog.exportRecovery(),native=pair(f.session.core);f.versions=f.openNative();f.faults.abortDatabase=f.catalogDatabase;
 await assert.rejects(f.versions.materializeVersion(remote.info.id));const failed=f.catalog.versionStatus(remote.info.id);assert.equal(failed.cached,true);assert.equal(failed.localSaved,false);assert.equal(f.catalog.versionStatus(f.named.id).queued,true);assert.deepEqual(pair(f.session.core),native);assert.deepEqual(f.catalog.exportRecovery().catalog,before.catalog);
 await f.versions.retryLocal();assert.equal(f.catalog.versionStatus(remote.info.id).localSaved,true);assert.equal(await f.versions.materializeVersion(remote.info.id),remote.packet);await f.finishAndCold();assert.equal(f.catalog.versionPacket(remote.info.id),remote.packet);
}));
