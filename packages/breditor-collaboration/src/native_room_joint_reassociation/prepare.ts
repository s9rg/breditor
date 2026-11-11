/** Explicit absent-only preparation and separately named partial-write retry.
 * The complete independently retained choice precedes both durable records.
 * Neither a committed record nor its advisory phase activates the service. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {checkColdJointActivationOrigin,type ColdJointActivationOriginWork} from '../native_room_joint_activation/cold_origin.js';
import {RoomActivationIntentStore} from '../room_native_activation_intent/store.js';
import {rebindDecodedRoomActivationIntent} from '../room_native_activation_intent/rebind.js';
import type {RoomActivationEncodedCapture} from '../room_native_activation_intent/contract.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {retainActivationChoice} from '../room_native_activation_intent/retain_choice.js';
import {physicalOperationV3Present} from '../physical_room_operation_v3/child.js';
import {jointEqual as equal,jointIntentFailure as fail} from '../native_room_joint_activation/intent_policy.js';
import {withCapturedJointReassociation,type JointReassociationCaptureInput} from './capture.js';
import {JointReassociationIntentStore} from './intent_store.js';
import {jointReassociationChoice,reassociationPredecessorChoice} from './identity.js';
import {withHeldReassociationIntents} from './held_intents.js';
import {withExactPriorMetadata} from './prior_metadata.js';
import type {JointReassociationChoice} from './contract.js';
export async function prepareJointReassociation(scope:SelectedNativeRecoveryScope,origin:ColdJointActivationOriginWork,input:JointReassociationCaptureInput,options:SharedArchiveIntegrityOptions,retain:(choice:JointReassociationChoice)=>void|Promise<void>):Promise<JointReassociationChoice>{
 checkColdJointActivationOrigin(origin,scope);
 if(typeof retain!=='function')throw fail();
 const choice=await withCapturedJointReassociation(scope,origin,input,options,async(captured,held)=>{
  await retainActivationChoice(captured.choice,retain,held.checkAuthority,[held.signal]);
  return persist(captured.choice,captured.native,held,false);
 });
 return verifyPrepared(scope,origin,choice,options);
}
/** Complete only the independently retained descriptor and original bytes.
 * A further process restart cannot make a DATA write depend on a dead control.
 * This deliberately acquires no HTTP requester or Native receipt. */
export async function resumeJointReassociationPreparation(scope:SelectedNativeRecoveryScope,origin:ColdJointActivationOriginWork,provided:JointReassociationChoice,options:SharedArchiveIntegrityOptions,retain:(choice:JointReassociationChoice)=>void|Promise<void>):Promise<JointReassociationChoice>{
 checkColdJointActivationOrigin(origin,scope);const choice=jointReassociationChoice(provided);if(typeof retain!=='function'||!equal(choice.plan.original,origin.choice))throw fail();
 const run=async(parentCheck:()=>void,parentRevocations:readonly AbortSignal[])=>withExactPriorMetadata(scope,origin,[choice.plan.prior],async(priorCheck,priorRevocations)=>{
  const waits=new NativeReconstructionWaits(()=>{options.checkAuthority();origin.check();parentCheck();priorCheck();origin.check();},
   [scope.signal,options.signal,...origin.revocations,...parentRevocations,...priorRevocations]);
  const guarded={wasm:options.wasm,checkAuthority:waits.check,signal:waits.signal};
  try{
   const encoded=await rebindDecodedRoomActivationIntent(choice.plan.activation.database,choice.plan.activation.activation,origin.retained.capture,guarded);
   waits.check();
   if(!equal(encoded.choice,choice.plan.activation))throw fail('joint_activation_intent_stale');
   await retainActivationChoice(choice,retain,waits.check,[waits.signal]);
   return await persist(choice,encoded,guarded,true);
  }finally{waits.close();}
 });
 const count=choice.plan.predecessors.length;
 await(count?withHeldReassociationIntents(scope,origin,reassociationPredecessorChoice(choice.plan,count-1),options,held=>run(held.check,held.revocations)):run(origin.check,[]));
 return verifyPrepared(scope,origin,choice,options);
}
async function persist(choice:JointReassociationChoice,encoded:RoomActivationEncodedCapture,options:SharedArchiveIntegrityOptions,resume:boolean):Promise<JointReassociationChoice>{
 let native:RoomActivationIntentStore|undefined,joint:JointReassociationIntentStore|undefined,primary:unknown,failed=false;
 try{
  const nativeExists=await physicalOperationV3Present(choice.plan.activation.database,options.checkAuthority),jointExists=await physicalOperationV3Present(choice.plan.database,options.checkAuthority);options.checkAuthority();
  if(!resume&&(nativeExists||jointExists)||jointExists&&!nativeExists)throw fail('joint_activation_intent_exists');
  native=new RoomActivationIntentStore(choice.plan.activation,options);await native.open(nativeExists?undefined:encoded);options.checkAuthority();
  joint=new JointReassociationIntentStore(choice,options);await joint.open(!jointExists);options.checkAuthority();
 }catch(error){primary=error;failed=true;throw error;}finally{
  const errors:unknown[]=[];for(const close of[()=>joint?.close(),()=>native?.close()])try{await close();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(failed?[primary,...errors]:errors,'Reassociation preparation stores did not drain');
 }
 options.checkAuthority();return choice;
}
async function verifyPrepared(scope:SelectedNativeRecoveryScope,origin:ColdJointActivationOriginWork,choice:JointReassociationChoice,options:SharedArchiveIntegrityOptions){await withHeldReassociationIntents(scope,origin,choice,options,async held=>{held.check();});origin.check();return choice;}
