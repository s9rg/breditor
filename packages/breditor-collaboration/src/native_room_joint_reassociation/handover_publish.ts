/** Continue and publish the actual confirmed sealed restart under cold custody. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {RoomMetadataTargetWitness} from '../native_room_execution_run/attempt.js';
import type {HandoverMetadataContinuationResult} from '../selected_local_metadata_continuation/handover_contract.js';
import type {JointHandoverMetadataInput} from '../native_room_joint_activation/handover_contract.js';
import {checkColdJointActivationOrigin,type ColdJointHandoverOriginWork} from '../native_room_joint_activation/cold_origin.js';
import {handoverMetadataVisit} from '../native_room_joint_activation/attempt_variant.js';
import {decideColdActivation,nativePublicationWaits} from '../native_room_joint_activation/cold_variant.js';
import {jointEqual as equal,jointIntentFailure as fail} from '../native_room_joint_activation/intent_policy.js';
import {nativePublicationHostPort,type SharedNativeRoomPublicationHost} from '../native_publication_control/host.js';
import {publicationFailure} from '../native_publication_control/policy.js';
import type {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {checkHandoverReassociationConfirmation,type HandoverReassociationConfirmation} from './handover_confirm.js';
import {withHeldHandoverReassociationIntents} from './held_handover_intents.js';
import {jointReassociationPublicationBinding} from './intent_store.js';
import type {JointHandoverReassociationChoice} from './handover_contract.js';

export interface HandoverReassociationPublicationInput extends JointHandoverMetadataInput {
 readonly approvePublication:(choice:JointHandoverReassociationChoice)=>boolean|Promise<boolean>;
}

interface HandoverPublicationContext {
 readonly scope:SelectedNativeRecoveryScope;
 readonly witness:RoomMetadataTargetWitness;
 readonly origin:ColdJointHandoverOriginWork;
 readonly options:SharedArchiveIntegrityOptions;
 readonly confirmation:HandoverReassociationConfirmation;
}

function admitted(context:HandoverPublicationContext):JointHandoverReassociationChoice{
 const {scope,origin,confirmation}=context;
 checkColdJointActivationOrigin(origin,scope);
 checkHandoverReassociationConfirmation(confirmation);
 return confirmation.choice;
}

export async function continueHandoverReassociationMetadata(
 context:HandoverPublicationContext,input:JointHandoverMetadataInput,resume:boolean,
):Promise<HandoverMetadataContinuationResult>{
 const choice=admitted(context),{scope,witness,origin,options,confirmation}=context;
 return withHeldHandoverReassociationIntents(scope,origin,choice,options,async held=>{
  const custody={check:()=>held.requireNativeReceipt(confirmation.receipt),signals:[...origin.revocations,...held.revocations]};
  custody.check();
  const target=handoverMetadataVisit(scope,witness,origin.original.bundle,choice.plan.destinations,choice.plan.activation.handover,input,false,custody);
  try{
   const expected=await target.preview();
   target.check();
   return await target.run(expected,resume);
  }finally{target.close();}
 });
}

export async function publishHandoverReassociation(
 context:HandoverPublicationContext,publication:SharedNativeRoomPublicationHost,input:HandoverReassociationPublicationInput,
 previous:HandoverMetadataContinuationResult,
){
 const choice=admitted(context),{scope,witness,origin,options,confirmation}=context;
 const port=nativePublicationHostPort(publication);
 if(!equal(port.selection,choice.plan.publication))throw fail('joint_activation_intent_stale');
 let started=false;
 try{
  return await withHeldHandoverReassociationIntents(scope,origin,choice,options,async held=>{
   const custody={check:()=>held.requireNativeReceipt(confirmation.receipt),
    signals:[...origin.revocations,...held.revocations,...port.signals]};
   custody.check();
   port.check();
   const target=handoverMetadataVisit<JointHandoverReassociationChoice>(scope,witness,origin.original.bundle,
    choice.plan.destinations,choice.plan.activation.handover,input,true,custody);
   let waits:NativeReconstructionWaits|undefined;
   try{
    const expected=await target.preview();
    target.check();
    if(!equal(expected,previous.choice))throw fail('joint_activation_intent_stale');
    const continued=await target.run(expected,true);
    target.check();
    waits=nativePublicationWaits(port,target.check,[target.signal,...custody.signals]);
    const check=waits.check;
    await decideColdActivation(choice,target.approvePublication!,waits);
    if(!equal((await scope.retainCurrent()).current.selection,continued.choice.continuation.target))throw fail('joint_activation_intent_stale');
    await target.verify(waits.signal);
    check();
    started=true;
    await held.observePublicationStarted(waits);
    check();
    const receipt=await port.publish(jointReassociationPublicationBinding(choice),check,waits.signal);
    check();
    await held.observePublicationReceipt(receipt,waits);
    check();
    return Object.freeze({continued,receipt});
   }finally{waits?.close();target.close();}
  });
 }catch(error){
  if(started)throw publicationFailure('publication_outcome_unknown',error);
  throw error;
 }
}
