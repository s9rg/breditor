/** Genuine source kinds and failed generation writes. Native generations,
 * both Undo lanes, packets and whole uploads survive absent-only recovery.
 * Controlled browser storage is not physical crash or room activation proof.
 */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {join} from 'node:path';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {generationOlderDisk} from './fixtures/native-reconstruction/generation-older-disk.mjs';
import {sourceSnapshot} from './fixtures/native-reconstruction/older-disk.mjs';
import {inspectGenerationNativeReconstruction as inspect} from '../packages/breditor-collaboration/dist/selected_native_reconstruction/inspect_generation.js';
import {SharedGenerationParticipantBackup as Backup} from '../packages/breditor-collaboration/dist/generation_participant/backup.js';
import {SharedGenerationParticipantRecovery as Recovery} from '../packages/breditor-collaboration/dist/generation_participant/recovery.js';
import {captureSharedGenerationSource as capture} from '../packages/breditor-collaboration/dist/generation_source/capture.js';
import {SharedSegmentedPersistentSession as Local} from '../packages/breditor-collaboration/dist/persistence/segmented_session.js';
import {SharedSegmentedRelaySession as Relay} from '../packages/breditor-collaboration/dist/segmented_relay/session.js';
import {replayGenerationReferenceRecords} from '../packages/breditor-collaboration/dist/generation_source/record_reference_capture.js';
import {nativeRestoreBinding} from '../packages/breditor-collaboration/dist/native_restore_factory.js';
import {pixelAsset,secondAsset} from './fixtures/review-assets/pixels.mjs';
import {saveEvidence} from './candidate-release/evidence.mjs';
let fixtures,transport;
before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});
after(async()=>{transport?.restore();await fixtures?.close();if(fixtures){const rows=[];for(const item of fixtures.manifest.cases){let code;try{await fetch(item.endpoint,{signal:AbortSignal.timeout(2000)});}catch(error){code=error.cause?.code;}rows.push({endpoint:item.endpoint,closed:code==='ECONNREFUSED'});}saveEvidence(join(fixtures.directory,'native-reconstruction-generation-endpoints-closed.json'),{rows});assert.ok(rows.every(row=>row.closed));}});
for(const kind of ['retained','local','relay','continued-local'])test('retained generation reconstruction '+kind+' preserves failed attempt, newer pending and native generations after cold reopen',async()=>{
 const tag='generation-native-reconstruction-'+kind;console.log('GENERATION_RECONSTRUCTION_START',tag);
 const f=await generationOlderDisk(fixtures,tag,kind),oldSource=await sourceSnapshot(f.database);
 const continued=kind==='continued-local',relay=kind==='relay'||kind==='retained';
 const snapshot=async session=>continued?session.exportContinuedBackup():kind==='retained'?session.exportRetainedRecovery():session.exportRecovery();
 const native=recovery=>continued?recovery.current:relay?recovery.source:recovery;
 let backup,attempt,recovered,parts,oracle,cold;
 try{
  const names=(await indexedDB.databases()).map(row=>row.name).sort(),inspected=await inspect(f.s.owner,f.s.input(),{id:'generation',retained:f.retained}),recipe=inspected.recipe;
  assert.equal(recipe.kind,'ready');assert.equal(recipe.family,'generation');assert.equal(recipe.participant.selection.identity.source.kind,kind);assert.notDeepEqual(inspected.before.selection,inspected.retained.selection);assert.deepEqual(recipe.retained.selection,f.retained.selection);assert.deepEqual((await indexedDB.databases()).map(row=>row.name).sort(),names);
  backup=await Backup.read(recipe.participant.file,recipe.participant.selection);assert.deepEqual(backup.sourceRecovery(),f.recovery);
  if(continued){
   assert.ok(backup.blob(pixelAsset,'original-raster'));
   assert.ok(backup.blob(secondAsset,'attempt-raster'));
   assert.ok(backup.blob(secondAsset,'pending-raster'));
  }
  const destinations={source:tag+'-new-source',uploads:tag+'-new-uploads'},options={database:tag+'-new-attempt',expected:backup.selection(),backup,destinations,session:f.factory,checkAuthority(){}};const {backup:_input,...resumeOptions}=options;
  await assert.rejects(Recovery.begin(options).then(async value=>{attempt=value;await value.finish();}),error=>error.code==='writer_in_use');await attempt?.close();attempt=undefined;
  await f.s.owner.close();attempt=await Recovery.resume(resumeOptions);recovered=await attempt.finish();attempt=undefined;parts=await recovered.intoParts();recovered=undefined;
  let selected=capture(parts.source);try{await backup.verifyRecovered(selected,parts.uploads);}finally{selected.dispose();}
  assert.deepEqual(await snapshot(parts.source.session),f.recovery);assert.equal(parts.source.session.core.documentJson(),f.live.document);assert.deepEqual(await sourceSnapshot(f.database),oldSource);
  const initial=await snapshot(parts.source.session),uploads=await parts.uploads.exportBackup();await parts.source.session.close();parts.uploads.close();parts=undefined;
  attempt=await Recovery.resume(resumeOptions);recovered=await attempt.finish();attempt=undefined;parts=await recovered.intoParts();recovered=undefined;
  selected=capture(parts.source);try{await backup.verifyRecovered(selected,parts.uploads);}finally{selected.dispose();}
  const records=backup.records();oracle=await replayGenerationReferenceRecords(f.source.identity,records,nativeRestoreBinding(f.read.restoreSegmented,f.read),f.read.editor,f.descriptor,f.loaded.check,f.read.restoreContinued);
  for(const core of [parts.source.session.core,oracle.core]){core.setReadOnly(false);core.setReviewAccess('comment');}
  const pair=core=>[core.checkpointJson(),core.reviewCheckpoint()];let documentChanges=0,reviewChanges=0;
  for(const method of ['redo','undo','undo','redo','redo','undo']){
   const actual=parts.source.session.core[method]();assert.deepEqual(actual,oracle.core[method]());if(actual)documentChanges++;
   const review=method==='redo'?'redoReview':'undoReview',result=parts.source.session.core[review]();assert.deepEqual(result,oracle.core[review]());if(result.kind==='committed')reviewChanges++;
   assert.deepEqual(pair(parts.source.session.core),pair(oracle.core));
  }
  assert.ok(documentChanges>=4);assert.ok(reviewChanges>=2);await parts.source.session.flush();const final=await snapshot(parts.source.session),checkpoint=native(final).checkpoint;
  const beforeArchive=JSON.parse(f.live.checkpoint),afterArchive=JSON.parse(checkpoint);assert.equal(afterArchive.rootCheckpoint,beforeArchive.rootCheckpoint);assert.deepEqual(afterArchive.sealed,beforeArchive.sealed);
  if(relay)assert.deepEqual(final.relay,initial.relay);
  if(kind==='retained')assert.deepEqual(final.retained,initial.retained);
  if(continued){
   assert.deepEqual(final.predecessor,initial.predecessor);
   assert.equal(afterArchive.continuedAfter,beforeArchive.continuedAfter);
   const raster=await parts.uploads.get(pixelAsset);
   assert.equal(raster.status,'uploaded');assert.equal(raster.storageRef,'fixture/continued-raster');
  }
  assert.deepEqual(native(final).versions,native(initial).versions);
  await parts.source.session.close();parts.uploads.close();parts=undefined;
  const open={...f.factory.options,database:destinations.source,initialGenerations:{root:'unused',active:'unused-two'},create(){throw Error('No empty source fallback');}};
  cold=await(continued?Local.openContinued(open):kind==='local'?Local.open(open):kind==='relay'?Relay.open(open):Relay.openRetained(open));assert.deepEqual(await snapshot(cold),final);
  assert.deepEqual(new Uint8Array(await uploads.arrayBuffer()),new Uint8Array(await backup.uploadBackup().arrayBuffer()));assert.deepEqual(await sourceSnapshot(f.database),oldSource);
  saveEvidence(join(fixtures.directory,tag+'.json'),{passed:true,kind,failedActualWrites:f.failures,oldDiskMissingNewerNative:true,completeAttemptRetained:true,newerPendingRetained:true,immutableSealedGenerations:beforeArchive.sealed.length,futureDocumentChanges:documentChanges,futureReviewChanges:reviewChanges,oldSourceUnchanged:true,roomActivated:false});console.log('GENERATION_RECONSTRUCTION_PASS',tag);
 }finally{await cold?.discardAndClose();oracle?.dispose();if(parts){await parts.source.session.discardAndClose();parts.uploads.close();}await recovered?.discardAndClose();await attempt?.close();backup?.dispose();await f.close();}
});
