/** Capture a complete association and keep its prior journals held through
 * the caller’s choice retention and durable preparation. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {nativeActivationHostPort,type SharedDurableNativeActivationHost} from '../native_activation_control/host.js';
import {nativePublicationHostPort,type SharedNativeRoomPublicationHost} from '../native_publication_control/host.js';
import {rebindDecodedRoomActivationIntent} from '../room_native_activation_intent/rebind.js';
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
export async function withCapturedJointReassociation<T>(
 scope:SelectedNativeRecoveryScope,origin:ColdJointActivationOriginWork,provided:JointReassociationCaptureInput,
 options:SharedArchiveIntegrityOptions,visit:(captured:CapturedJointReassociation,held:SharedArchiveIntegrityOptions)=>Promise<T>,
):Promise<T>{
 checkColdJointActivationOrigin(origin,scope);
 if(typeof visit!=='function')throw fail();
 const r=fields(provided,['database','nativeIntentDatabase','activation','publication','destinations','previous','prior']),activation=nativeActivationHostPort(r['activation'] as SharedDurableNativeActivationHost),publication=nativePublicationHostPort(r['publication'] as SharedNativeRoomPublicationHost),previous=r['previous']===null?null:jointReassociationChoice(r['previous']),prior=r['prior']===null?null:continuationChoice(r['prior']);
 if(previous&&!equal(previous.plan.original,origin.choice))throw fail('joint_activation_intent_stale');
 const name=database(r['database']),nativeName=database(r['nativeIntentDatabase']),d=fields(r['destinations'],['database','preparationDatabase','reviewDatabase','metadataDatabase']),destinations={database:database(d['database']),preparationDatabase:database(d['preparationDatabase']),reviewDatabase:database(d['reviewDatabase']),metadataDatabase:database(d['metadataDatabase'])};
 const check=()=>{origin.check();activation.check();publication.check();origin.check();};
 const run=async(parentCheck:()=>void,parentRevocations:readonly AbortSignal[])=>withSelectedPriorMetadata(scope,origin,previous?.plan.destinations??origin.choice.plan.destinations,prior,async(evidence,priorCheck,priorRevocations)=>{
  const waits=new NativeReconstructionWaits(()=>{options.checkAuthority();check();parentCheck();priorCheck();check();},
   [scope.signal,options.signal,...origin.revocations,...parentRevocations,...priorRevocations,...activation.signals,...publication.signals]);
  const guarded={wasm:options.wasm,checkAuthority:waits.check,signal:waits.signal};
  try{
   const entries:JointReassociationPredecessor[]=[...(previous?.plan.predecessors??[])];
   if(previous){const{format:_format,formatVersion:_version,original:_original,predecessors:_predecessors,...record}=previous.plan;entries.push({...record,bytes:previous.bytes,sha256:previous.sha256});}
   const draft={...origin.retained.choice,database:nativeName,activation:activation.selection};
   const before=jointReassociationPlan({format:'breditor/joint-native-room-reassociation-plan',formatVersion:1,database:name,original:origin.choice,predecessors:entries,activation:draft,publication:publication.selection,destinations,prior:evidence});waits.check();
   const encoded=await rebindDecodedRoomActivationIntent(nativeName,activation.selection,origin.retained.capture,guarded);waits.check();
   if(!equal(encoded.choice,before.activation))throw fail('joint_activation_intent_stale');
   const file=new Blob([JSON.stringify(before)],{type:'application/json'}),integrity=prepareArchiveIntegrity(guarded),choice=jointReassociationChoice({format:'breditor/joint-native-room-reassociation-intent',formatVersion:1,plan:before,bytes:file.size,sha256:await integrity.digest(file)});waits.check();
   const result=await visit(Object.freeze({choice,native:encoded}),guarded);
   waits.check();return result;
  }finally{waits.close();}
 });
 return previous?withHeldReassociationIntents(scope,origin,previous,options,held=>run(held.check,held.revocations)):run(origin.check,[]);
}
