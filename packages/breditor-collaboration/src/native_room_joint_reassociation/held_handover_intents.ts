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
import type {SharedDurableNativeActivationReceipt} from '../native_activation_control/contract.js';
import type {SharedNativeRoomPublicationReceipt} from '../native_publication_control/contract.js';

export interface HeldHandoverReassociationIntents {
 readonly native:RoomHandoverActivationIntentStore;
 readonly revocations:readonly AbortSignal[];
 check():void;
 observeNativeStarted():Promise<void>;
 observeNativeReceipt(receipt:SharedDurableNativeActivationReceipt):Promise<void>;
 requireNativeReceipt(receipt:SharedDurableNativeActivationReceipt):void;
 observePublicationStarted():Promise<void>;
 observePublicationReceipt(receipt:SharedNativeRoomPublicationReceipt):Promise<void>;
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
 let current:{
  observeStarted():Promise<void>;
  observeReceipt(receipt:SharedDurableNativeActivationReceipt):Promise<void>;
  requireReceipt(receipt:SharedDurableNativeActivationReceipt):void;
  observePublicationStarted():Promise<void>;
  observePublicationReceipt(receipt:SharedNativeRoomPublicationReceipt):Promise<void>;
 }|undefined;
 const base=()=>{if(!active)throw fail('joint_activation_closed');origin.check();options.checkAuthority();origin.check();};
 const check=()=>{base();for(const held of checks)held();base();};
 try{
  for(const selected of selections){
   check();
   const native=new RoomHandoverActivationIntentStore(selected.plan.activation,{...options,checkAuthority:base});
   cleanup.push(()=>native.close());
   let savedNative=(await native.open()).state;
   checks.push(native.check);revocations.push(native.revoked);
   last=native;check();
   const joint=new JointHandoverReassociationIntentStore(selected,{...options,checkAuthority:base});
   cleanup.push(()=>joint.close());
   let savedJoint=await joint.open();
   checks.push(joint.check);revocations.push(joint.revoked);
   current={
    async observeStarted(){savedNative=(await native.markRequestStarted()).state;},
    async observeReceipt(receipt){savedNative=(await native.markReceiptObserved(receipt)).state;},
    requireReceipt(receipt){if(savedNative.phase!=='receipt-observed'||!equal(savedNative.receipt,receipt))throw fail('joint_activation_intent_stale');},
    async observePublicationStarted(){savedJoint=await joint.markPublicationStarted();},
    async observePublicationReceipt(receipt){savedJoint=await joint.markPublicationObserved(receipt);},
   };
   states.push(async()=>{
    if(!equal((await native.read()).state,savedNative)||!equal(await joint.read(),savedJoint))throw fail('joint_activation_intent_stale');
   });
  }
  return await withExactHandoverPriors(scope,origin,selections.map(row=>row.plan.prior),async(priorCheck,priorRevocations)=>{
   const heldCheck=()=>{check();priorCheck();check();};
   heldCheck();
   const result=await visit(Object.freeze({
    native:last!,revocations:Object.freeze([...revocations,...priorRevocations]),check:heldCheck,
    async observeNativeStarted(){heldCheck();await current!.observeStarted();heldCheck();},
    async observeNativeReceipt(receipt:SharedDurableNativeActivationReceipt){heldCheck();await current!.observeReceipt(receipt);heldCheck();},
    requireNativeReceipt(receipt:SharedDurableNativeActivationReceipt){heldCheck();current!.requireReceipt(receipt);},
    async observePublicationStarted(){heldCheck();await current!.observePublicationStarted();heldCheck();},
    async observePublicationReceipt(receipt:SharedNativeRoomPublicationReceipt){heldCheck();await current!.observePublicationReceipt(receipt);heldCheck();},
   }));
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
