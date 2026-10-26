/** Complete DATA is not a current source or grant. Native-valid packets and
 * byte hashes cannot substitute for complete heads, attempts and source policy.
 */
import test,{before,after} from 'node:test';import {getEventListeners} from 'node:events';import assert from 'node:assert/strict';import {join} from 'node:path';import {createHash} from 'node:crypto';
import legacy from './fixtures/native-reconstruction/generation-asset-legacy.json' with {type:'json'};
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {generationOlderDisk} from './fixtures/native-reconstruction/generation-older-disk.mjs';
import {sourceSnapshot} from './fixtures/native-reconstruction/older-disk.mjs';
import {reframeReconstructionRecords} from './fixtures/native-reconstruction/reframe.mjs';
import {LoadedNativeReconstructionCurrent as Loaded} from '../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';
import {buildGenerationReconstructionRecipe as build} from '../packages/breditor-collaboration/dist/selected_native_reconstruction/generation_recipe.js';
import {inspectGenerationNativeReconstruction as inspect} from '../packages/breditor-collaboration/dist/selected_native_reconstruction/inspect_generation.js';
import {generationReferenceRecordStates,replayGenerationReferenceRecords} from '../packages/breditor-collaboration/dist/generation_source/record_reference_capture.js';
import {nativeRestoreBinding} from '../packages/breditor-collaboration/dist/native_restore_factory.js';
import {SharedGenerationParticipantBackup as Backup} from '../packages/breditor-collaboration/dist/generation_participant/backup.js';
import {readSharedGenerationAssetBackup as readAssets} from '../packages/breditor-collaboration/dist/generation_assets/read.js';
import {encodeGenerationAssetData as encode} from '../packages/breditor-collaboration/dist/generation_assets/encode_data.js';
import {saveEvidence} from './candidate-release/evidence.mjs';
let fixtures,transport,f,oldSource,names;
before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);f=await generationOlderDisk(fixtures,'generation-reconstruction-contracts','retained');oldSource=await sourceSnapshot(f.database);names=(await indexedDB.databases()).map(row=>row.name).sort();});
after(async()=>{await f?.close();transport?.restore();await fixtures?.close();if(fixtures){const rows=[];for(const item of fixtures.manifest.cases){let code;try{await fetch(item.endpoint,{signal:AbortSignal.timeout(2000)});}catch(error){code=error.cause?.code;}rows.push({endpoint:item.endpoint,closed:code==='ECONNREFUSED'});}saveEvidence(join(fixtures.directory,'native-reconstruction-generation-contract-endpoints-closed.json'),{rows});assert.ok(rows.every(row=>row.closed));}});
async function unchanged(){assert.deepEqual((await indexedDB.databases()).map(row=>row.name).sort(),names);assert.deepEqual(await sourceSnapshot(f.database),oldSource);}
const options=()=>({id:'generation',read:f.read,descriptor:f.descriptor});
async function candidate(mutate){const file=await reframeReconstructionRecords(f.loaded,fixtures.native,'generation',mutate),loaded=await Loaded.read(file,{wasm:fixtures.native,checkAuthority(){}});assert.notDeepEqual(file.selection,f.retained.selection);return{file,loaded};}
async function admitLive(input){const source=(await input.records('generation')).source,state=generationReferenceRecordStates(source.identity,source.records).at(-1),read=await replayGenerationReferenceRecords(source.identity,state.records,nativeRestoreBinding(f.read.restoreSegmented,f.read),f.read.editor,f.descriptor,input.check);try{read.check();}finally{read.dispose();}}
for(const [label,mutations] of [
 ['complete committed heads and immutable files',[
  source=>{source.records.committed.files[0].sha256='0'.repeat(64);},
  source=>{source.records.committed.files.push(structuredClone(source.records.committed.files[0]));},
  source=>{source.records.committed.record.identity.writer='909';},
 ]],
 ['attempt and pending captures without projection loss',[
  source=>{source.records.attempt.cut.head+=' ';},
  source=>{source.records.attempt.capture.review.actor+='-changed';},
  source=>{const value=JSON.parse(source.records.pending.companion);value.unrecognized=true;source.records.pending.companion=JSON.stringify(value);},
  source=>{source.records.live.unrecognized=true;},
 ]],
 ['both literal origin declarations and exact parent plans',[
  (source,root)=>{root.parent.files[0].sha256='0'.repeat(64);},
  (source,root)=>{root.parent.files[1].role='recovery-origin';},
  (source,root)=>{root.parent.operation.recoveryDatabase+='-changed';},
  (source,root)=>{root.parent.recovery.plan+=' ';},
 ]],
])test('generation reconstruction rechecks '+label+' after full frame admission',async()=>{
 for(const mutate of mutations){let value;try{value=await candidate(mutate);await assert.rejects(build(value.loaded,options()));await unchanged();}finally{value?.loaded.dispose();}}
});
test('generation facade revisions remain canonical observations, not native ancestry ordering',async()=>{
 let invalid,observed,backup;
 try{
  invalid=await candidate(source=>{source.records.live.documentRevision='not-a-revision';});await assert.rejects(build(invalid.loaded,options()));
  observed=await candidate(source=>{source.records.live.documentRevision='0';source.records.live.reviewRevision='0';});
  const result=await build(observed.loaded,options());assert.equal(result.kind,'ready');assert.deepEqual(result.retained.selection,observed.file.selection);
  backup=await Backup.read(result.participant.file,result.participant.selection);assert.deepEqual(backup.sourceRecovery(),f.recovery);await unchanged();
 }finally{backup?.dispose();observed?.loaded.dispose();invalid?.loaded.dispose();}
});
for(const [label,mutate] of [
 ['dropped',source=>{assert.ok(source.records.live.versions.length>=2);source.records.live.versions=[];}],
 ['reordered',source=>{assert.ok(source.records.live.versions.length>=2);source.records.live.versions.reverse();}],
])test('generation reconstruction refuses '+label+' immutable versions despite native admission',async()=>{
 let value;try{value=await candidate(mutate);await admitLive(value.loaded);await assert.rejects(build(value.loaded,options()),error=>error.code==='native_reconstruction_requires_merge');await unchanged();}finally{value?.loaded.dispose();}
});
for(const [label,mutations] of [
 ['dropped nonempty suggestion and revision queues',[source=>{const c=JSON.parse(source.records.live.companion);assert.ok(c.retained.suggestions.retained.length);assert.ok(c.retained.revisions.retained.length);c.retained.suggestions.retained=[];c.retained.revisions.retained=[];source.records.live.companion=JSON.stringify(c);}]],
 ['changed complete retained row intents',[
  source=>{const c=JSON.parse(source.records.live.companion),row=c.retained.suggestions.retained[0];row.publish=!row.publish;source.records.live.companion=JSON.stringify(c);},
  source=>{const c=JSON.parse(source.records.live.companion),row=c.retained.revisions.retained[0];row.retry=!row.retry;source.records.live.companion=JSON.stringify(c);},
 ]],
 ['dropped nonempty queued version packets',[source=>{const c=JSON.parse(source.records.live.companion);assert.ok(c.retained.versions.packets.length);c.retained.versions.packets=[];source.records.live.companion=JSON.stringify(c);}]],
])test('generation reconstruction requires merge for '+label+' despite native admission',async()=>{
 for(const mutate of mutations){let value;try{value=await candidate(mutate);await admitLive(value.loaded);await assert.rejects(inspect(f.s.owner,f.s.input(),{id:'generation',retained:value.file}),error=>error.code==='native_reconstruction_requires_merge');await unchanged();}finally{value?.loaded.dispose();}}
});
test('generation factories remain explicit and invalid editor policies never invoke them or incoming getters',async()=>{
 let calls=0;
 for(const editor of [42,[],{segmentedHistory:'segmented-v1'},{selectionEditing:'document-v1'},{searchHistory:'search-v1'}])await assert.rejects(build(f.loaded,{...options(),read:{restoreSegmented(){calls++;},editor}}),error=>error.code==='native_reconstruction_policy');
 const read={...f.read};Object.defineProperty(read,'editor',{enumerable:true,get(){calls++;return{};}});await assert.rejects(build(f.loaded,{...options(),read}));assert.equal(calls,0);
 await assert.rejects(build(f.loaded,{...options(),descriptor:'different-native-profile'}));await unchanged();
});
test('shared generation framing preserves pinned genuine pre-refactor bytes and its DATA-only failure boundaries',async()=>{
 assert.equal(legacy.format,'breditor/test-legacy-generation-asset');const bytes=Buffer.from(legacy.base64,'base64');assert.equal(bytes.length,legacy.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),legacy.sha256);
 const archive=await readAssets(new Blob([bytes]));
 try{
  const metadata=archive.metadata(),records=archive.records(),payloads=new Map();for(const asset of metadata.assets){const binding=metadata.bindings.find(row=>row.contentAsset===asset.contentAsset);assert.ok(binding);payloads.set(asset.contentAsset,archive.blob(binding.asset,binding.generation));}
  const input={metadata,records,payloads},result=await encode(input,()=>{});assert.deepEqual(Buffer.from(await result.arrayBuffer()),bytes);
  await assert.rejects(encode({...input,metadata:{...metadata,sourceBytes:metadata.sourceBytes+1}},()=>{}),error=>error.code==='asset_bytes_integrity');
  const abort=new AbortController();abort.abort();await assert.rejects(encode(input,()=>{},abort.signal));
  await encode(input,()=>{throw undefined;}).then(()=>assert.fail('Rejected undefined was lost'),reason=>assert.equal(reason,undefined));await unchanged();
 }finally{archive.dispose();}
});

