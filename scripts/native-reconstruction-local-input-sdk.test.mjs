/** Failed-save recovery preserves the literal graph and future native history.
 * Controlled storage and actual native hosts, not physical crash qualification. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {join} from 'node:path';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {localInputOlderDisk} from './fixtures/native-reconstruction/local-input-older-disk.mjs';
import {sourceSnapshot} from './fixtures/native-reconstruction/older-disk.mjs';
import {inspectLocalInputNativeReconstruction as inspect} from '../packages/breditor-collaboration/dist/selected_native_reconstruction/inspect_local_input.js';
import {FlatLocalArchive as Archive} from '../packages/breditor-collaboration/dist/flat_local_operation/archive.js';
import {FlatLocalProvenance} from '../packages/breditor-collaboration/dist/flat_local_operation/framing.js';
import {OperationalFlatLocalParticipant as Participant} from '../packages/breditor-collaboration/dist/flat_local_operation/participant.js';
import {SharedRichEditor as Core,createSharedDocumentEditor} from '../packages/breditor-collaboration/dist/core.js';
import {initializeSharedReadOnly} from '../packages/breditor-collaboration/dist/initialize_read_only.js';
import {freeUnclaimedSharedRustOwner} from '../packages/breditor-collaboration/dist/raw_owner_lifetime.js';
import {independentHistoryNative} from '../packages/breditor-collaboration/dist/independent_history/native_port.js';
import {saveEvidence} from './candidate-release/evidence.mjs';
import {IndependentLocalOperationBackup,portableLocalOperationArchive as snapshot} from '../packages/breditor-collaboration/dist/independent_local_operation/portable_backup.js';
import {LOCAL_OPERATION_BACKUP_PREFIX_BYTES} from '../packages/breditor-collaboration/dist/independent_local_operation/portable_codec.js';
let fixtures,transport;
before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});
after(async()=>{transport?.restore();await fixtures?.close();if(fixtures){const rows=[];for(const item of fixtures.manifest.cases){let code;try{await fetch(item.endpoint,{signal:AbortSignal.timeout(2000)});}catch(error){code=error.cause?.code;}rows.push({endpoint:item.endpoint,closed:code==='ECONNREFUSED'});}saveEvidence(join(fixtures.directory,'native-reconstruction-graph-endpoints-closed.json'),{rows});assert.ok(rows.every(row=>row.closed));}});
/** A mutable oracle starts under the SAME current host policy as the target.
 * A readonly admission reader must not be toggled into an editing reference. */
