/** Fresh explicit Native confirmation. Original and earlier observations never
 * replace either full inspection or an actual authenticated response. */
import {checkColdJointActivationOrigin} from '../native_room_joint_activation/cold_origin.js';
import {inspectColdJointNativeCapture} from '../native_room_joint_activation/cold_native_inspection.js';
import {nativeActivationHostPort} from '../native_activation_control/host.js';
import {generationRecoveryHostPort} from '../generation_recovery_control/host.js';
import {activationFailure} from '../native_activation_control/policy.js';
import {confirmOrdinaryColdNative} from '../native_room_joint_activation/cold_variant.js';
import type {SharedDurableNativeActivationReceipt} from '../native_activation_control/contract.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {jointEqual as equal,jointIntentFailure as fail} from '../native_room_joint_activation/intent_policy.js';
import {withHeldReassociationIntents} from './held_intents.js';
import type {ReassociationActionContext} from './action_context.js';
import type {JointReassociationCommitInput,JointReassociationCommitResult} from './attempt_contract.js';
export async function commitReassociatedNative(context:ReassociationActionContext,provided:JointReassociationCommitInput):Promise<JointReassociationCommitResult>{
 const{scope,origin,choice}=context;checkColdJointActivationOrigin(origin,scope);context.check();
 const r=fields(provided,['activation','inspection','approve'],['limits']),input=r as unknown as JointReassociationCommitInput;
 const port=nativeActivationHostPort(input.activation),inspection=generationRecoveryHostPort(input.inspection);
 if(typeof input.approve!=='function'||!equal(port.selection,choice.plan.activation.activation))throw fail('joint_activation_intent_stale');
 let receipt:SharedDurableNativeActivationReceipt|undefined;
 try{
  const confirmed=await withHeldReassociationIntents(scope,origin,choice,context.options,async held=>{
   const observation={...held,revocations:[...origin.revocations,...held.revocations]};
   receipt=await confirmOrdinaryColdNative(scope,observation,port,inspection,()=>input.approve(choice),context.check,
    signal=>inspectColdJointNativeCapture(scope,origin,input,signal));
   return receipt;
  });
  context.check();
  return Object.freeze({format:'breditor/reassociated-native-activation-result',formatVersion:1,choice,receipt:confirmed,scope:'actual-private-client-target-and-reassociated-native-service'});
 }catch(error){
  if(receipt)throw activationFailure('activation_outcome_unknown',error);
  throw error;
 }
}
