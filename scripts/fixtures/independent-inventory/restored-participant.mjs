/** Development fixture: real original recovery -> operation -> snapshot restore -> graph restore. */
import assert from 'node:assert/strict';
import {OperationalIndependentDeliveryParticipant as OldParticipant} from '../../../packages/breditor-collaboration/dist/independent_operation/participant.js';
import {captureIndependentOperationBackup as captureOld} from '../../../packages/breditor-collaboration/dist/independent_operation/portable_capture.js';
import {RestoredOperationParticipant as Participant} from '../../../packages/breditor-collaboration/dist/restored_participant/participant.js';
import {captureRestoredGraph} from '../../../packages/breditor-collaboration/dist/restored_graph/capture.js';
import {recoveryFactory,recoveryOptions} from '../independent-delivery-recovery/session.mjs';
import {independentParticipant} from './independent-participant.mjs';
export async function restoredParticipant(input){
 const {api,tag}=input,h=await independentParticipant(input),archives=[];let attempt,ready,oldOwner,owner,parts,write=true,read=true;const writerAbort=new AbortController();
 const readOptions={session:recoveryFactory(h.options),checkAuthority(){if(!read)throw Error('current read denied');}},currentFactory=recoveryFactory(h.options,{readOnly:h.options.readOnly,access:h.options.review.access});
 try{
  h.source.dispose();await h.session.close();h.uploads.close();
  const recovery=recoveryOptions(h.options,h.backup,tag+'-original-recovery');attempt=await api.SharedIndependentDeliveryParticipantRecovery.begin({...recovery,backup:h.backup});ready=await attempt.finish();
  oldOwner=await OldParticipant.begin({database:tag+'-operation-journal',sourceDatabase:tag+'-operation-source',writerRecovery:'host-reacquired',recovery:{...recovery,session:currentFactory},recovered:ready});parts=await oldOwner.intoParts();
  const original=await captureOld({source:parts.source.session,assets:parts.uploads,...readOptions});assert.equal(original.kind,'ready');archives.push(original.backup);await parts.source.session.discardAndClose();parts.uploads.close();parts=undefined;
  const first={kind:'snapshot-v1',expected:original.backup.selection(),database:tag+'-snapshot-parent',journalDatabase:tag+'-snapshot-journal',sourceDatabase:tag+'-snapshot-source',uploadsDatabase:tag+'-snapshot-uploads',writerRecovery:'host-reacquired',session:currentFactory,checkAuthority(){}};
  owner=await Participant.begin(original.backup.file(),first);await owner.finish();parts=await owner.intoParts();const graph=await captureRestoredGraph({source:parts.source.session,assets:parts.uploads,...readOptions});assert.equal(graph.kind,'ready');archives.push(graph.archive);await parts.source.session.discardAndClose();parts.uploads.close();parts=undefined;
  const second={...first,kind:'lineage-v2',expected:graph.archive.selection(),database:tag+'-graph-parent',journalDatabase:tag+'-graph-journal',sourceDatabase:tag+'-graph-source',uploadsDatabase:tag+'-graph-uploads',signal:writerAbort.signal,checkAuthority(){if(!write)throw Error('current writer denied');}};
  owner=await Participant.begin(graph.archive.file(),second);await owner.finish();parts=await owner.intoParts();write=false;writerAbort.abort();await assert.rejects(parts.source.session.flush());const latest=await captureRestoredGraph({source:parts.source.session,assets:parts.uploads,...readOptions});assert.equal(latest.kind,'ready');archives.push(latest.archive);
  const result={...h,source:parts.source.session,session:parts.source.session,uploads:parts.uploads,backup:latest.archive,prior:graph.archive,readOptions,setRead(value){read=value;},async capture(){const next=await captureRestoredGraph({source:parts.source.session,assets:parts.uploads,...readOptions});assert.equal(next.kind,'ready');archives.push(next.archive);return next.archive;},async close(){await parts?.source.session.discardAndClose();parts?.uploads.close();await owner?.discardAndClose();await oldOwner?.discardAndClose();await ready?.discardAndClose();await attempt?.close();for(const archive of archives)archive.dispose();await h.close();}};return result;
 }catch(error){await parts?.source.session.discardAndClose();parts?.uploads.close();await owner?.discardAndClose();await oldOwner?.discardAndClose();await ready?.discardAndClose();await attempt?.close();for(const archive of archives)archive.dispose();await h.close();throw error;}
}
