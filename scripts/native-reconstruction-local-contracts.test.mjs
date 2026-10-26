/** Framed files are DATA: cryptographic integrity alone cannot approve journal
 * topology or loss of immutable native version packets. No sources are written. */
import test,{before,after}from'node:test';import assert from'node:assert/strict';import{join}from'node:path';
import{completeControlFixtures}from'./fixtures/physical-recovery-control/complete-fixtures.mjs';import{acceptedControlTransport}from'./fixtures/physical-recovery-control/accepted-transport.mjs';import{nativeReconstructionData}from'./fixtures/native-reconstruction/data.mjs';import{reframeReconstructionRecords}from'./fixtures/native-reconstruction/reframe.mjs';
import{LoadedNativeReconstructionCurrent as Loaded}from'../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';import{buildLocalReconstructionRecipe as build}from'../packages/breditor-collaboration/dist/selected_native_reconstruction/local_recipe.js';import{saveEvidence}from'./candidate-release/evidence.mjs';
let fixtures,transport,data;before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);data=await nativeReconstructionData(fixtures,'local-reconstruction-contract-data');});
after(async()=>{data?.close();transport?.restore();await fixtures?.close();if(fixtures){const rows=[];for(const item of fixtures.manifest.cases){let code;try{await fetch(item.endpoint,{signal:AbortSignal.timeout(2000)});}catch(error){code=error.cause?.code;}rows.push({endpoint:item.endpoint,closed:code==='ECONNREFUSED'});}saveEvidence(join(fixtures.directory,'native-reconstruction-local-contract-endpoints-closed.json'),{rows});assert.ok(rows.every(row=>row.closed));}});
for(const[label,mutate]of[
 ['unknown observed source cut',source=>{source.snapshot.observed='0'.repeat(64);}],
 ['rewritten retained cut digest',source=>{source.snapshot.retained[0].id='1'.repeat(64);}],
 ['duplicate retained native cut',source=>{source.snapshot.retained.push(structuredClone(source.snapshot.retained[0]));}],
 ['current cut differs from its retained native row',source=>{source.snapshot.current.head+=' ';}],
 ['dropped nonempty immutable version history',source=>{assert.ok(source.live.versions.length>0);source.live.versions=[];}],
 ['unknown LIVE recovery field',source=>{source.live.unknownReconstructionField=true;}],
])test('local reconstruction refuses '+label+' after complete frame admission',async()=>{
 const original=await data.load();let candidate;
 try{const file=await reframeReconstructionRecords(original,fixtures.native,'independent-local',mutate);candidate=await Loaded.read(file,{wasm:fixtures.native,checkAuthority(){}});assert.notDeepEqual(file.selection,data.file.selection);await assert.rejects(build(candidate,{id:'independent-local',session:data.localFactory}));assert.deepEqual(await indexedDB.databases(),[]);assert.deepEqual(original.file().selection,data.file.selection);}finally{candidate?.dispose();original.dispose();}
});
test('local factory choices remain explicit readonly policies and never execute incoming getters',async()=>{const input=await data.load();let calls=0;try{for(const session of[{...data.localFactory,readOnly:false},{...data.localFactory,review:{...data.localFactory.review,access:'comment'}},{...data.localFactory,documentHistory:{kind:'unknown',restoreOriginal(){calls++;}}}])await assert.rejects(build(input,{id:'independent-local',session}),error=>error.code==='independent_recovery_policy');const session={...data.localFactory};Object.defineProperty(session,'editor',{enumerable:true,get(){calls++;return{};}});await assert.rejects(build(input,{id:'independent-local',session}));assert.equal(calls,0);assert.deepEqual(await indexedDB.databases(),[]);}finally{input.dispose();}});
