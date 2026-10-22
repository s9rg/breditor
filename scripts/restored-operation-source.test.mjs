/** Actual native source restore, retained input and cold pending replay. Controlled IDB
 * and locks; not upload-owner handoff, whole-room activation or physical durability. */
import test,{before,after}from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import{pathToFileURL}from'node:url';
import * as api from'../packages/breditor-collaboration/dist/index.js';
import * as rich from'@breditor/experimental-rich-content';
import{OperationalIndependentDeliveryParticipant as Participant}from'../packages/breditor-collaboration/dist/independent_operation/participant.js';
import{captureIndependentOperationBackup as capture}from'../packages/breditor-collaboration/dist/independent_operation/portable_capture.js';
import{IndependentOperationLineageBackup as Lineage}from'../packages/breditor-collaboration/dist/independent_operation/lineage_archive.js';
import{RestoredOperationJournal as Journal,restoredOperationJournalBinding as binding}from'../packages/breditor-collaboration/dist/restored_operation/journal.js';
import{openRestoredOperationSource as restoreSource}from'../packages/breditor-collaboration/dist/restored_operation/open_source.js';
import{existingOperationJournalDatabase}from'../packages/breditor-collaboration/dist/independent_operation/journal_database.js';
import{openIndependentHistoryDatabase}from'../packages/breditor-collaboration/dist/independent_history/database.js';
import{environment}from'./fixtures/room-participant-inventory/environment.mjs';
import{nativeProfile,insertCleanupText}from'./fixtures/owned-core-cleanup/session.mjs';
import{portableFixture}from'./fixtures/independent-operation/portable.mjs';
import{recoveryFactory}from'./fixtures/independent-delivery-recovery/session.mjs';
import{recoveryFaults,databaseValues,change,unknownDatabase}from'./fixtures/independent-delivery-recovery/storage.mjs';
const runtime=process.env.BREDITOR_RESTORED_OPERATION_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname,seed=JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url),'utf8')),bytes=async b=>Buffer.from(await b.arrayBuffer());let profile,sequence=0;
before(async()=>{const native=await import(pathToFileURL(runtime+'/breditor_shared.js'));await native.default({module_or_path:readFileSync(runtime+'/breditor_shared_bg.wasm')});profile=nativeProfile(native,3,true);});after(()=>profile?.free());
async function fixture(selection={},withPending=true){
 const reset=environment(),faults=recoveryFaults();let f,backup;
 try{f=await portableFixture({api,rich,Participant,profile,seed,tag:'restored-operation-'+sequence++,selection});
  insertCleanupText(f.source.core,'Acknowledged CURRENT ');await f.source.flush();
  if(withPending){faults.select(f.options.sourceDatabase,'operation_history_heads',1,'abort');insertCleanupText(f.source.core,'Pending source commit ');await assert.rejects(f.source.flush());faults.clear();insertCleanupText(f.source.core,'Newer offline LIVE ');f.setWrite(false);await assert.rejects(f.source.flush());}
  const result=await capture({source:f.source,assets:f.uploads,...f.readOptions});assert.equal(result.kind,'ready');backup=result.backup;
  await f.source.discardAndClose();const options={kind:'snapshot-v1',expected:backup.selection(),database:f.options.sourceDatabase+'-restore-journal',sourceDatabase:f.options.sourceDatabase+'-restored',writerRecovery:'host-reacquired',session:recoveryFactory(f.selected.options,{readOnly:false,access:'moderate'}),checkAuthority(){}};
  return{...f,backup,options,faults,async close(){faults.clear();backup?.dispose();await f.close();faults.restore();reset();}};
 }catch(e){faults.clear();backup?.dispose();await f?.close();faults.restore();reset();throw e;}
}
for(const documentSegmented of[false,true])for(const reviewSegmented of[false,true])test(`restores original/CURRENT/PENDING/LIVE with native history and exact input, document=${documentSegmented}, review=${reviewSegmented}`,async()=>{
 const f=await fixture({documentSegmented,reviewSegmented});let restored,cold,reference;
 try{
  assert.ok(f.backup.pendingCut());const incoming=await bytes(f.backup.file()),original=await bytes(f.backup.originalFile()),live=f.backup.liveSource(),pair=source=>[source.core.checkpointJson(),reviewSegmented?source.core.reviewSegmentedCheckpoint():source.core.reviewCheckpoint()];
  reference=await api.SharedIndependentDeliverySession.restoreRecovery({...f.selected.options,database:f.options.sourceDatabase+'-reference',recovery:live,writerRecovery:'host-reacquired'});const future=[];for(const method of['undo','redo','undo']){assert.equal(reference.core[method](),true);const review=method==='undo'?'undoReview':'redoReview';assert.equal(reference.core[review]().kind,'committed');future.push(pair(reference));}await reference.close();reference=undefined;
  restored=await restoreSource(f.options,f.backup.file());const b=binding(restored.journal);assert.deepEqual(b.readSource(restored.source),live);assert.deepEqual(await bytes(b.inputFile()),incoming);assert.deepEqual(await bytes(b.originalFile()),original);assert.deepEqual(await b.progress(),{completed:4,total:4,ready:true,pending:false});
  assert.throws(()=>restored.source.exportRecovery(),e=>e.code==='independent_operation_export_required');assert.throws(()=>api.captureSharedIndependentDeliverySource({session:restored.source}),e=>e.code==='independent_operation_export_required');assert.equal('RestoredOperationJournal'in api,false);
  await assert.rejects(existingOperationJournalDatabase(f.options.database));await assert.rejects(openIndependentHistoryDatabase(f.options.sourceDatabase));
  f.backup.dispose();for(const[index,method]of['undo','redo','undo'].entries()){assert.equal(restored.source.core[method](),true);assert.equal(restored.source.core[method==='undo'?'undoReview':'redoReview']().kind,'committed');assert.deepEqual(pair(restored.source),future[index]);}await restored.source.flush();const saved=b.readSource(restored.source);await restored.source.close();restored=undefined;
  cold=await restoreSource(f.options);assert.deepEqual(binding(cold.journal).readSource(cold.source),saved);assert.deepEqual(await bytes(binding(cold.journal).inputFile()),incoming);assert.deepEqual(await bytes(binding(cold.journal).originalFile()),original);
  insertCleanupText(cold.source.core,'Editable after cold restore ');await cold.source.flush();assert.match(cold.source.core.documentJson(),/Editable after cold restore/);const stored=await databaseValues(f.options.database);assert.equal(stored.restored_operation_cuts.values.length,1);assert.deepEqual(await bytes(stored.restored_operation_input.values[0]),incoming);
 }finally{await restored?.source.discardAndClose();await cold?.source.discardAndClose();await reference?.discardAndClose();await f.close();}
});
for(const boundary of['source-abort','source-lost-ack','journal-prepare-abort','journal-ack-abort','journal-ack-lost-ack'])for(const stage of[1,2,3,4])test(`cold restore finishes exact pending before later cuts, ${boundary}, stage=${stage}`,async()=>{
 const f=await fixture();let restored;
 try{
  const source=boundary.startsWith('source'),database=source?f.options.sourceDatabase:f.options.database,store=source?'restored_operation_history_heads':'restored_operation_stage',number=source?stage:2*stage-(boundary==='journal-prepare-abort'?1:0),kind=boundary.endsWith('lost-ack')?'lost-ack':'abort';
  f.faults.select(database,store,number,kind);await assert.rejects(restoreSource(f.options,f.backup.file()));f.faults.clear();
  const before=await databaseValues(f.options.database),cursor=before.restored_operation_stage.values[0];assert.ok(cursor.completed===stage-1||boundary==='journal-ack-lost-ack'&&cursor.completed===stage);assert.deepEqual(await bytes(before.restored_operation_input.values[0]),await bytes(f.backup.file()));
  restored=await restoreSource(f.options);assert.deepEqual(binding(restored.journal).readSource(restored.source),f.backup.liveSource());assert.equal((await binding(restored.journal).progress()).ready,true);assert.equal((await databaseValues(f.options.database)).restored_operation_cuts.values.length,1);
 }finally{f.faults.clear();await restored?.source.discardAndClose();await f.close();}
});
test('restoring a flat lineage owns its exact incoming graph, not only the latest snapshot',async()=>{
 const f=await fixture({},false);let first=f.backup,later,lineage,restored;
 try{
  // A later independently selected live snapshot continues the earlier complete input.
  const live=first.liveSource(),temp=await api.SharedIndependentDeliverySession.restoreRecovery({...f.selected.options,database:f.options.sourceDatabase+'-lineage-reference',recovery:live,writerRecovery:'host-reacquired'});await temp.close();
  // Equal native states are legal; the graph still records the immutable predecessor.
  lineage=await Lineage.append(first,first,f.readOptions);const incoming=await bytes(lineage.file()),selected=lineage.selection();restored=await restoreSource({...f.options,kind:'lineage-v1',expected:selected},lineage.file());lineage.dispose();first.dispose();assert.deepEqual(await bytes(binding(restored.journal).inputFile()),incoming);assert.deepEqual(binding(restored.journal).readSource(restored.source),live);await restored.source.close();restored=await restoreSource({...f.options,kind:'lineage-v1',expected:selected});assert.deepEqual(await bytes(binding(restored.journal).inputFile()),incoming);
 }finally{await restored?.source.discardAndClose();lineage?.dispose();later?.dispose();await f.close();}
});
for(const part of['input','original','source-head','extra-source-head'])test(`cold restore refuses changed ${part} instead of repairing or overwriting`,async()=>{
 const f=await fixture();let restored;
 try{restored=await restoreSource(f.options,f.backup.file());await restored.source.close();restored=undefined;
  if(part==='input'||part==='original')await change(f.options.database,'restored_operation_'+part,s=>s.put(new Blob(['changed']),part));
  else await change(f.options.sourceDatabase,'restored_operation_history_heads',s=>s.put('changed',part==='source-head'?['room',f.selected.options.writer]:['foreign','writer']));
  const before=await databaseValues(f.options.sourceDatabase);await assert.rejects(restoreSource(f.options));assert.deepEqual(await databaseValues(f.options.sourceDatabase),before);
 }finally{await restored?.source.discardAndClose();await f.close();}
});
test('begin never adopts existing namespaces; resume needs exact host selection and fresh authority',async()=>{
 const f=await fixture();let restored;
 try{await unknownDatabase(f.options.database);const before=await databaseValues(f.options.database);await assert.rejects(restoreSource(f.options,f.backup.file()));assert.deepEqual(await databaseValues(f.options.database),before);
  const options={...f.options,database:f.options.database+'-new'};restored=await restoreSource(options,f.backup.file());await restored.source.close();restored=undefined;
  await assert.rejects(restoreSource({...options,checkAuthority(){throw Error('revoked');}}),e=>e.code==='participant_authority');await assert.rejects(restoreSource({...options,checkAuthority:async()=>{}}));await assert.rejects(restoreSource({...options,sourceDatabase:options.sourceDatabase+'-other'}));restored=await restoreSource(options);assert.deepEqual(binding(restored.journal).readSource(restored.source),f.backup.liveSource());
 }finally{await restored?.source.discardAndClose();await f.close();}
});
test('authority lost after the final actual acknowledgement retains a cold-resumable complete input',async()=>{
 const f=await fixture();let restored,grant=true;const options={...f.options,checkAuthority(){if(!grant)throw Error('revoked');}};
 try{f.faults.select(options.database,'restored_operation_stage',8,'after-commit',()=>{grant=false;});await assert.rejects(restoreSource(options,f.backup.file()));f.faults.clear();const stored=await databaseValues(options.database);assert.equal(stored.restored_operation_stage.values[0].completed,4);assert.deepEqual(await bytes(stored.restored_operation_input.values[0]),await bytes(f.backup.file()));grant=true;restored=await restoreSource(options);assert.deepEqual(binding(restored.journal).readSource(restored.source),f.backup.liveSource());}
 finally{grant=true;f.faults.clear();await restored?.source.discardAndClose();await f.close();}
});
