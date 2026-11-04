/** Capture a new complete association under an actual private target. No
 * request, destination write, actor transfer, or saved readiness is performed. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {nativeActivationHostPort,type SharedDurableNativeActivationHost} from '../native_activation_control/host.js';
import {nativePublicationHostPort,type SharedNativeRoomPublicationHost} from '../native_publication_control/host.js';
import {encodeRoomActivationIntent} from '../room_native_activation_intent/encode.js';
import type {RoomActivationEncodedCapture} from '../room_native_activation_intent/contract.js';
import {checkColdJointActivationOrigin,type ColdJointActivationOriginWork} from '../native_room_joint_activation/cold_origin.js';
import type {MetadataContinuationChoice,MetadataContinuationDestinations} from '../selected_local_metadata_continuation/contract.js';
import {continuationChoice} from '../selected_local_metadata_continuation/policy.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {database} from '../physical_room_asset_adoption/policy.js';
import {jointEqual as equal,jointIntentFailure as fail} from '../native_room_joint_activation/intent_policy.js';
import {jointReassociationPlan,jointReassociationChoice} from './identity.js';
import {withHeldReassociationIntents} from './held_intents.js';
import {withSelectedPriorMetadata} from './prior_metadata.js';
import type {JointReassociationChoice,JointReassociationPredecessor} from './contract.js';
export interface JointReassociationCaptureInput {
 readonly database:string;readonly nativeIntentDatabase:string;
 readonly activation:SharedDurableNativeActivationHost;
 readonly publication:SharedNativeRoomPublicationHost;
 readonly destinations:MetadataContinuationDestinations;
 readonly previous:JointReassociationChoice|null;
 readonly prior:MetadataContinuationChoice|null;
}
export interface CapturedJointReassociation {
 readonly choice:JointReassociationChoice;
 readonly native:RoomActivationEncodedCapture;
}
export async function captureJointReassociation(scope:SelectedNativeRecoveryScope,origin:ColdJointActivationOriginWork,provided:JointReassociationCaptureInput,options:SharedArchiveIntegrityOptions):Promise<CapturedJointReassociation>{
 checkColdJointActivationOrigin(origin,scope);
 const r=fields(provided,['database','nativeIntentDatabase','activation','publication','destinations','previous','prior']),activation=nativeActivationHostPort(r['activation'] as SharedDurableNativeActivationHost),publication=nativePublicationHostPort(r['publication'] as SharedNativeRoomPublicationHost),previous=r['previous']===null?null:jointReassociationChoice(r['previous']),prior=r['prior']===null?null:continuationChoice(r['prior']);
 if(previous&&!equal(previous.plan.original,origin.choice))throw fail('joint_activation_intent_stale');
 const name=database(r['database']),nativeName=database(r['nativeIntentDatabase']),d=fields(r['destinations'],['database','preparationDatabase','reviewDatabase','metadataDatabase']),destinations={database:database(d['database']),preparationDatabase:database(d['preparationDatabase']),reviewDatabase:database(d['reviewDatabase']),metadataDatabase:database(d['metadataDatabase'])};
 const check=()=>{origin.check();activation.check();publication.check();origin.check();};
 const run=async(parentCheck:()=>void)=>withSelectedPriorMetadata(scope,origin,previous?.plan.destinations??origin.choice.plan.destinations,prior,async(evidence,priorCheck)=>{
  const held=()=>{check();parentCheck();priorCheck();check();};held();
  const entries:JointReassociationPredecessor[]=[...(previous?.plan.predecessors??[])];
  if(previous){const{format:_format,formatVersion:_version,original:_original,predecessors:_predecessors,...record}=previous.plan;entries.push({...record,bytes:previous.bytes,sha256:previous.sha256});}
  const draft={...origin.retained.choice,database:nativeName,activation:activation.selection};
  const before=jointReassociationPlan({format:'breditor/joint-native-room-reassociation-plan',formatVersion:1,database:name,original:origin.choice,predecessors:entries,activation:draft,publication:publication.selection,destinations,prior:evidence});held();
  const encoded=await encodeRoomActivationIntent(nativeName,activation.selection,origin.retained.capture,{...options,checkAuthority:held,signal:scope.signal});held();
  if(!equal(encoded.choice,before.activation))throw fail('joint_activation_intent_stale');
  const file=new Blob([JSON.stringify(before)],{type:'application/json'}),integrity=prepareArchiveIntegrity({...options,checkAuthority:held,signal:scope.signal}),choice=jointReassociationChoice({format:'breditor/joint-native-room-reassociation-intent',formatVersion:1,plan:before,bytes:file.size,sha256:await integrity.digest(file)});held();
  return Object.freeze({choice,native:encoded});
 });
 return previous?withHeldReassociationIntents(scope,origin,previous,options,held=>run(held.check)):run(check);
}