/** Hold a real fixture decoder only after it has admitted its exact PNG bytes.
 * The outer wait must stop while this decoder remains unsettled. */
function holdDecodedRaster(){
 const original=Object.getOwnPropertyDescriptor(globalThis,'Image'),ImageType=globalThis.Image,make=URL.createObjectURL,revoke=URL.revokeObjectURL,urls=new Set(),raw=[];let enter,release;
 const entered=new Promise(done=>enter=done),gate=new Promise(done=>release=done);let restored=false;
 class HeldImage extends ImageType{decode(){const pending=super.decode().then(()=>{enter();return gate;});raw.push(pending);return pending;}}
 Object.defineProperty(globalThis,'Image',{value:HeldImage,configurable:true});URL.createObjectURL=function(blob){const value=make.call(this,blob);urls.add(value);return value;};URL.revokeObjectURL=function(url){urls.delete(url);return revoke.call(this,url);};
 return{entered,release,urls,async finish(){release();await Promise.allSettled(raw);if(restored)return;restored=true;try{assert.equal(urls.size,0,'Cancelled recovery must revoke every temporary raster URL');}finally{URL.createObjectURL=make;URL.revokeObjectURL=revoke;if(original)Object.defineProperty(globalThis,'Image',original);else delete globalThis.Image;}}};
}
async function enteredNativeRaster(gate,pending){let timer;try{await Promise.race([gate.entered,pending.then(()=>assert.fail('Expected held recovery raster admission'),error=>{throw error;}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Recovery raster decoder was not entered')),10000);})]);}finally{clearTimeout(timer);}}
async function nativeRasterCancelled(pending,gate){let timer;try{const result=await Promise.race([pending.then(()=>({kind:'ready'}),error=>({kind:'rejected',error})),new Promise(resolve=>{timer=setTimeout(()=>resolve({kind:'pending'}),300);})]);assert.equal(result.kind,'rejected','Recovery must settle before the raster decoder is released');assert.match(result.error.code,/_aborted$/);assert.equal(gate.urls.size,0);}finally{clearTimeout(timer);}}
test('generation DATA input disposal cancels stalled original raster admission before any native factory',async()=>{
 const input=await Loaded.read(f.retained,{wasm:fixtures.native,checkAuthority(){}}),gate=holdDecodedRaster();let pending,calls=0;
 try{pending=build(input,{...options(),read:{...f.read,restoreSegmented(...args){calls++;return f.read.restoreSegmented.apply(f.read,args);}}});await enteredNativeRaster(gate,pending);input.dispose();await nativeRasterCancelled(pending,gate);assert.equal(calls,0);await unchanged();}
 finally{input.dispose();gate.release();await pending?.catch(()=>{});await gate.finish();}
});
test('invalid reconstruction custody releases combined read and asset signal observers',async()=>{
 const a=new AbortController(),b=new AbortController(),signals=[a.signal,b.signal],before=signals.map(signal=>getEventListeners(signal,'abort').length);
 await assert.rejects(Promise.resolve().then(()=>inspect({}, {...f.s.input(),signal:a.signal},{id:'generation',retained:f.retained,assets:{signal:b.signal}})));
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(signals.map(signal=>getEventListeners(signal,'abort').length),before);await unchanged();
});
for(const kind of ['read','asset'])test('generation inspection '+kind+' signal cancels stalled first-capture raster and releases room barriers',async()=>{
 const client=f.s.owner.clients.find(row=>row.id==='generation'),before={document:client.core.documentJson(),checkpoint:client.core.checkpointJson(),review:client.core.reviewCheckpoint()},gate=holdDecodedRaster(),controller=new AbortController();let pending;
 try{
  pending=inspect(f.s.owner,{...f.s.input(),...(kind==='read'?{signal:controller.signal}:{})},{id:'generation',retained:f.retained,...(kind==='asset'?{assets:{signal:controller.signal}}:{})});
  await enteredNativeRaster(gate,pending);controller.abort();await nativeRasterCancelled(pending,gate);gate.release();await pending.catch(()=>{});await gate.finish();
  const later=await f.s.retain();assert.ok(later.file.size>0);assert.equal(client.core.checkpointJson(),before.checkpoint);assert.equal(client.core.reviewCheckpoint(),before.review);await unchanged();
  if(kind==='asset'){client.core.type('Editing after cancelled raster recovery ');assert.equal(client.core.undo(),true);assert.equal(client.core.documentJson(),before.document);}
 }finally{controller.abort();gate.release();await pending?.catch(()=>{});await gate.finish();}
});

test('generation room Close finishes before a stalled capture raster decoder returns',async()=>{
 const retained=await f.s.retain(),gate=holdDecodedRaster();let pending,closing,timer;
 try{
  pending=inspect(f.s.owner,f.s.input(),{id:'generation',retained:f.retained});await enteredNativeRaster(gate,pending);closing=f.s.owner.close();
  const result=await Promise.race([Promise.allSettled([pending,closing]),new Promise(resolve=>{timer=setTimeout(()=>resolve('pending'),1500);})]);
  assert.notEqual(result,'pending','Actual room Close must finish before the raster decoder is released');assert.equal(result[0].status,'rejected');assert.match(result[0].reason.code,/(?:aborted|closed)$/);assert.equal(result[1].status,'fulfilled');assert.equal(gate.urls.size,0);assert.ok(retained.file.size>0);assert.throws(()=>f.s.owner.clients);
 }finally{clearTimeout(timer);gate.release();await Promise.allSettled([pending,closing]);await gate.finish();}
});
