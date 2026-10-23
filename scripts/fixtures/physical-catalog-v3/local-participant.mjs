/** Real room-derived local lineage: original recovery -> snapshot -> flat.
 * No selected file or writer is fabricated, rebound or merged. */
import assert from 'node:assert/strict';
import{localParticipant}from'../independent-inventory/local-participant.mjs';
import{localRecoveryOptions}from'../independent-recovery/session.mjs';
import{OperationalIndependentLocalParticipant as OriginalParent}from'../../../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import{OperationalRestoredLocalParticipant as SnapshotParent}from'../../../packages/breditor-collaboration/dist/restored_local_operation/participant.js';
import{OperationalFlatLocalParticipant as FlatParent}from'../../../packages/breditor-collaboration/dist/flat_local_operation/participant.js';
import{captureLocalOperationBackup}from'../../../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js';
import{captureFlatLocalOperation}from'../../../packages/breditor-collaboration/dist/flat_local_operation/capture.js';
export async function roomLocalParticipant(input){
 const{api,tag}=input,h=await localParticipant(input),archives=[],parents=[],parts=[];let attempt,ready;
 const recovery=localRecoveryOptions(h.options,h.backup,tag+'-recovery'),readOptions={session:recovery.session,checkAuthority(){}},factory=Object.fromEntries(Object.entries(h.options).filter(([k])=>!['database','create'].includes(k)));
 try{
  h.source.dispose();await h.session.close();h.uploads.close();attempt=await api.SharedIndependentParticipantRecovery.begin({...recovery,backup:h.backup});ready=await attempt.finish();
  const original=await OriginalParent.begin({database:tag+'-original-parent',journalDatabase:tag+'-original-journal',sourceDatabase:tag+'-original-source',recovery,session:{...h.options,database:tag+'-original-source'},recovered:ready,writerRecovery:'host-reacquired'});parents.push(original);let active=await original.intoParts();parts.push(active);
  const snapshot=await captureLocalOperationBackup({source:active.source.session,assets:active.uploads,...readOptions});assert.equal(snapshot.kind,'ready');archives.push(snapshot.backup);await active.source.session.discardAndClose();active.uploads.close();
  const options={expected:snapshot.backup.selection(),kind:'snapshot-v1',database:tag+'-snapshot-journal',sourceDatabase:tag+'-snapshot-source',sourceFactory:factory,writerRecovery:'host-reacquired',checkAuthority(){},cohort:{parentDatabase:tag+'-snapshot-parent',uploadsDatabase:tag+'-snapshot-uploads'}};
  const restored=await SnapshotParent.begin(snapshot.backup.file(),options);parents.push(restored);active=await restored.intoParts();parts.push(active);
  const flat=await captureFlatLocalOperation({source:active.source.session,assets:active.uploads,...readOptions});assert.equal(flat.kind,'ready');archives.push(flat.backup);await active.source.session.discardAndClose();active.uploads.close();
  const repeated=await FlatParent.begin(flat.backup.file(),{...options,kind:'flat-local-v1',expected:flat.backup.selection(),database:tag+'-flat-journal',sourceDatabase:tag+'-flat-source',cohort:{parentDatabase:tag+'-flat-parent',uploadsDatabase:tag+'-flat-uploads'}});parents.push(repeated);active=await repeated.intoParts();parts.push(active);
  return{...h,source:active.source.session,uploads:active.uploads,snapshot:snapshot.backup,flat:flat.backup,readOptions,async close(){for(const value of parts.toReversed()){await value.source.session.discardAndClose();value.uploads.close();}for(const parent of parents.toReversed())await parent.discardAndClose();await ready?.discardAndClose();await attempt?.close();for(const archive of archives)archive.dispose();await h.close();}};
 }catch(error){for(const value of parts.toReversed()){await value.source.session.discardAndClose();value.uploads.close();}for(const parent of parents.toReversed())await parent.discardAndClose();await ready?.discardAndClose();await attempt?.close();for(const archive of archives)archive.dispose();await h.close();throw error;}
}
