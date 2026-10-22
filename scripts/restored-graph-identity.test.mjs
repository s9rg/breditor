/** Scratch proof against genuine native snapshot/lineage input identities, not ownership. */
import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{pathToFileURL}from'node:url';
import*as api from'../packages/breditor-collaboration/dist/index.js';
import*as rich from'@breditor/experimental-rich-content';
import{OperationalIndependentDeliveryParticipant as Participant}from'../packages/breditor-collaboration/dist/independent_operation/participant.js';
import{captureIndependentOperationBackup as capture}from'../packages/breditor-collaboration/dist/independent_operation/portable_capture.js';
import{IndependentOperationLineageBackup as Lineage}from'../packages/breditor-collaboration/dist/independent_operation/lineage_archive.js';
import{readRestoredOperationInput}from'../packages/breditor-collaboration/dist/restored_operation/input.js';
import{readPortableOperationIdentity}from'../packages/breditor-collaboration/dist/independent_operation/portable_identity.js';
import{segmentedDigest}from'../packages/breditor-collaboration/dist/persistence/segmented_checkpoint.js';
import{environment}from'./fixtures/room-participant-inventory/environment.mjs';
import{nativeProfile}from'./fixtures/owned-core-cleanup/session.mjs';
import{portableFixture}from'./fixtures/independent-operation/portable.mjs';
import{recoveryFactory}from'./fixtures/independent-delivery-recovery/session.mjs';
import{readRestoredOperationIdentity as read}from'../packages/breditor-collaboration/dist/restored_graph/identity.js';
const runtime=process.env.BREDITOR_RESTORED_GRAPH_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname,seed=JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url),'utf8'));
test('restored identities are admitted only as canonical explicit data, never legacy identity',async()=>{
 const reset=environment(),native=await import(pathToFileURL(runtime+'/breditor_shared.js'));await native.default({module_or_path:readFileSync(runtime+'/breditor_shared_bg.wasm')});const profile=nativeProfile(native,3,true);let f,snapshot,lineage;
 try{f=await portableFixture({api,rich,Participant,profile,seed,tag:'restored-identity-scratch'});const captured=await capture({source:f.source,assets:f.uploads,...f.readOptions});assert.equal(captured.kind,'ready');snapshot=captured.backup;lineage=await Lineage.append(snapshot,snapshot,f.readOptions);
  for(const[kind,backup]of[['snapshot-v1',snapshot],['lineage-v1',lineage]])for(const coordinated of[false,true]){
   const options={kind,expected:backup.selection(),database:'identity-journal',sourceDatabase:'identity-source',writerRecovery:'host-reacquired',session:recoveryFactory(f.selected.options,{readOnly:false,access:'moderate'}),checkAuthority(){},...(coordinated?{cohort:{coordinatorDatabase:'identity-parent',uploadsDatabase:'identity-uploads'}}:{})},admitted=await readRestoredOperationInput(backup.file(),options);
   try{const identity=admitted.identity,original=backup.selection().original,parsed=await read(identity,original);assert.deepEqual(parsed.identity,identity);assert.deepEqual(parsed.input,{kind,selection:backup.selection(),fileSha256:admitted.fileSha256});assert.equal(parsed.journal,options.database);assert.deepEqual(parsed.cohort,options.cohort);assert.ok(Object.isFrozen(parsed.input.selection.original.identity.source));await assert.rejects(readPortableOperationIdentity(identity,original));await assert.rejects(read(snapshot.metadata().operation,original));const changing={...identity},reading=read(changing,original);changing.plan='changed';changing.operation='0'.repeat(64);assert.deepEqual((await reading).identity,identity);
    const alter=async(mutator,domain=coordinated?'breditor/coordinated-restored-operation/1\0':'breditor/restored-operation/1\0')=>{const p=JSON.parse(identity.plan);mutator(p);const plan=JSON.stringify(p);return{...identity,plan,operation:await segmentedDigest(domain+plan)};};
    for(const mutation of[p=>p.extra=true,p=>p.formatVersion=2,p=>p.input.kind='lineage-v2',p=>p.input.selection.extra=true,p=>p.input.fileSha256='A'.repeat(64),p=>p.input.selection.original.sha256='0'.repeat(64),p=>p.journal=p.source,p=>p.source='different-source'])await assert.rejects(read(await alter(mutation),original));
    await assert.rejects(read(await alter(()=>{},'wrong-domain\0'),original));await assert.rejects(read({...identity,extra:true},original));await assert.rejects(read({...identity,origin:'0'.repeat(64)},original));await assert.rejects(read({...identity,operation:'0'.repeat(64)},original));await assert.rejects(read({...identity,plan:' '.repeat(132*1024+1)},original));
    await assert.rejects(read(await alter(p=>{p.input={selection:p.input.selection,kind:p.input.kind,fileSha256:p.input.fileSha256};}),original));
    if(coordinated){for(const mutation of[p=>p.cohort.extra=true,p=>p.cohort.coordinatorDatabase=p.source,p=>p.cohort.uploadsDatabase=p.journal,p=>p.cohort.uploadsDatabase=p.cohort.coordinatorDatabase])await assert.rejects(read(await alter(mutation),original));}
   }finally{admitted.dispose();}
  }
 }finally{lineage?.dispose();snapshot?.dispose();await f?.close();profile.free();reset();}
});