async function reference(factory,recovery){
 const native=recovery,id=native.identity,history=factory.documentHistory,raw=await(history.kind==='original'?history.restoreOriginal(native.documentCheckpoint):history.restoreSegmented(native.documentCheckpoint));let core;
 try{
  initializeSharedReadOnly(raw,factory.readOnly);
  const editor={...factory.editor,...(id.native.searchHistory?{searchHistory:id.native.searchHistory}:{}),...(id.native.reviewedHistory?{reviewedHistory:id.native.reviewedHistory}:{}),...(id.documentHistory==='segmented-v1'?{segmentedHistory:'segmented-v1'}:{})};
  core=id.native.selectionEditing==='document-v1'?createSharedDocumentEditor(raw,editor):new Core(raw,editor);
  if(id.native.history==='typing-v1'&&core.view().historyGrouping!=='typing-v1')core.enableTypingHistory();if(id.native.rangeEditing==='general-v1'&&core.view().rangeEditing!=='general-v1')core.enableGeneralRanges();
  if(id.reviewHistory==='segmented-v1')core.enableSegmentedReview(factory.review,native.reviewCheckpoint);else core.enableReview(factory.review,native.reviewCheckpoint);
  core.sealIndependentHistoryPolicies(id.documentHistory,id.reviewHistory,id.native.history,id.native.rangeEditing);return core;
 }catch(error){core?.dispose();freeUnclaimedSharedRustOwner(raw);throw error;}
}
for(const family of ['local-operation-snapshot','local-operation-flat'])for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])test('local input reconstruction '+family+' '+documentSegmented+'/'+reviewSegmented+' preserves save phases, ancestry and future native Undo/Redo',async()=>{
 const tag='local-input-native-reconstruction-'+family+'-'+documentSegmented+'-'+reviewSegmented;console.log('LOCAL_INPUT_RECONSTRUCTION_START',tag);
 const f=await localInputOlderDisk(fixtures,tag,{family,documentSegmented,reviewSegmented}),oldSource=await sourceSnapshot(f.database),oldJournal=await sourceSnapshot(f.journal),recovery=session=>independentHistoryNative(session).read();let archive,attempt,parts,oracle;
 try{
  const names=(await indexedDB.databases()).map(row=>row.name).sort(),inspected=await inspect(f.s.owner,f.s.input(),{id:family,retained:f.retained,outputFamily:'local-operation-flat'}),recipe=inspected.recipe;
  assert.equal(recipe.kind,'ready');assert.equal(recipe.sourceFamily,family);assert.equal(recipe.family,'local-operation-flat');assert.notDeepEqual(inspected.before.selection,inspected.retained.selection);assert.deepEqual(recipe.retained.selection,f.retained.selection);assert.deepEqual((await indexedDB.databases()).map(row=>row.name).sort(),names);
  const read={session:f.factory,checkAuthority(){}};archive=await Archive.read(recipe.participant.file,recipe.participant.selection,read);
  assert.deepEqual(archive.live(),f.source.live);
  const framing=await FlatLocalProvenance.read(archive.file(),{manifestSha256:archive.selection().manifestSha256},()=>{});try{const metadata=framing.metadata(),last=JSON.parse(await framing.statePart().text()),input=await framing.incomingFile(metadata.root,()=>{});assert.deepEqual(last.intent,f.source.snapshot.record);assert.equal(last.observed,f.source.snapshot.observed);const payload=async ref=>framing.payload(ref.sha256,ref.bytes),cut=async ref=>ref===null?null:{head:await(await payload(ref.head)).text(),files:await Promise.all(ref.files.map(async row=>{const{payload:part,...record}=row;return{...record,json:await(await payload(part)).text()};}))};assert.deepEqual(await cut(last.current),f.source.snapshot.current);assert.deepEqual(await cut(last.pending),f.source.snapshot.pending);assert.deepEqual(Buffer.from(await input.arrayBuffer()),Buffer.from(await f.loaded.participantFile(family).arrayBuffer()));}finally{framing.dispose();}
  if(family==='local-operation-snapshot'){
   // Independent literal reconstruction of the pre-extraction seed expression,
   // using only this test-generated input. No historical document enters Git.
   const literal=await snapshot.read.call(IndependentLocalOperationBackup,f.loaded.participantFile(family),f.loaded.participant(family).selection,read),framing=await FlatLocalProvenance.read(archive.file(),{manifestSha256:archive.selection().manifestSha256},()=>{});let expected;
   try{const header=snapshot.metadata.call(literal),input=snapshot.file.call(literal),start=LOCAL_OPERATION_BACKUP_PREFIX_BYTES+new TextEncoder().encode(JSON.stringify(header)).length,metadata=framing.metadata(),extras=metadata.states[0].additions.map(at=>{const row=metadata.payloads[at];return framing.payload(row.sha256,row.bytes);});expected=await FlatLocalProvenance.seed(input.slice(0,start),header.parts.map(p=>input.slice(start+p.offset,start+p.offset+p.bytes)),input.type,framing.statePart(),()=>{},extras);assert.deepEqual(Buffer.from(await expected.file().arrayBuffer()),Buffer.from(await archive.file().arrayBuffer()));}finally{expected?.dispose();framing.dispose();snapshot.dispose.call(literal);}
  }
  assert.deepEqual(Buffer.from(await archive.uploads().arrayBuffer()),Buffer.from(await f.loaded.originalUploads(family).arrayBuffer()));
  const factory={...f.factory,readOnly:false,review:{...f.factory.review,access:'comment'}},options={kind:'flat-local-v1',expected:archive.selection(),database:tag+'-new-journal',sourceDatabase:tag+'-new-source',cohort:{parentDatabase:tag+'-new-parent',uploadsDatabase:tag+'-new-uploads'},sourceFactory:factory,writerRecovery:'host-reacquired',checkAuthority(){}};
  await assert.rejects(Participant.begin(archive.file(),options).then(async value=>{attempt=value;await value.check();}),error=>error.code==='writer_in_use');await attempt?.close();attempt=undefined;
  await f.s.owner.close();attempt=await Participant.resume(options);await attempt.check();parts=await attempt.intoParts();attempt=undefined;
  assert.deepEqual(recovery(parts.source.session),f.source.live);assert.equal(parts.source.session.core.documentJson(),f.live.document);
  await parts.source.session.close();parts.uploads.close();parts=undefined;
  attempt=await Participant.resume(options);await attempt.check();parts=await attempt.intoParts();attempt=undefined;
  assert.deepEqual(recovery(parts.source.session),f.source.live);
  oracle=await reference(factory,f.source.live);
  for(const core of [parts.source.session.core,oracle]){core.setReadOnly(false);core.setReviewAccess('comment');}
  const pair=core=>[core.checkpointJson(),reviewSegmented?core.reviewSegmentedCheckpoint():core.reviewCheckpoint()];assert.deepEqual(pair(parts.source.session.core),pair(oracle));let documentChanges=0,reviewChanges=0;
  for(const method of ['redo','undo','undo','redo','redo','undo']){
   const actual=parts.source.session.core[method]();assert.deepEqual(actual,oracle[method]());if(actual)documentChanges++;
   const review=method==='redo'?'redoReview':'undoReview',result=parts.source.session.core[review]();assert.deepEqual(result,oracle[review]());if(result.kind==='committed')reviewChanges++;
   assert.deepEqual(pair(parts.source.session.core),pair(oracle));
  }
  assert.ok(documentChanges>=4);assert.ok(reviewChanges>=2);await parts.source.session.flush();const final=recovery(parts.source.session);
  assert.deepEqual(final.versions,f.source.live.versions);
  await parts.source.session.close();parts.uploads.close();parts=undefined;attempt=await Participant.resume(options);await attempt.check();parts=await attempt.intoParts();attempt=undefined;assert.deepEqual(recovery(parts.source.session),final);
  assert.deepEqual(await sourceSnapshot(f.database),oldSource);assert.deepEqual(await sourceSnapshot(f.journal),oldJournal);
  saveEvidence(join(fixtures.directory,tag+'.json'),{passed:true,documentSegmented,reviewSegmented,failedActualWrites:f.failures,literalInputUnchanged:true,savePhasesUnchanged:true,newerLiveRecovered:true,futureDocumentChanges:documentChanges,futureReviewChanges:reviewChanges,oldSourceAndJournalUnchanged:true,roomActivated:false});console.log('LOCAL_INPUT_RECONSTRUCTION_PASS',tag);
 }finally{oracle?.dispose();if(parts){await parts.source.session.discardAndClose();parts.uploads.close();}await attempt?.discardAndClose();archive?.dispose();await f.close();}
});
