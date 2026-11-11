/** Hold the sealed predecessor chain and its earlier metadata before the
 * latest association can create anything or consult new Native controls. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {checkColdJointActivationOrigin,type ColdJointHandoverOriginWork} from '../native_room_joint_activation/cold_origin.js';
import {RoomHandoverActivationIntentStore} from '../room_native_handover_activation_intent/store.js';
import {jointEqual as equal,jointIntentFailure as fail} from '../native_room_joint_activation/intent_policy.js';
import {handoverReassociationPredecessorChoice,jointHandoverReassociationChoice} from './handover_identity.js';
import {JointHandoverReassociationIntentStore} from './intent_store.js';
import {withExactHandoverPriors} from './handover_prior.js';
import type {JointHandoverReassociationChoice} from './handover_contract.js';

export interface HeldHandoverReassociationIntents {
 readonly native:RoomHandoverActivationIntentStore;
 readonly revocations:readonly AbortSignal[];
 check():void;
}

export async function withHeldHandoverReassociationIntents<T>(
 scope:SelectedNativeRecoveryScope,origin:ColdJointHandoverOriginWork,provided:JointHandoverReassociationChoice,
 options:SharedArchiveIntegrityOptions,visit:(held:HeldHandoverReassociationIntents)=>Promise<T>,
):Promise<T>{
 checkColdJointActivationOrigin(origin,scope);
 const choice=jointHandoverReassociationChoice(provided);
 if(!equal(choice.plan.original,origin.choice)||typeof visit!=='function')throw fail('joint_activation_intent_stale');
 const selections=[...choice.plan.predecessors.map((_row,i)=>handoverReassociationPredecessorChoice(choice.plan,i)),choice];
 const cleanup:(()=>Promise<void>)[]=[],checks:(()=>void)[]=[],revocations:AbortSignal[]=[];
 const states:(()=>Promise<void>)[]=[];
 let active=true,last:RoomHandoverActivationIntentStore|undefined,primary:unknown,failed=false;
 const base=()=>{if(!active)throw fail('joint_activation_closed');origin.check();options.checkAuthority();origin.check();};
 const check=()=>{base();for(const held of checks)held();base();};
 try{
  for(const selected of selections){
   check();
   const native=new RoomHandoverActivationIntentStore(selected.plan.activation,{...options,checkAuthority:base});
   cleanup.push(()=>native.close());
   const savedNative=(await native.open()).state;
   checks.push(native.check);revocations.push(native.revoked);
   last=native;check();
   const joint=new JointHandoverReassociationIntentStore(selected,{...options,checkAuthority:base});
   cleanup.push(()=>joint.close());
   const savedJoint=await joint.open();
   checks.push(joint.check);revocations.push(joint.revoked);
   states.push(async()=>{
    if(!equal((await native.read()).state,savedNative)||!equal(await joint.read(),savedJoint))throw fail('joint_activation_intent_stale');
   });
  }
  return await withExactHandoverPriors(scope,origin,selections.map(row=>row.plan.prior),async priorCheck=>{
   const heldCheck=()=>{check();priorCheck();check();};
   heldCheck();
   const result=await visit(Object.freeze({native:last!,revocations:Object.freeze(revocations),check:heldCheck}));
   heldCheck();
   for(const unchanged of states)await unchanged();
   heldCheck();
   return result;
  });
 }catch(error){primary=error;failed=true;throw error;}
 finally{
  active=false;
  const errors:unknown[]=[];
  for(const close of cleanup.reverse())try{await close();}catch(error){errors.push(error);}
  if(errors.length)throw new AggregateError(failed?[primary,...errors]:errors,'Sealed predecessor readers did not drain');
 }
}
