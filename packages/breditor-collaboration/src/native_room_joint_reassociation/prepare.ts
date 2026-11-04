/** Explicit absent-only preparation and separately named partial-write retry.
 * The complete independently retained choice precedes both durable records.
 * Neither a committed record nor its advisory phase activates the service. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {checkColdJointActivationOrigin,type ColdJointActivationOriginWork} from '../native_room_joint_activation/cold_origin.js';
import {RoomActivationIntentStore} from '../room_native_activation_intent/store.js';
import {encodeRoomActivationIntent} from '../room_native_activation_intent/encode.js';
import type {RoomActivationEncodedCapture} from '../room_native_activation_intent/contract.js';
import {retainActivationChoice} from '../room_native_activation_intent/retain_choice.js';
import {physicalOperationV3Present} from '../physical_room_operation_v3/child.js';
import {jointEqual as equal,jointIntentFailure as fail} from '../native_room_joint_activation/intent_policy.js';
import {captureJointReassociation,type JointReassociationCaptureInput} from './capture.js';
import {JointReassociationIntentStore} from './intent_store.js';
import {jointReassociationChoice,reassociationPredecessorChoice} from './identity.js';
import {withHeldReassociationIntents} from './held_intents.js';
import {withExactPriorMetadata} from './prior_metadata.js';
import type {JointReassociationChoice} from './contract.js';
export async function prepareJointReassociation(scope:SelectedNativeRecoveryScope,origin:ColdJointActivationOriginWork,input:JointReassociationCaptureInput,options:SharedArchiveIntegrityOptions,retain:(choice:JointReassociationChoice)=>void|Promise<void>):Promise<JointReassociationChoice>{
 checkColdJointActivationOrigin(origin,scope);if(typeof retain!=='function')throw fail();const captured=await captureJointReassociation(scope,origin,input,options);origin.check();
 const choice=captured.choice;
 await retainActivationChoice(choice,retain,origin.check,[scope.signal,options.signal]);origin.check();
 await persist(scope,origin,choice,captured.native,options,false);return verifyPrepared(scope,origin,choice,options);
}
/** Complete only the independently retained descriptor and original bytes.
 * A further process restart cannot make a DATA write depend on a dead control.
 * This deliberately acquires no HTTP requester or Native receipt. */
export async function resumeJointReassociationPreparation(scope:SelectedNativeRecoveryScope,origin:ColdJointActivationOriginWork,provided:JointReassociationChoice,options:SharedArchiveIntegrityOptions,retain:(choice:JointReassociationChoice)=>void|Promise<void>):Promise<JointReassociationChoice>{
 checkColdJointActivationOrigin(origin,scope);const choice=jointReassociationChoice(provided);if(typeof retain!=='function'||!equal(choice.plan.original,origin.choice))throw fail();
 const run=async(parentCheck:()=>void)=>withExactPriorMetadata(scope,origin,[choice.plan.prior],async priorCheck=>{
  const check=()=>{origin.check();parentCheck();priorCheck();origin.check();};check();
  const encoded=await encodeRoomActivationIntent(choice.plan.activation.database,choice.plan.activation.activation,origin.retained.capture,{...options,checkAuthority:check,signal:scope.signal});check();if(!equal(encoded.choice,choice.plan.activation))throw fail('joint_activation_intent_stale');
  await retainActivationChoice(choice,retain,check,[scope.signal,options.signal]);check();
  return persist(scope,origin,choice,encoded,options,true);
 });
 const count=choice.plan.predecessors.length;
 await(count?withHeldReassociationIntents(scope,origin,reassociationPredecessorChoice(choice.plan,count-1),options,held=>run(held.check)):run(origin.check));
 return verifyPrepared(scope,origin,choice,options);
}
async function persist(scope:SelectedNativeRecoveryScope,origin:ColdJointActivationOriginWork,choice:JointReassociationChoice,encoded:RoomActivationEncodedCapture,options:SharedArchiveIntegrityOptions,resume:boolean):Promise<JointReassociationChoice>{
 let native:RoomActivationIntentStore|undefined,joint:JointReassociationIntentStore|undefined,primary:unknown,failed=false;
 try{
  const nativeExists=await physicalOperationV3Present(choice.plan.activation.database,origin.check),jointExists=await physicalOperationV3Present(choice.plan.database,origin.check);origin.check();
  if(!resume&&(nativeExists||jointExists)||jointExists&&!nativeExists)throw fail('joint_activation_intent_exists');
  native=new RoomActivationIntentStore(choice.plan.activation,{...options,checkAuthority:origin.check,signal:scope.signal});await native.open(nativeExists?undefined:encoded);origin.check();
  joint=new JointReassociationIntentStore(choice,{...options,checkAuthority:origin.check,signal:scope.signal});await joint.open(!jointExists);origin.check();
 }catch(error){primary=error;failed=true;throw error;}finally{
  const errors:unknown[]=[];for(const close of[()=>joint?.close(),()=>native?.close()])try{await close();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(failed?[primary,...errors]:errors,'Reassociation preparation stores did not drain');
 }
 origin.check();return choice;
}
async function verifyPrepared(scope:SelectedNativeRecoveryScope,origin:ColdJointActivationOriginWork,choice:JointReassociationChoice,options:SharedArchiveIntegrityOptions){await withHeldReassociationIntents(scope,origin,choice,options,async held=>{held.check();});origin.check();return choice;}
