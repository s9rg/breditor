/** Commit the selected Native capture before the sealed whole-room journal.
 * A partial write is recovered by reopening the exact first record. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {archiveGuard} from '../archive_integrity/policy.js';
import {physicalOperationV3Present} from '../physical_room_operation_v3/child.js';
import {RoomHandoverActivationIntentStore} from '../room_native_handover_activation_intent/store.js';
import {jointEqual as equal,jointIntentFailure as fail} from '../native_room_joint_activation/intent_policy.js';
import type {JointHandoverReassociationChoice} from './handover_contract.js';
import {jointHandoverReassociationChoice} from './handover_identity.js';
import {JointHandoverReassociationIntentStore} from './intent_store.js';

export async function persistHandoverReassociation(
 provided:JointHandoverReassociationChoice,options:SharedArchiveIntegrityOptions,resume:boolean,writeNative:()=>Promise<void>,
):Promise<JointHandoverReassociationChoice>{
 const choice=jointHandoverReassociationChoice(provided);
 const {wasm,signal}=options,check=archiveGuard(options.checkAuthority,signal);
 const held={wasm,checkAuthority:check,...(signal?{signal}:{})};
 const nativeExists=await physicalOperationV3Present(choice.plan.activation.database,check);
 const jointExists=await physicalOperationV3Present(choice.plan.database,check);
 if(!resume&&(nativeExists||jointExists)||jointExists&&!nativeExists)throw fail('joint_activation_intent_exists');
 let native:RoomHandoverActivationIntentStore|undefined,joint:JointHandoverReassociationIntentStore|undefined,primary:unknown,failed=false;
 const guard=()=>{check();native?.check();};
 try{
  joint=new JointHandoverReassociationIntentStore(choice,{...held,checkAuthority:guard});
  await joint.verifyChoice();
  guard();
  await writeNative();
  guard();
  native=new RoomHandoverActivationIntentStore(choice.plan.activation,held);
  const reopened=await native.open();
  if(!equal(reopened.choice,choice.plan.activation)||!resume&&reopened.state.phase!=='prepared')throw fail('joint_activation_intent_stale');
  await joint.open(!jointExists);
  guard();
 }catch(error){primary=error;failed=true;throw error;}
 finally{
  const errors:unknown[]=[];
  for(const close of [()=>joint?.close(),()=>native?.close()])try{await close();}catch(error){errors.push(error);}
  if(errors.length)throw new AggregateError(failed?[primary,...errors]:errors,'Sealed restart journals did not drain');
 }
 check();
 return choice;
}
