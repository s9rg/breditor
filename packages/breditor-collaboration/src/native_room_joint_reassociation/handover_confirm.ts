/** Confirm the selected restarted Native service under live cold custody. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {generationRecoveryHostPort} from '../generation_recovery_control/host.js';
import {nativeActivationHostPort} from '../native_activation_control/host.js';
import {activationFailure} from '../native_activation_control/policy.js';
import type {SharedDurableNativeActivationReceipt} from '../native_activation_control/contract.js';
import type {CommitHandoverRoomNativeActivationInput} from '../room_native_handover_activation_intent/coordinator_contract.js';
import {heldHandoverActivationPath} from '../room_native_handover_activation_intent/path.js';
import {checkColdJointActivationOrigin,type ColdJointHandoverOriginWork} from '../native_room_joint_activation/cold_origin.js';
import {inspectColdJointHandoverCapture} from '../native_room_joint_activation/cold_native_inspection.js';
import {confirmHeldColdNative} from '../native_room_joint_activation/cold_variant.js';
import {jointEqual as equal,jointIntentFailure as fail} from '../native_room_joint_activation/intent_policy.js';
import {withHeldHandoverReassociationIntents} from './held_handover_intents.js';
import {jointHandoverReassociationChoice} from './handover_identity.js';
import type {JointHandoverReassociationChoice} from './handover_contract.js';

export interface HandoverReassociationConfirmationInput extends Omit<CommitHandoverRoomNativeActivationInput,'expected'|'approve'> {
 readonly approve:(choice:JointHandoverReassociationChoice)=>boolean|Promise<boolean>;
}
export interface HandoverReassociationConfirmation {
 readonly choice:JointHandoverReassociationChoice;
 readonly receipt:SharedDurableNativeActivationReceipt;
}

export async function confirmJointHandoverReassociation(
 scope:SelectedNativeRecoveryScope,origin:ColdJointHandoverOriginWork,expected:JointHandoverReassociationChoice,
 provided:HandoverReassociationConfirmationInput,options:SharedArchiveIntegrityOptions,
):Promise<HandoverReassociationConfirmation>{
 checkColdJointActivationOrigin(origin,scope);
 const choice=jointHandoverReassociationChoice(expected);
 if(!equal(choice.plan.original,origin.choice))throw fail('joint_activation_intent_stale');
 const input=fields(provided,['activation','path','inspection','approve'],['limits']) as unknown as HandoverReassociationConfirmationInput;
 const activation=nativeActivationHostPort(input.activation),inspection=generationRecoveryHostPort(input.inspection);
 const path=heldHandoverActivationPath(input.path,choice.plan.activation.handover);
 const approve=input.approve;
 if(typeof approve!=='function'||!equal(activation.selection,choice.plan.activation.activation))throw fail('joint_activation_intent_stale');
 let receipt:SharedDurableNativeActivationReceipt|undefined;
 try{
  return await withHeldHandoverReassociationIntents(scope,origin,choice,options,async held=>{
   const observation={
    check:held.check,revocations:[...origin.revocations,...held.revocations,...inspection.signals],
    observeNativeStarted:held.observeNativeStarted,observeNativeReceipt:held.observeNativeReceipt,
   };
   receipt=await confirmHeldColdNative(scope,observation,activation,()=>approve(choice),
    ()=>{origin.check();options.checkAuthority();inspection.guard(scope.signal);},
    signal=>inspectColdJointHandoverCapture(scope,origin,input,signal),path);
   return Object.freeze({choice,receipt});
  });
 }catch(error){
  if(receipt)throw activationFailure('activation_outcome_unknown',error);
  throw error;
 }
}
