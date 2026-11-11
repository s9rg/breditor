/** Retain the complete sealed restart choice before either destination write.
 * A retry can finish those exact writes after the new controllers retire. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {archiveGuard} from '../archive_integrity/policy.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {database} from '../physical_room_asset_adoption/policy.js';
import {nativeActivationHostPort,type SharedDurableNativeActivationHost} from '../native_activation_control/host.js';
import {nativePublicationHostPort,type SharedNativeRoomPublicationHost} from '../native_publication_control/host.js';
import type {SharedServerLogGenerationDeliveryPathRecoveryHost} from '../generation_delivery_path_control/host.js';
import {heldHandoverActivationPath} from '../room_native_handover_activation_intent/path.js';
import {handoverActivationReassociationChoice} from '../room_native_handover_activation_intent/reassociate_choice.js';
import {prepareHeldHandoverActivationReassociation,resumeHeldHandoverActivationReassociation} from '../room_native_handover_activation_intent/reassociate.js';
import type {RoomHandoverActivationIntentStore} from '../room_native_handover_activation_intent/store.js';
import {retainActivationChoice} from '../room_native_activation_intent/retain_choice.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {checkColdJointActivationOrigin,withColdHandoverActivationIntent,type ColdJointHandoverOriginWork} from '../native_room_joint_activation/cold_origin.js';
import {jointEqual as equal,jointIntentFailure as fail} from '../native_room_joint_activation/intent_policy.js';
import type {MetadataContinuationDestinations} from '../selected_local_metadata_continuation/contract.js';
import {handoverMetadataContinuationChoice} from '../selected_local_metadata_continuation/handover_choice.js';
import type {HandoverMetadataContinuationChoice} from '../selected_local_metadata_continuation/handover_contract.js';
import {jointHandoverReassociationChoice,jointHandoverReassociationPlan,handoverReassociationPredecessorChoice} from './handover_identity.js';
import {reassociationDestinations} from './identity.js';
import {withExactHandoverPriors,withSelectedHandoverPrior} from './handover_prior.js';
import {withHeldHandoverReassociationIntents} from './held_handover_intents.js';
import {persistHandoverReassociation} from './handover_persist.js';
import type {JointHandoverReassociationChoice} from './handover_contract.js';

export interface HandoverReassociationPreparationInput {
 readonly database:string;
 readonly nativeIntentDatabase:string;
 readonly activation:SharedDurableNativeActivationHost;
 readonly path:SharedServerLogGenerationDeliveryPathRecoveryHost;
 readonly publication:SharedNativeRoomPublicationHost;
 readonly destinations:MetadataContinuationDestinations;
 readonly previous:JointHandoverReassociationChoice|null;
 readonly prior:HandoverMetadataContinuationChoice|null;
 readonly retainChoice:(choice:JointHandoverReassociationChoice)=>void|Promise<void>;
}

function withPrevious<T>(
 scope:SelectedNativeRecoveryScope,origin:ColdJointHandoverOriginWork,previous:JointHandoverReassociationChoice|null,
 options:SharedArchiveIntegrityOptions,
 visit:(native:RoomHandoverActivationIntentStore,check:()=>void,signals:readonly AbortSignal[])=>Promise<T>,
):Promise<T>{
 if(previous)return withHeldHandoverReassociationIntents(scope,origin,previous,options,held=>visit(held.native,held.check,held.revocations));
 return withColdHandoverActivationIntent(scope,origin,native=>visit(native,origin.check,[]));
}

export async function prepareJointHandoverReassociation(
 scope:SelectedNativeRecoveryScope,origin:ColdJointHandoverOriginWork,provided:HandoverReassociationPreparationInput,
 options:SharedArchiveIntegrityOptions,
):Promise<JointHandoverReassociationChoice>{
 checkColdJointActivationOrigin(origin,scope);
 const row=fields(provided,['database','nativeIntentDatabase','activation','path','publication','destinations','previous','prior','retainChoice']);
 const input=row as unknown as HandoverReassociationPreparationInput;
 if(typeof input.retainChoice!=='function')throw fail();
 const retain=input.retainChoice,activation=nativeActivationHostPort(input.activation),publication=nativePublicationHostPort(input.publication);
 const path=heldHandoverActivationPath(input.path);
 const name=database(input.database),nativeName=database(input.nativeIntentDatabase),destinations=reassociationDestinations(input.destinations);
 const previous=input.previous===null?null:jointHandoverReassociationChoice(input.previous);
 const prior=input.prior===null?null:handoverMetadataContinuationChoice(input.prior);
 const old=previous?.plan??origin.choice.plan;
 const {wasm,signal}=options,authority=archiveGuard(options.checkAuthority,signal);
 const heldOptions={wasm,checkAuthority:authority,...(signal?{signal}:{})};
 const selected=handoverActivationReassociationChoice(old.activation,nativeName,activation.selection,path.selection);
 return withPrevious(scope,origin,previous,heldOptions,(native,parentCheck,revocations)=>withSelectedHandoverPrior(scope,origin,old.destinations,prior,async(evidence,priorCheck,priorRevocations)=>{
  const waits=new NativeReconstructionWaits(()=>{
   authority();origin.check();parentCheck();priorCheck();
   activation.check();path.guard(scope.signal);publication.check();
   origin.check();
  },[scope.signal,signal,...origin.revocations,...revocations,...priorRevocations,...activation.signals,...path.signals,...publication.signals]);
  try{
   const predecessors=[...(previous?.plan.predecessors??[])];
   if(previous){
    const {database,activation,publication,destinations,prior}=previous.plan;
    predecessors.push({database,activation,publication,destinations,prior,bytes:previous.bytes,sha256:previous.sha256});
   }
   const plan=jointHandoverReassociationPlan({format:'breditor/joint-native-handover-reassociation-plan',formatVersion:1,database:name,
    original:origin.choice,predecessors,activation:selected,publication:publication.selection,destinations,prior:evidence});
   const guarded={wasm,signal:waits.signal,checkAuthority:waits.check},integrity=prepareArchiveIntegrity(guarded);
   const file=new Blob([JSON.stringify(plan)]);
   const choice=jointHandoverReassociationChoice({format:'breditor/joint-native-handover-reassociation-intent',formatVersion:1,plan,
    bytes:file.size,sha256:await integrity.digest(file)});
   return await persistHandoverReassociation(choice,guarded,false,async()=>{
    await prepareHeldHandoverActivationReassociation(native,{previous:old.activation,database:nativeName,activation:input.activation,path:input.path,
     async retainChoice(actual){if(!equal(actual,choice.plan.activation))throw fail('joint_activation_intent_stale');await retain(choice);}},guarded);
   });
  }finally{waits.close();}
 }));
}

/** Complete a retained partial write under exact prior-journal custody. */
export async function resumeJointHandoverReassociationPreparation(
 scope:SelectedNativeRecoveryScope,origin:ColdJointHandoverOriginWork,provided:JointHandoverReassociationChoice,
 options:SharedArchiveIntegrityOptions,retain:(choice:JointHandoverReassociationChoice)=>void|Promise<void>,
):Promise<JointHandoverReassociationChoice>{
 checkColdJointActivationOrigin(origin,scope);
 const choice=jointHandoverReassociationChoice(provided);
 if(typeof retain!=='function'||!equal(choice.plan.original,origin.choice))throw fail('joint_activation_intent_stale');
 const index=choice.plan.predecessors.length-1;
 const previous=index<0?null:handoverReassociationPredecessorChoice(choice.plan,index);
 const old=previous?.plan??origin.choice.plan;
 const {wasm,signal}=options,authority=archiveGuard(options.checkAuthority,signal);
 const heldOptions={wasm,checkAuthority:authority,...(signal?{signal}:{})};
 return withPrevious(scope,origin,previous,heldOptions,(native,parentCheck,revocations)=>withExactHandoverPriors(scope,origin,[choice.plan.prior],async(priorCheck,priorRevocations)=>{
  const waits=new NativeReconstructionWaits(()=>{authority();origin.check();parentCheck();priorCheck();origin.check();},
   [scope.signal,signal,...origin.revocations,...revocations,...priorRevocations]);
  try{
   const guarded={wasm,signal:waits.signal,checkAuthority:waits.check};
   return await persistHandoverReassociation(choice,guarded,true,async()=>{
    await retainActivationChoice(choice,retain,waits.check,[waits.signal]);
    await resumeHeldHandoverActivationReassociation(native,{previous:old.activation,expected:choice.plan.activation},guarded);
   });
  }finally{waits.close();}
 }));
}
