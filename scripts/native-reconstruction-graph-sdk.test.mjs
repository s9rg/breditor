/** Failed-save recovery preserves the literal graph and future native history.
 * Controlled storage and actual native hosts, not physical crash qualification. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {join} from 'node:path';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {graphOlderDisk} from './fixtures/native-reconstruction/graph-older-disk.mjs';
import {sourceSnapshot} from './fixtures/native-reconstruction/older-disk.mjs';
import {inspectGraphNativeReconstruction as inspect} from '../packages/breditor-collaboration/dist/selected_native_reconstruction/inspect_graph.js';
import {RestoredOperationGraphArchive as Archive} from '../packages/breditor-collaboration/dist/restored_graph/archive.js';
import {RestoredOperationParticipant as Participant} from '../packages/breditor-collaboration/dist/restored_participant/participant.js';
import {SharedRichEditor as Core,createSharedDocumentEditor} from '../packages/breditor-collaboration/dist/core.js';
import {initializeSharedReadOnly} from '../packages/breditor-collaboration/dist/initialize_read_only.js';
import {freeUnclaimedSharedRustOwner} from '../packages/breditor-collaboration/dist/raw_owner_lifetime.js';
import {independentDeliverySource} from '../packages/breditor-collaboration/dist/independent_delivery_source/admission.js';
import {saveEvidence} from './candidate-release/evidence.mjs';
let fixtures,transport;
before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});
after(async()=>{transport?.restore();await fixtures?.close();if(fixtures){const rows=[];for(const item of fixtures.manifest.cases){let code;try{await fetch(item.endpoint,{signal:AbortSignal.timeout(2000)});}catch(error){code=error.cause?.code;}rows.push({endpoint:item.endpoint,closed:code==='ECONNREFUSED'});}saveEvidence(join(fixtures.directory,'native-reconstruction-graph-endpoints-closed.json'),{rows});assert.ok(rows.every(row=>row.closed));}});
/** A mutable oracle starts under the SAME current host policy as the target.
 * A readonly admission reader must not be toggled into an editing reference. */
