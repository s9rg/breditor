/** Existing-only complete lineage admission. Every original protocol intent
 * keeps its own namespace and meaning; saved observations remain advisory. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {SharedDurableNativeActivationReceipt} from '../native_activation_control/contract.js';
import type {SharedNativeRoomPublicationReceipt} from '../native_publication_control/contract.js';
import {RoomActivationIntentStore} from '../room_native_activation_intent/store.js';
import {checkColdJointActivationOrigin,type ColdJointActivationOriginWork} from '../native_room_joint_activation/cold_origin.js';
import {jointEqual as equal,jointIntentFailure as fail} from '../native_room_joint_activation/intent_policy.js';
import {JointReassociationIntentStore} from './intent_store.js';
import {jointReassociationChoice,reassociationPredecessorChoice} from './identity.js';
import {withExactPriorMetadata} from './prior_metadata.js';
import type {JointReassociationChoice} from './contract.js';
export interface HeldReassociationIntents {
 readonly choice:JointReassociationChoice;
 check():void;
 observeNativeStarted():Promise<void>;
 observeNativeReceipt(receipt:SharedDurableNativeActivationReceipt):Promise<void>;
 observePublicationStarted():Promise<void>;
 observePublicationReceipt(receipt:SharedNativeRoomPublicationReceipt):Promise<void>;
}
export async function withHeldReassociationIntents<T>(scope:SelectedNativeRecoveryScope,origin:ColdJointActivationOriginWork,provided:JointReassociationChoice,options:SharedArchiveIntegrityOptions,visit:(held:HeldReassociationIntents)=>Promise<T>):Promise<T>{
 checkColdJointActivationOrigin(origin,scope);const choice=jointReassociationChoice(provided);if(!equal(choice.plan.original,origin.choice))throw fail('joint_activation_intent_stale');
 const rows=[...choice.plan.predecessors.map((_row,i)=>reassociationPredecessorChoice(choice.plan,i)),choice],opened:{native:RoomActivationIntentStore;joint:JointReassociationIntentStore;nativeState:Awaited<ReturnType<RoomActivationIntentStore['read']>>['state'];publication:Awaited<ReturnType<JointReassociationIntentStore['read']>>}[]=[];
 let active=true,primary:unknown,failed=false;
 const base=()=>{if(!active)throw fail('joint_activation_closed');origin.check();};
 const check=()=>{base();for(const row of opened){row.native.check();row.joint.check();}base();};
 // Register each concrete store before its open, including partial failures.
 const cleanup:(()=>Promise<void>)[]=[];
 try{
  for(const selected of rows){
   const native=new RoomActivationIntentStore(selected.plan.activation,{...options,checkAuthority:base,signal:scope.signal});cleanup.push(()=>native.close());const retained=await native.open();check();
   const joint=new JointReassociationIntentStore(selected,{...options,checkAuthority:base,signal:scope.signal});cleanup.push(()=>joint.close());const publication=await joint.open();check();
   opened.push({native,joint,nativeState:retained.state,publication});check();
  }
  const current=opened.at(-1)!;
  return await withExactPriorMetadata(scope,origin,rows.map(row=>row.plan.prior),async priorCheck=>{
   const heldCheck=()=>{check();priorCheck();check();};
   const held:HeldReassociationIntents=Object.freeze({choice,check:heldCheck,
    async observeNativeStarted(){heldCheck();current.nativeState=(await current.native.markRequestStarted()).state;heldCheck();},
    async observeNativeReceipt(receipt:SharedDurableNativeActivationReceipt){heldCheck();current.nativeState=(await current.native.markReceiptObserved(receipt)).state;heldCheck();},
    async observePublicationStarted(){heldCheck();current.publication=await current.joint.markPublicationStarted();heldCheck();},
    async observePublicationReceipt(receipt:SharedNativeRoomPublicationReceipt){heldCheck();current.publication=await current.joint.markPublicationObserved(receipt);heldCheck();},
   });
   const result=await visit(held);heldCheck();
   for(const row of opened)if(!equal((await row.native.read()).state,row.nativeState)||!equal(await row.joint.read(),row.publication))throw fail('joint_activation_intent_stale');heldCheck();return result;
  });
 }catch(error){primary=error;failed=true;throw error;}finally{
  active=false;const errors:unknown[]=[];for(const close of cleanup.reverse())try{await close();}catch(error){errors.push(error);}
  if(errors.length)throw new AggregateError(failed?[primary,...errors]:errors,'Reassociation intent readers did not drain');
 }
}
