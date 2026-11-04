/** Fresh explicit Native confirmation. Original and earlier observations never
 * replace either full inspection or an actual authenticated response. */
import {checkColdJointActivationOrigin} from '../native_room_joint_activation/cold_origin.js';
import {inspectColdJointNativeCapture} from '../native_room_joint_activation/cold_native_inspection.js';
import {nativeActivationHostPort} from '../native_activation_control/host.js';
import {generationRecoveryHostPort} from '../generation_recovery_control/host.js';
import {activationFailure} from '../native_activation_control/policy.js';
import {decideFreshAssetChoice} from '../physical_room_asset_approval/decision.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {jointEqual as equal,jointIntentFailure as fail} from '../native_room_joint_activation/intent_policy.js';
import {withHeldReassociationIntents} from './held_intents.js';
import type {ReassociationActionContext} from './action_context.js';
import type {JointReassociationCommitInput,JointReassociationCommitResult} from './attempt_contract.js';
const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
export async function commitReassociatedNative(context:ReassociationActionContext,provided:JointReassociationCommitInput):Promise<JointReassociationCommitResult>{
 const{scope,origin,choice}=context;checkColdJointActivationOrigin(origin,scope);context.check();
 const r=fields(provided,['activation','inspection','approve'],['limits']),input=r as unknown as JointReassociationCommitInput,port=nativeActivationHostPort(input.activation);generationRecoveryHostPort(input.inspection);
 if(typeof input.approve!=='function'||!equal(port.selection,choice.plan.activation.activation))throw fail('joint_activation_intent_stale');
 const receipt=await withHeldReassociationIntents(scope,origin,choice,context.options,async held=>{
  const check=()=>{context.check();held.check();port.check();};check();await inspectColdJointNativeCapture(scope,origin,input);check();
  await decideFreshAssetChoice(choice,input.approve,{check,signal:scope.signal,watchClosing:cancel=>{add.call(scope.signal,'abort',cancel,{once:true});return()=>remove.call(scope.signal,'abort',cancel);}});check();await inspectColdJointNativeCapture(scope,origin,input);check();let started=false;
  try{started=true;await held.observeNativeStarted();check();const result=await port.commit(check,scope.signal);check();await held.observeNativeReceipt(result);check();return result;}catch(error){if(started)throw activationFailure('activation_outcome_unknown');throw error;}
 });context.check();return Object.freeze({format:'breditor/reassociated-native-activation-result',formatVersion:1,choice,receipt,scope:'actual-private-client-target-and-reassociated-native-service'});
}
