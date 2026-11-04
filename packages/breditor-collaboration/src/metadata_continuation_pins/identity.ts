/** Inert closed DATA admission, without reading or creating any journal. */
import {fields,hash,integer} from '../physical_room_record_cut/policy.js';
import {snapshotJointActivationData} from '../native_room_joint_activation/intent_policy.js';
import {continuationChoice} from '../selected_local_metadata_continuation/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {MAX_PINNED_METADATA_SNAPSHOT_BYTES,metadataPinsFailure as fail} from './policy.js';
import type {MetadataContinuationEvidencePins,MetadataSnapshotPin} from './contract.js';
const snapshotPin=(input:unknown):MetadataSnapshotPin|null=>{if(input===null)return null;const p=fields(input,['bytes','sha256']);return{bytes:integer(p['bytes'],MAX_PINNED_METADATA_SNAPSHOT_BYTES,1),sha256:hash(p['sha256'])};};
export function metadataContinuationEvidencePins(input:unknown):MetadataContinuationEvidencePins{
 try{
  const r=fields(snapshotJointActivationData(input),['format','formatVersion','choice','phase','review','metadata']);
  if(r['format']!=='breditor/metadata-continuation-evidence-pins'||r['formatVersion']!==1)throw fail();
  const phase=r['phase'];if(!['absent','intent','prepared','review','metadata'].includes(phase as string))throw fail();
  const review=snapshotPin(r['review']),metadata=snapshotPin(r['metadata']);
  if((review!==null)!==['review','metadata'].includes(phase as string)||(metadata!==null)!==(phase==='metadata')||(review?.bytes??0)+(metadata?.bytes??0)>MAX_PINNED_METADATA_SNAPSHOT_BYTES)throw fail();
  return frozen({format:'breditor/metadata-continuation-evidence-pins' as const,formatVersion:1 as const,choice:continuationChoice(r['choice']),phase:phase as MetadataContinuationEvidencePins['phase'],review,metadata});
 }catch{throw fail();}
}
