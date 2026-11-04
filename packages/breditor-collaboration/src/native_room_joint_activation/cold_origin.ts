/** Existing-only cold admission of the complete joint association. Immutable
 * files and advisory receipts are checked under the actual promoted target;
 * both original journal leases remain held throughout the finite visitor.
 * Neither a stored phase nor this read supplies Native serving authority. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {roomMetadataTargetIdentity,type RoomMetadataTargetWitness} from '../native_room_execution_run/attempt.js';
import {RoomActivationIntentStore} from '../room_native_activation_intent/store.js';
import type {RoomActivationRetainedIntent} from '../room_native_activation_intent/contract.js';
import type {SharedDurableNativeActivationReceipt} from '../native_activation_control/contract.js';
import type {SharedNativeRoomPublicationReceipt} from '../native_publication_control/contract.js';
import {withOriginalMetadataJournals,type OriginalMetadataJournalObservation} from '../selected_local_metadata_continuation/original_journals.js';
import {JointRoomActivationIntentStore,type JointRoomPublicationState} from './intent_store.js';
import {jointRoomActivationIntentChoice} from './intent_identity.js';
import type {JointRoomActivationIntentChoice} from './intent_contract.js';
import {jointEqual as equal,jointIntentFailure as fail} from './intent_policy.js';
type Inspection=Parameters<Parameters<typeof withOriginalMetadataJournals>[3]>[0];
const visits=new WeakMap<object,{scope:SelectedNativeRecoveryScope;check():void}>();
/** Actual same-visit brand admission, before reflecting on any inspection input. */
export function checkColdJointActivationOrigin(work:ColdJointActivationOriginWork,scope:SelectedNativeRecoveryScope):void{const held=visits.get(work);if(!held||held.scope!==scope)throw fail('joint_activation_state');held.check();}
export interface ColdJointActivationOriginWork {
 readonly choice:JointRoomActivationIntentChoice;
 readonly retained:RoomActivationRetainedIntent;
 readonly publication:JointRoomPublicationState;
 readonly original:Inspection;
 readonly journals:OriginalMetadataJournalObservation;
 check():void;
 /** Observations only; callers must obtain actual replies independently. */
 observeNativeStarted():Promise<void>;
 observeNativeReceipt(receipt:SharedDurableNativeActivationReceipt):Promise<void>;
 observePublicationStarted():Promise<void>;
 observePublicationReceipt(receipt:SharedNativeRoomPublicationReceipt):Promise<void>;
}
/** No caller-supplied origin slot. Only the fully decoded existing activation
 * intent supplies the four files associated with this exact joint descriptor. */
export async function withColdJointActivationOrigin<T>(scope:SelectedNativeRecoveryScope,witness:RoomMetadataTargetWitness,provided:JointRoomActivationIntentChoice,visit:(work:ColdJointActivationOriginWork)=>Promise<T>):Promise<T>{
 const actual=roomMetadataTargetIdentity(witness,scope);
 const choice=jointRoomActivationIntentChoice(provided);
 if(!equal(actual,choice.plan.execution)||typeof visit!=='function')throw fail('joint_activation_intent_stale');
 let active=true,joint:JointRoomActivationIntentStore|undefined,native:RoomActivationIntentStore|undefined,primary:unknown,failed=false;
 const check=()=>{if(!active)throw fail('joint_activation_closed');scope.check();if(!equal(roomMetadataTargetIdentity(witness,scope),choice.plan.execution))throw fail('joint_activation_intent_stale');};
 try{
  check();const current=await scope.retainCurrent();check();const options={wasm:current.integrity.wasm,checkAuthority:check,signal:scope.signal};
  joint=new JointRoomActivationIntentStore(choice,options);let publication=await joint.open();check();
  native=new RoomActivationIntentStore(choice.plan.activation,options);const retained=await native.open();let nativeState=retained.state;check();
  const bundle=retained.capture.recovery.bundle.original.packets.references.parent,selected=choice.plan.origin.selection;
  if(!equal(retained.choice,selected.activation)||!equal(bundle.parent.prepared.choice,selected.prepared)||!equal(bundle.parent.current.selection,selected.current)||!equal({bytes:bundle.parent.delivery.bytes,sha256:bundle.parent.delivery.sha256},selected.review)||!equal({bytes:bundle.metadata.bytes,sha256:bundle.metadata.sha256},selected.metadata))throw fail('joint_activation_intent_stale');
  const nativeStore=native,jointStore=joint;
  const result=await withOriginalMetadataJournals(scope,witness,bundle,async(original,journals)=>{
   if(original.choice.parent.database!==choice.plan.origin.reviewDatabase||original.choice.database!==choice.plan.origin.metadataDatabase)throw fail('joint_activation_intent_stale');
   let visiting=true;const heldCheck=()=>{if(!visiting)throw fail('joint_activation_closed');check();nativeStore.check();jointStore.check();};heldCheck();
   try{
   const work:ColdJointActivationOriginWork=Object.freeze({choice,retained,publication,original,journals,check:heldCheck,
    async observeNativeStarted(){heldCheck();nativeState=(await nativeStore.markRequestStarted()).state;heldCheck();},
    async observeNativeReceipt(receipt:SharedDurableNativeActivationReceipt){heldCheck();nativeState=(await nativeStore.markReceiptObserved(receipt)).state;heldCheck();},
    async observePublicationStarted(){heldCheck();publication=await jointStore.markPublicationStarted();heldCheck();},
    async observePublicationReceipt(receipt:SharedNativeRoomPublicationReceipt){heldCheck();publication=await jointStore.markPublicationObserved(receipt);heldCheck();}
   });
   visits.set(work,{scope,check:heldCheck});const value=await visit(work);heldCheck();
   if(!equal((await nativeStore.read()).state,nativeState)||!equal(await jointStore.read(),publication))throw fail('joint_activation_intent_stale');heldCheck();return value;
   }finally{visiting=false;}
  });check();return result;
 }catch(error){primary=error;failed=true;throw error;}finally{
  active=false;const errors:unknown[]=[];
  for(const close of[()=>native?.close(),()=>joint?.close()])try{await close();}catch(error){errors.push(error);}
  if(errors.length)throw new AggregateError(failed?[primary,...errors]:errors,'Cold joint origin reads did not drain');
 }
}
