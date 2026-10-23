/** Real older input families with newer input-LIVE, plus the existing flat graph.
 * Each archive is produced and admitted through its actual implementation. */
import assert from 'node:assert/strict';
import {environment} from '../room-participant-inventory/environment.mjs';
import {portableFixture} from '../independent-operation/portable.mjs';
import {recoveryFactory} from '../independent-delivery-recovery/session.mjs';
import {recoveryFaults} from '../independent-delivery-recovery/storage.mjs';
import {insertCleanupText} from '../owned-core-cleanup/session.mjs';
import {graphFixture} from './session.mjs';
import {IndependentOperationLineageBackup as Lineage} from '../../../packages/breditor-collaboration/dist/independent_operation/lineage_archive.js';
import {portableOperationArchive} from '../../../packages/breditor-collaboration/dist/independent_operation/portable_backup.js';
import {operationLineageArchive} from '../../../packages/breditor-collaboration/dist/independent_operation/lineage_archive.js';

export async function readerRuntimeGraphFixture(input,kind){
 if(kind==='lineage-v2'){
  const f=await graphFixture(input);
  return{...f,input:f.graph,originalRecovery:()=>f.graph.originalRecovery()};
 }
 const reset=environment(),faults=recoveryFaults(),archives=[];let f;
 try{
  f=await portableFixture({...input,Participant:input.OldParticipant});
  await f.uploads.flush(async row=>'retained-reader-input/'+row.asset);
  const first=await input.captureOld({source:f.source,assets:f.uploads,...f.readOptions});
  assert.equal(first.kind,'ready');archives.push(first.backup);
  insertCleanupText(f.source.core,'Newer imported input LIVE ');
  f.source.core.dispatchReview({kind:'reply',data:{thread:f.thread,body:'Newer imported input review'}});
  await f.source.flush();
  const next=await input.captureOld({source:f.source,assets:f.uploads,...f.readOptions});
  assert.equal(next.kind,'ready');archives.push(next.backup);
  const incoming=kind==='snapshot-v1'?next.backup:await Lineage.append(first.backup,next.backup,f.readOptions);
  if(kind==='lineage-v1')archives.push(incoming);
  await f.source.discardAndClose();
  const options={kind,expected:incoming.selection(),database:input.tag+'-target-parent',journalDatabase:input.tag+'-target-journal',sourceDatabase:input.tag+'-target-source',uploadsDatabase:input.tag+'-target-uploads',writerRecovery:'host-reacquired',session:recoveryFactory(f.selected.options,{readOnly:false,access:'moderate'}),checkAuthority(){}};
  return{...f,input:incoming,options,faults,originalRecovery:()=>kind==='snapshot-v1'?portableOperationArchive.originalRecovery(incoming):operationLineageArchive.originalRecovery(incoming),async close(){faults.clear();for(const archive of archives.toReversed())archive.dispose();await f.close();faults.restore();reset();}};
 }catch(error){faults.clear();for(const archive of archives.toReversed())archive.dispose();await f?.close();faults.restore();reset();throw error;}
}