async function reference(factory,recovery){
 const native=recovery.source,id=native.identity,history=factory.documentHistory,raw=await(history.kind==='original'?history.restoreOriginal(native.documentCheckpoint):history.restoreSegmented(native.documentCheckpoint));let core;
 try{
  initializeSharedReadOnly(raw,factory.readOnly);
  const editor={...factory.editor,...(id.native.searchHistory?{searchHistory:id.native.searchHistory}:{}),...(id.native.reviewedHistory?{reviewedHistory:id.native.reviewedHistory}:{}),...(id.documentHistory==='segmented-v1'?{segmentedHistory:'segmented-v1'}:{})};
  core=id.native.selectionEditing==='document-v1'?createSharedDocumentEditor(raw,editor):new Core(raw,editor);
  if(id.native.history==='typing-v1'&&core.view().historyGrouping!=='typing-v1')core.enableTypingHistory();if(id.native.rangeEditing==='general-v1'&&core.view().rangeEditing!=='general-v1')core.enableGeneralRanges();
  if(id.reviewHistory==='segmented-v1')core.enableSegmentedReview(factory.review,native.reviewCheckpoint);else core.enableReview(factory.review,native.reviewCheckpoint);
  core.sealIndependentHistoryPolicies(id.documentHistory,id.reviewHistory,id.native.history,id.native.rangeEditing);return core;
 }catch(error){core?.dispose();freeUnclaimedSharedRustOwner(raw);throw error;}
}
for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])test('graph reconstruction '+documentSegmented+'/'+reviewSegmented+' preserves save phases, ancestry and future native Undo/Redo',async()=>{
 const tag='graph-native-reconstruction-'+documentSegmented+'-'+reviewSegmented;console.log('GRAPH_RECONSTRUCTION_START',tag);
 const f=await graphOlderDisk(fixtures,tag,{documentSegmented,reviewSegmented}),oldSource=await sourceSnapshot(f.database),oldJournal=await sourceSnapshot(f.journal),recovery=session=>independentDeliverySource(session).read();let archive,attempt,parts,oracle;
 try{
  const names=(await indexedDB.databases()).map(row=>row.name).sort(),inspected=await inspect(f.s.owner,f.s.input(),{id:'restored-graph',retained:f.retained}),recipe=inspected.recipe;
  assert.equal(recipe.kind,'ready');assert.equal(recipe.sourceFamily,'restored-graph');assert.equal(recipe.family,'restored-graph');assert.notDeepEqual(inspected.before.selection,inspected.retained.selection);assert.deepEqual(recipe.retained.selection,f.retained.selection);assert.deepEqual((await indexedDB.databases()).map(row=>row.name).sort(),names);
  const read={session:f.factory,checkAuthority(){}};archive=await Archive.read(recipe.participant.file,recipe.participant.selection,read);
  assert.deepEqual(archive.liveSource(),f.source.live);assert.deepEqual(archive.currentCut(),f.source.snapshot.current);assert.deepEqual(archive.pendingCut(),f.source.snapshot.pending);
  assert.deepEqual(archive.latestMetadata().intent,f.source.snapshot.record);assert.equal(archive.latestMetadata().observed,f.source.snapshot.observed);
  assert.deepEqual(Buffer.from(await(await archive.inputFile()).arrayBuffer()),Buffer.from(await f.loaded.participantFile('restored-graph').arrayBuffer()));
  assert.deepEqual(Buffer.from(await archive.uploadBackup().arrayBuffer()),Buffer.from(await f.loaded.originalUploads('restored-graph').arrayBuffer()));
  const options={kind:'lineage-v2',expected:archive.selection(),database:tag+'-new-parent',journalDatabase:tag+'-new-journal',sourceDatabase:tag+'-new-source',uploadsDatabase:tag+'-new-uploads',session:{...f.factory,readOnly:false,review:{...f.factory.review,access:'comment'}},writerRecovery:'host-reacquired',checkAuthority(){}};
  await assert.rejects(Participant.begin(archive.file(),options).then(async value=>{attempt=value;await value.finish();}),error=>error.code==='writer_in_use');await attempt?.close();attempt=undefined;
  await f.s.owner.close();attempt=await Participant.resume(options);await attempt.finish();parts=await attempt.intoParts();attempt=undefined;
  assert.deepEqual(recovery(parts.source.session),f.source.live);assert.equal(parts.source.session.core.documentJson(),f.live.document);
  await parts.source.session.close();parts.uploads.close();parts=undefined;
  attempt=await Participant.resume(options);await attempt.finish();parts=await attempt.intoParts();attempt=undefined;
  assert.deepEqual(recovery(parts.source.session),f.source.live);
  oracle=await reference(options.session,f.source.live);
  for(const core of [parts.source.session.core,oracle]){core.setReadOnly(false);core.setReviewAccess('comment');}
  const pair=core=>[core.checkpointJson(),reviewSegmented?core.reviewSegmentedCheckpoint():core.reviewCheckpoint()];assert.deepEqual(pair(parts.source.session.core),pair(oracle));let documentChanges=0,reviewChanges=0;
  for(const method of ['redo','undo','undo','redo','redo','undo']){
   const actual=parts.source.session.core[method]();assert.deepEqual(actual,oracle[method]());if(actual)documentChanges++;
   const review=method==='redo'?'redoReview':'undoReview',result=parts.source.session.core[review]();assert.deepEqual(result,oracle[review]());if(result.kind==='committed')reviewChanges++;
   assert.deepEqual(pair(parts.source.session.core),pair(oracle));
  }
  assert.ok(documentChanges>=4);assert.ok(reviewChanges>=2);await parts.source.session.flush();const final=recovery(parts.source.session);
  assert.deepEqual(final.retained,f.source.live.retained);assert.deepEqual(final.relay,f.source.live.relay);assert.deepEqual(final.source.versions,f.source.live.source.versions);
  await parts.source.session.close();parts.uploads.close();parts=undefined;attempt=await Participant.resume(options);await attempt.finish();parts=await attempt.intoParts();attempt=undefined;assert.deepEqual(recovery(parts.source.session),final);
  assert.deepEqual(await sourceSnapshot(f.database),oldSource);assert.deepEqual(await sourceSnapshot(f.journal),oldJournal);
  saveEvidence(join(fixtures.directory,tag+'.json'),{passed:true,documentSegmented,reviewSegmented,failedActualWrites:f.failures,literalInputUnchanged:true,savePhasesUnchanged:true,newerLiveRecovered:true,futureDocumentChanges:documentChanges,futureReviewChanges:reviewChanges,oldSourceAndJournalUnchanged:true,roomActivated:false});console.log('GRAPH_RECONSTRUCTION_PASS',tag);
 }finally{oracle?.dispose();if(parts){await parts.source.session.discardAndClose();parts.uploads.close();}await attempt?.discardAndClose();archive?.dispose();await f.close();}
});
