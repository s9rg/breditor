/** Original retained-LIVE reconstruction uses actual native history, absent
 * destinations and real cold owners. It is not whole-room activation. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {originalOlderDisk,sourceSnapshot} from './fixtures/native-reconstruction/older-disk.mjs';
import {selectedProviderSession} from './fixtures/selected-room-provider/session.mjs';
import {thirdPixel,ParticipantFixtureImage} from './fixtures/review-assets/participant-pixels.mjs';
import {buildOriginalReconstructionRecipe as build} from '../packages/breditor-collaboration/dist/selected_native_reconstruction/original_recipe.js';
import {inspectOriginalNativeReconstruction as inspect} from '../packages/breditor-collaboration/dist/selected_native_reconstruction/inspect_original.js';
import {LoadedNativeReconstructionCurrent as Loaded} from '../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';
import {SharedParticipantBackup} from '../packages/breditor-collaboration/dist/participant_backup/archive.js';
import {SharedParticipantRecovery} from '../packages/breditor-collaboration/dist/participant_recovery/recovery.js';
import {SharedReviewPersistentSession} from '../packages/breditor-collaboration/dist/persistence/review_session.js';
import {SharedRichEditor} from '../packages/breditor-collaboration/dist/core.js';
import {captureSharedAssetReferences} from '../packages/breditor-collaboration/dist/asset_references_capture.js';
import {saveEvidence} from './candidate-release/evidence.mjs';
let fixtures,transport;
before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});
after(async()=>{transport?.restore();await fixtures?.close();if(fixtures){const rows=[];for(const item of fixtures.manifest.cases){let code;try{await fetch(item.endpoint,{signal:AbortSignal.timeout(2000)});}catch(error){code=error.cause?.code;}rows.push({endpoint:item.endpoint,closed:code==='ECONNREFUSED'});}saveEvidence(join(fixtures.directory,'native-reconstruction-endpoints-closed.json'),{rows});assert.ok(rows.every(row=>row.closed));}});
test('failed-save retained LIVE reconstructs document/comment histories and dependent stores without overwriting old sources',async()=>{
 const f=await originalOlderDisk(fixtures,'native-reconstruct-original'),original=await sourceSnapshot(f.database);let backup,attempt,recovered,reference,reopened;
 try{
  const names=(await indexedDB.databases()).map(row=>row.name).sort(),inspection=await inspect(f.s.owner,f.s.input(),{id:'original',retained:f.retained}),recipe=inspection.recipe;assert.equal(inspection.scope,'held-current-versus-retained-data-only');assert.notDeepEqual(inspection.before.selection,inspection.retained.selection);assert.equal(recipe.kind,'ready');assert.deepEqual(recipe.retained.selection,f.retained.selection);assert.deepEqual(new Uint8Array(await recipe.retained.file.arrayBuffer()),new Uint8Array(await f.retained.file.arrayBuffer()));assert.deepEqual((await indexedDB.databases()).map(row=>row.name).sort(),names,'DATA construction opens no mutable destinations');
  backup=await SharedParticipantBackup.read(recipe.participant.file,recipe.participant.selection);assert.equal(backup.records()[0].json,f.live.checkpoint);const paired=JSON.parse(backup.records().find(row=>row.kind==='paired-session').json);assert.equal(paired.reviewCheckpointJson,f.live.review);assert.equal(paired.documentCheckpointJson,f.live.checkpoint);
  const {backup:_backup,expected:_expected,database:_database,destinations:_destinations,...fresh}=f.options,destinations=Object.fromEntries(Object.keys(_destinations).map(key=>[key,'native-reconstruct-destination-'+key])),options={...fresh,database:'native-reconstruct-attempt',backup,expected:backup.selection(),destinations,checkAuthority(){}};
  await assert.rejects(SharedParticipantRecovery.begin(options).then(async value=>{attempt=value;await value.finish();}),error=>error.code==='writer_in_use');await attempt?.close();attempt=undefined;
  await f.s.owner.close();attempt=await SharedParticipantRecovery.resume(options);recovered=await attempt.finish();attempt=undefined;assert.equal(recovered.session.core.checkpointJson(),f.live.checkpoint);assert.equal(recovered.session.core.reviewCheckpoint(),f.live.review);assert.equal(recovered.session.core.documentJson(),f.live.document);assert.deepEqual(await sourceSnapshot(f.database),original);
  let captured=captureSharedAssetReferences(recovered.sources);try{await backup.verifyRecovered(captured,recovered.uploads);assert.deepEqual(captured.records(),backup.records());}finally{captured.dispose();}assert.equal((await recovered.uploads.list()).length,backup.uploadEntries().length);
  await recovered.close();recovered=undefined;attempt=await SharedParticipantRecovery.resume(options);recovered=await attempt.finish();attempt=undefined;captured=captureSharedAssetReferences(recovered.sources);try{await backup.verifyRecovered(captured,recovered.uploads);}finally{captured.dispose();}
  reference=new SharedRichEditor(f.options.session.options.restore(f.live.checkpoint));reference.enableReview(f.options.session.options.review,f.live.review);recovered.session.core.setReadOnly(false);
  for(const method of ['redo','undo','undo','redo','redo','undo']){assert.deepEqual(recovered.session.core[method](),reference[method]());const review=method==='redo'?'redoReview':'undoReview';assert.deepEqual(recovered.session.core[review](),reference[review]());assert.equal(recovered.session.core.checkpointJson(),reference.checkpointJson());assert.equal(recovered.session.core.reviewCheckpoint(),reference.reviewCheckpoint());}
  const final={document:reference.checkpointJson(),review:reference.reviewCheckpoint()};await recovered.close();recovered=undefined;reopened=await SharedReviewPersistentSession.open({...f.options.session.options,database:destinations.document,create(){throw Error('No empty-source fallback');}});assert.equal(reopened.core.checkpointJson(),final.document);assert.equal(reopened.core.reviewCheckpoint(),final.review);assert.deepEqual(await sourceSnapshot(f.database),original);
 }finally{await reopened?.discardAndClose();reference?.dispose();await recovered?.discardAndClose();await attempt?.close();backup?.dispose();await f.close();}
});
test('a same-author branch in the actual cold owner refuses preflight and retains both complete inputs unchanged',async()=>{
 const f=await originalOlderDisk(fixtures,'native-reconstruct-conflict');
 try{
  const client=f.s.owner.clients.find(row=>row.id==='original');client.core.type('Different own branch');client.core.dispatchReview({kind:'create_thread',data:{anchorJson:client.core.captureReviewAnchor({kind:'document'}),body:'Competing own comment'}});
  const live=[client.core.checkpointJson(),client.core.reviewCheckpoint()],names=(await indexedDB.databases()).map(row=>row.name).sort();
  await assert.rejects(inspect(f.s.owner,f.s.input(),{id:'original',retained:f.retained}));assert.deepEqual([client.core.checkpointJson(),client.core.reviewCheckpoint()],live);assert.deepEqual((await indexedDB.databases()).map(row=>row.name).sort(),names);assert.deepEqual(f.loaded.file().selection,f.retained.selection);
 }finally{await f.close();}
});
test('reconstruction DATA refuses malformed factories, changed descriptors, cancellation and grant loss without mutable stores',async()=>{
 const f=await originalOlderDisk(fixtures,'native-reconstruct-fences'),names=(await indexedDB.databases()).map(row=>row.name).sort();let loaded,raw;
 try{
  const options={id:'original',read:f.read,descriptor:f.descriptor};let invoked=0;
  await assert.rejects(build(f.loaded,{...options,read:{get restore(){invoked++;return f.read.restore;}}}));assert.equal(invoked,0);
  await assert.rejects(build(f.loaded,{...options,descriptor:'{}'}));
  const controller=new AbortController();controller.abort();await assert.rejects(build(f.loaded,{...options,assets:{signal:controller.signal}}),error=>error.code==='native_reconstruction_aborted');
  let allowed=true;loaded=await Loaded.read(f.retained,{wasm:fixtures.native,checkAuthority(){if(!allowed)throw Error('Current read grant ended');}});
  await assert.rejects(build(loaded,{...options,read:{restore(checkpoint){raw=f.read.restore(checkpoint);allowed=false;return raw;}}}));allowed=true;loaded.check();loaded.dispose();loaded=undefined;
  assert.deepEqual((await indexedDB.databases()).map(row=>row.name).sort(),names);
  f.loaded.dispose();await assert.rejects(build(f.loaded,options),error=>error.code==='native_reconstruction_closed');
 }finally{loaded?.dispose();await f.close();}
});
test('newer selected upload state refuses an older retained candidate even when native histories match',async()=>{
 const s=await selectedProviderSession(fixtures,'native-reconstruct-upload',{documentSegmented:false,reviewSegmented:false}),image=Object.getOwnPropertyDescriptor(globalThis,'Image');
 try{
  const retained=await s.retain(),assets=s.owner.assets('original');Object.defineProperty(globalThis,'Image',{value:ParticipantFixtureImage,configurable:true});const added=await assets.ingest(new Blob([thirdPixel],{type:'image/png'}));assert.equal(added.status,'pending');
  const current=await assets.list(),native=s.owner.clients.map(row=>[row.id,row.core.checkpointJson(),row.core.reviewCheckpoint()]),names=(await indexedDB.databases()).map(row=>row.name).sort();
  await assert.rejects(inspect(s.owner,s.input(),{id:'original',retained}),error=>error.code==='asset_adoption_diverged');assert.deepEqual(await assets.list(),current);assert.deepEqual(s.owner.clients.map(row=>[row.id,row.core.checkpointJson(),row.core.reviewCheckpoint()]),native);assert.deepEqual((await indexedDB.databases()).map(row=>row.name).sort(),names);
 }finally{try{if(image)Object.defineProperty(globalThis,'Image',image);}finally{await s.close();}}
});
