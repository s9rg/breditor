/** Actual standalone generation controls and real native payload admission.
 * No physical-family alias, local storage simulation or room activation. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {startNativeGenerationControls} from './fixtures/generation-recovery-control/native-host.mjs';
export async function probeGenerationRecoveryControl({api,port,wasm,root,binary,directory}){
 const native=await startNativeGenerationControls(root,binary,directory),saved=globalThis.fetch,hosts=[];
 const routes=new Set(native.manifest.cases.flatMap(row=>[row.endpoint,...['assets/check','accepted/read','review/authorizations/read'].map(tail=>row.endpoint.replace(/check$/,tail))]));
 let requests=0,documentAuthors=0,reviewAuthors=0,originalWindows=0,rasters=0,continuedPages=0,offlineClients=0,readOnlyClients=0;
 globalThis.fetch=(input,options={})=>{assert.ok(routes.has(String(input)),'Only this test-owned native control may be contacted');requests++;const headers=new Headers(options.headers);headers.set('Origin','http://127.0.0.1:4187');return saved(input,{...options,headers});};
 try{
  for(const row of native.manifest.cases){
   const fixture=JSON.parse(readFileSync(row.path,'utf8')),inventory=JSON.parse(fixture.inventoryJson),room=inventory.room.document;
   assert.equal(fixture.format,'breditor/native-generation-recovery-control-fixture');
   assert.deepEqual(row.selection.source,fixture.generationRecoveryState);
   assert.equal(Object.hasOwn(row.selection.source,'ancestor'),false);assert.equal(Object.hasOwn(row.selection.source,'localOrigin'),false);
   const host=await api.SharedServerLogGenerationRecoveryHost.open({endpoint:row.endpoint,expected:row.selection,principal:'operator',getToken:()=>native.token(row.path),checkAuthority(){},requestTimeoutMs:60000});hosts.push(host);
   const actual=port(host);await actual.check();
   const ids=fixture.rasterIds;assert.equal(ids.length,2);
   const assets=await actual.checkAssets({references:[{asset:ids[0],generation:'retained-client-binding'}],uploads:[ids[1]]});assert.deepEqual(assets.missing,[]);assert.equal(assets.assets.length,2);rasters+=assets.assets.length;
   const missing=await actual.checkAssets({references:[{asset:'unavailable-client-image',generation:'offline'}],uploads:[]});assert.deepEqual(missing.missing,[{kind:'mapping',reference:{asset:'unavailable-client-image',generation:'offline'}}]);
   const payload=await actual.readAcceptedNative({document:'include',review:{kind:'start'}});
   assert.equal(payload.format,'breditor/server-log-generation-recovery-accepted-native-read');
   const compiler=fixture.language===1?'from_configuration_json':fixture.standard?'from_standard_configuration_json_v'+fixture.language:'from_configuration_json_v'+fixture.language;
   const profile=wasm.SharedRichProfile[compiler](fixture.configuration);let core;
   try{
    core=new api.SharedRichEditor(profile.join_frame(room,'909',payload.documentFrame));
    for(const author of [...inventory.writers,...inventory.serverAuthors]){assert.deepEqual(fixture.atomic?core.writerClockV2(author.clock.writer):core.writerClock(author.clock.writer),author.clock);documentAuthors++;}
    core.enableReview({actor:'generation-transfer-reader',principal:'owner',access:'read_only'});
    let page=payload.review;assert.ok(page);let pages=0;
    while(true){
     for(const batch of page.batches){const source=batch.source,policy={actor:source.actor,principal:source.principal,access:source.role==='moderator'?'moderate':'comment'};core.receiveReview(batch.frame,policy);assert.deepEqual(core.retainedReviewReceipt(batch.frame,policy),batch.receipt);}
     if(!page.more)break;
     page=(await actual.readAcceptedNative({document:'omit',review:{kind:'after',cursor:page.cursor}})).review;assert.ok(page);assert.ok(++pages<4096);
    }
    for(const author of inventory.review.writers){assert.deepEqual(core.reviewWriterClock(author.clock.actor,author.principal),author.clock);reviewAuthors++;}
    const after=await actual.readAcceptedNative({document:'omit',review:{kind:'after',cursor:page.cursor}});assert.equal(after.documentFrame,null);assert.deepEqual(after.review.batches,[]);assert.deepEqual(after.review.cursor,page.cursor);continuedPages++;
    const ranges=inventory.review.writers.filter(w=>w.clock.through!=='0').map(w=>({actor:w.clock.actor,principal:w.principal,from:'1',through:w.clock.through})).sort((a,b)=>a.actor<b.actor?-1:a.actor>b.actor?1:0);
    const rights=await actual.readOriginalReview({binding:inventory.review.binding,ranges});assert.equal(rights.authorizations.kind,'covered');assert.deepEqual(rights.authorizations.pending,[]);originalWindows+=rights.authorizations.windows.length;
    for(const range of ranges){const windows=rights.authorizations.windows.filter(w=>w.source.actor===range.actor);assert.equal(windows[0].from,'1');assert.equal(windows.at(-1).through,range.through);assert.equal(windows.at(-1).prefixDigest,core.reviewWriterClock(range.actor,range.principal).prefixDigest);}
    const client=fixture.clients.find(c=>!c.observer);assert.ok(client);
    let offline;try{
     offline=new api.SharedRichEditor(profile.restore(room,client.documentCheckpoint));
     const writable=inventory.accounts.find(a=>a.principal===client.principal).documentRole==='editor';
     offline.enableReview({actor:client.actor,principal:client.principal,access:writable?'comment':'read_only'},client.reviewCheckpoint);offline.setReadOnly(!writable);
     const document=offline.documentJson(),documentClock=fixture.atomic?offline.writerClockV2(client.writer):offline.writerClock(client.writer),reviewClock=offline.reviewWriterClock(client.actor,client.principal);
     assert.ok(BigInt(documentClock.through)>BigInt(inventory.writers.find(w=>w.clock.writer===client.writer).clock.through));assert.ok(BigInt(reviewClock.through)>BigInt(inventory.review.writers.find(w=>w.clock.actor===client.actor).clock.through));
     await offline.receiveFrame(payload.documentFrame);
     for(const batch of payload.review.batches)offline.receiveReview(batch.frame,{actor:batch.source.actor,principal:batch.source.principal,access:batch.source.role==='moderator'?'moderate':'comment'});
     assert.equal(offline.documentJson(),document);assert.deepEqual(fixture.atomic?offline.writerClockV2(client.writer):offline.writerClock(client.writer),documentClock);assert.deepEqual(offline.reviewWriterClock(client.actor,client.principal),reviewClock);
     if(writable){assert.equal(offline.undo(),true);assert.notEqual(offline.documentJson(),document);assert.equal(offline.redo(),true);assert.equal(offline.documentJson(),document);assert.equal(offline.undoReview().kind,'committed');assert.equal(offline.redoReview().kind,'committed');offlineClients++;}
     else{assert.equal(offline.view().readOnly,true);assert.throws(()=>offline.type('refused'));readOnlyClients++;}
    }finally{offline?.dispose();}
    const serialized=JSON.stringify({assets,payload,rights});assert.equal(serialized.includes(native.token(row.path)),false);
   }finally{core?.dispose();profile.free();}
   await assert.rejects(api.SharedPhysicalRoomRecoveryHost.open({endpoint:row.endpoint.replace('/generations/','/physical/'),expected:row.selection,principal:'operator',getToken:()=>native.token(row.path),checkAuthority(){}}),e=>e.code==='control_protocol'||e.code==='control_policy');
   const bad=structuredClone(row.selection);bad.instance='0'.repeat(64);await assert.rejects(api.SharedServerLogGenerationRecoveryHost.open({endpoint:row.endpoint,expected:bad,principal:'operator',getToken:()=>native.token(row.path),checkAuthority(){}}),e=>e.code==='control_protocol');
   const check=api.SharedServerLogGenerationRecoveryHost.prototype.check;try{api.SharedServerLogGenerationRecoveryHost.prototype.check=()=>Promise.resolve();await actual.check();}finally{api.SharedServerLogGenerationRecoveryHost.prototype.check=check;}
   host.close();await assert.rejects(actual.check(),e=>e.code==='control_closed');
  }
  assert.equal(continuedPages,10);assert.equal(rasters,20);assert.equal(documentAuthors,35);assert.equal(reviewAuthors,20);assert.equal(originalWindows,10);assert.equal(offlineClients,9);assert.equal(readOnlyClients,1);
  return{format:'breditor/generation-recovery-control-probe',formatVersion:1,passed:true,nativeHosts:native.manifest.cases.length,requests,documentAuthors,reviewAuthors,originalWindows,rasters,continuedPages,offlineClients,readOnlyClients,publicFixtureFiles:native.files,credentialMaterialPersisted:false,physicalAliasUsed:false,activated:false};
 }finally{for(const host of hosts)host.close();globalThis.fetch=saved;await native.stop();}
}
