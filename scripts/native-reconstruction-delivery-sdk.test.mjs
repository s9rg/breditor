/** Actual failed saves, retained native suffix, nonempty delivery work and cold
 * participant recovery for all four independent document/comment lane choices.
 * Controlled storage is not physical power-loss or whole-room activation.
 */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {deliveryOlderDisk} from './fixtures/native-reconstruction/delivery-older-disk.mjs';
import {sourceSnapshot} from './fixtures/native-reconstruction/older-disk.mjs';
import {inspectDeliveryNativeReconstruction as inspect} from '../packages/breditor-collaboration/dist/selected_native_reconstruction/inspect_delivery.js';
import {SharedIndependentDeliveryParticipantBackup as Backup} from '../packages/breditor-collaboration/dist/independent_delivery_participant/backup.js';
import {SharedIndependentDeliveryParticipantRecovery as Recovery} from '../packages/breditor-collaboration/dist/independent_delivery_recovery/recovery.js';
import {SharedIndependentDeliverySession as Session} from '../packages/breditor-collaboration/dist/independent_delivery/session.js';
import {SharedIndependentDeliverySourceCapture as Capture} from '../packages/breditor-collaboration/dist/independent_delivery_source/capture.js';
import {SharedRichEditor as Core,createSharedDocumentEditor} from '../packages/breditor-collaboration/dist/core.js';
import {initializeSharedReadOnly} from '../packages/breditor-collaboration/dist/initialize_read_only.js';
import {freeUnclaimedSharedRustOwner} from '../packages/breditor-collaboration/dist/raw_owner_lifetime.js';
import {saveEvidence} from './candidate-release/evidence.mjs';
let fixtures,transport;
before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});
after(async()=>{
 transport?.restore();await fixtures?.close();
 if(fixtures){const rows=[];for(const item of fixtures.manifest.cases){let code;try{await fetch(item.endpoint,{signal:AbortSignal.timeout(2000)});}catch(error){code=error.cause?.code;}rows.push({endpoint:item.endpoint,closed:code==='ECONNREFUSED'});}saveEvidence(join(fixtures.directory,'native-reconstruction-delivery-endpoints-closed.json'),{rows});assert.ok(rows.every(row=>row.closed));}
});
async function reference(factory,recovery){
 const native=recovery.source,id=native.identity,history=factory.documentHistory;
 const raw=await(history.kind==='original'?history.restoreOriginal(native.documentCheckpoint):history.restoreSegmented(native.documentCheckpoint));let core;
 try{
  initializeSharedReadOnly(raw,true);
  const editor={...factory.editor,...(id.native.searchHistory?{searchHistory:id.native.searchHistory}:{}),...(id.native.reviewedHistory?{reviewedHistory:id.native.reviewedHistory}:{}),...(id.documentHistory==='segmented-v1'?{segmentedHistory:'segmented-v1'}:{})};
  core=id.native.selectionEditing==='document-v1'?createSharedDocumentEditor(raw,editor):new Core(raw,editor);
  if(id.native.history==='typing-v1'&&core.view().historyGrouping!=='typing-v1')core.enableTypingHistory();
  if(id.native.rangeEditing==='general-v1'&&core.view().rangeEditing!=='general-v1')core.enableGeneralRanges();
  if(id.reviewHistory==='segmented-v1')core.enableSegmentedReview(factory.review,native.reviewCheckpoint);else core.enableReview(factory.review,native.reviewCheckpoint);
  core.sealIndependentHistoryPolicies(id.documentHistory,id.reviewHistory,id.native.history,id.native.rangeEditing);return core;
 }catch(error){core?.dispose();freeUnclaimedSharedRustOwner(raw);throw error;}
}
for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])test('retained delivery reconstruction '+documentSegmented+'/'+reviewSegmented+' preserves queued decisions, revisions and versions after failed saves',async()=>{
 const tag='delivery-native-reconstruction-'+documentSegmented+'-'+reviewSegmented;console.log('DELIVERY_RECONSTRUCTION_START',tag);
 const f=await deliveryOlderDisk(fixtures,tag,{documentSegmented,reviewSegmented}),oldSource=await sourceSnapshot(f.database),oldJournal=await sourceSnapshot(f.journal);
 let backup,attempt,recovered,parts,oracle,cold;
 try{
  const names=(await indexedDB.databases()).map(row=>row.name).sort(),inspected=await inspect(f.s.owner,f.s.input(),{id:'independent-delivery',retained:f.retained}),recipe=inspected.recipe;
  assert.equal(recipe.kind,'ready');assert.equal(recipe.family,'independent-delivery');assert.deepEqual(recipe.retained.selection,f.retained.selection);assert.notDeepEqual(inspected.before.selection,inspected.retained.selection);assert.deepEqual((await indexedDB.databases()).map(row=>row.name).sort(),names);
  backup=await Backup.read(recipe.participant.file,recipe.participant.selection);assert.deepEqual(backup.sourceRecovery(),f.source.live);
  assert.ok(backup.sourceRecovery().retained.suggestions.retained.some(row=>row.intent?.requested==='reject'&&row.decision===null));
  assert.ok(backup.sourceRecovery().retained.revisions.retained.some(row=>row.receipt===null));
  assert.ok(backup.sourceRecovery().retained.versions.packets.some(row=>row.publish&&row.accepted===null));
  const destinations={source:tag+'-new-source',uploads:tag+'-new-uploads'},options={database:tag+'-new-attempt',backup,expected:backup.selection(),destinations,session:f.factory,checkAuthority(){}};
  const {backup:_inputBackup,...resumeOptions}=options;
  await assert.rejects(Recovery.begin(options).then(async value=>{attempt=value;await value.finish();}),error=>error.code==='writer_in_use');await attempt?.close();attempt=undefined;
  await f.s.owner.close();attempt=await Recovery.resume(resumeOptions);recovered=await attempt.finish();attempt=undefined;parts=await recovered.intoParts();recovered=undefined;
  let captured=Capture.capture(parts.source);try{await backup.verifyRecovered(captured,parts.uploads);}finally{captured.dispose();}
  assert.deepEqual(parts.source.session.exportRecovery(),f.source.live);assert.equal(parts.source.session.core.documentJson(),f.live.document);
  assert.deepEqual(await sourceSnapshot(f.database),oldSource);assert.deepEqual(await sourceSnapshot(f.journal),oldJournal);
  const initial=parts.source.session.exportRecovery(),uploads=await parts.uploads.exportBackup();
  await parts.source.session.close();parts.uploads.close();parts=undefined;
  attempt=await Recovery.resume(resumeOptions);recovered=await attempt.finish();attempt=undefined;parts=await recovered.intoParts();recovered=undefined;
  captured=Capture.capture(parts.source);try{await backup.verifyRecovered(captured,parts.uploads);}finally{captured.dispose();}
  oracle=await reference(f.factory,initial);for(const core of [parts.source.session.core,oracle]){core.setReadOnly(false);core.setReviewAccess('comment');}
  const pair=core=>[core.checkpointJson(),reviewSegmented?core.reviewSegmentedCheckpoint():core.reviewCheckpoint()];let documentChanges=0,reviewChanges=0;
  for(const method of ['redo','undo','undo','redo','redo','undo']){
   const changed=parts.source.session.core[method]();assert.deepEqual(changed,oracle[method]());if(changed)documentChanges++;
   const review=method==='redo'?'redoReview':'undoReview',result=parts.source.session.core[review]();assert.deepEqual(result,oracle[review]());if(result.kind==='committed')reviewChanges++;
   assert.deepEqual(pair(parts.source.session.core),pair(oracle));
  }
  assert.ok(documentChanges>=4);assert.ok(reviewChanges>=2);await parts.source.session.flush();const final=parts.source.session.exportRecovery();
  await parts.source.session.close();parts.uploads.close();parts=undefined;
  cold=await Session.open({...f.factory,database:destinations.source,create(){throw Error('No empty source fallback');}});
  assert.deepEqual(cold.exportRecovery(),final);assert.deepEqual(final.retained,initial.retained);assert.deepEqual(final.relay,initial.relay);assert.deepEqual(final.source.versions,initial.source.versions);
  assert.deepEqual(new Uint8Array(await uploads.arrayBuffer()),new Uint8Array(await backup.uploadBackup().arrayBuffer()));
  assert.deepEqual(await sourceSnapshot(f.database),oldSource);assert.deepEqual(await sourceSnapshot(f.journal),oldJournal);
  saveEvidence(join(fixtures.directory,tag+'.json'),{passed:true,documentSegmented,reviewSegmented,failedActualWrites:f.failures,olderPendingPreserved:true,newerLiveMissingOnCold:true,queuedSuggestions:initial.retained.suggestions.retained.length,queuedRevisions:initial.retained.revisions.retained.length,queuedVersions:initial.retained.versions.packets.length,nativeVersions:initial.source.versions.length,futureDocumentChanges:documentChanges,futureReviewChanges:reviewChanges,originalDatabasesUnchanged:true,roomActivated:false});
  console.log('DELIVERY_RECONSTRUCTION_PASS',tag);
 }finally{
  await cold?.discardAndClose();oracle?.dispose();if(parts){await parts.source.session.discardAndClose();parts.uploads.close();}
  await recovered?.discardAndClose();await attempt?.close();backup?.dispose();await f.close();
 }
});
