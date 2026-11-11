/** Existing-only cold admission of the complete joint association. Immutable
 * files and advisory receipts are checked under the actual promoted target;
 * both original journal leases remain held throughout the finite visitor.
 * Neither a stored phase nor this read supplies Native serving authority. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {roomMetadataTargetIdentity,type RoomMetadataTargetWitness} from '../native_room_execution_run/attempt.js';
import {RoomActivationIntentStore} from '../room_native_activation_intent/store.js';
import type {RoomActivationRetainedIntent} from '../room_native_activation_intent/contract.js';
import {RoomHandoverActivationIntentStore} from '../room_native_handover_activation_intent/store.js';
import type {RoomHandoverActivationRetainedIntent} from '../room_native_handover_activation_intent/contract.js';
import type {IntentObservationGuard} from '../persistence/intent_observation_guard.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {LocalMetadataRoomBundle} from '../selected_local_metadata_delivery/contract.js';
import type {SharedDurableNativeActivationReceipt} from '../native_activation_control/contract.js';
import type {SharedNativeRoomPublicationReceipt} from '../native_publication_control/contract.js';
import {checkHeldOriginalMetadataJournals,withOriginalMetadataJournals,type OriginalMetadataJournalObservation} from '../selected_local_metadata_continuation/original_journals.js';
import {JointRoomActivationIntentStore,type JointRoomPublicationState} from './intent_store.js';
import {jointRoomActivationIntentChoice,jointHandoverActivationIntentChoice} from './intent_identity.js';
import type {JointRoomActivationIntentChoice} from './intent_contract.js';
import type {JointHandoverActivationIntentChoice} from './handover_contract.js';
import {jointEqual as equal,jointIntentFailure as fail} from './intent_policy.js';
type Inspection=Parameters<Parameters<typeof withOriginalMetadataJournals>[3]>[0];
const visits=new WeakMap<object,{scope:SelectedNativeRecoveryScope;check():void}>();
const handoverIntents=new WeakMap<object,RoomHandoverActivationIntentStore>();
/** Actual same-visit brand admission, before reflecting on any inspection input. */
export function checkColdJointActivationOrigin(work:object,scope:SelectedNativeRecoveryScope):void{const held=visits.get(work);if(!held||held.scope!==scope)throw fail('joint_activation_state');held.check();}
type ColdChoice=JointRoomActivationIntentChoice|JointHandoverActivationIntentChoice;
type Retained=RoomActivationRetainedIntent|RoomHandoverActivationRetainedIntent;
export interface ColdJointActivationOriginWork<Choice extends ColdChoice=JointRoomActivationIntentChoice,Intent extends Retained=RoomActivationRetainedIntent> {
 readonly choice:Choice;
 readonly retained:Intent;
 readonly publication:JointRoomPublicationState;
 readonly original:Inspection;
 readonly journals:OriginalMetadataJournalObservation;
 readonly revocations:readonly AbortSignal[];
 check():void;
 /** Observations only; callers must obtain actual replies independently. */
 observeNativeStarted(guard:IntentObservationGuard):Promise<void>;
 observeNativeReceipt(receipt:SharedDurableNativeActivationReceipt,guard:IntentObservationGuard):Promise<void>;
 observePublicationStarted(guard:IntentObservationGuard):Promise<void>;
 observePublicationReceipt(receipt:SharedNativeRoomPublicationReceipt,guard:IntentObservationGuard):Promise<void>;
}
export type ColdJointHandoverOriginWork=ColdJointActivationOriginWork<JointHandoverActivationIntentChoice,RoomHandoverActivationRetainedIntent>;
/** Reuse the actual held intent inside this cold target visit. */
export async function withColdHandoverActivationIntent<T>(
 scope:SelectedNativeRecoveryScope,origin:ColdJointHandoverOriginWork,
 visit:(store:RoomHandoverActivationIntentStore)=>Promise<T>,
):Promise<T>{
 checkColdJointActivationOrigin(origin,scope);
 const store=handoverIntents.get(origin);
 if(!store||typeof visit!=='function')throw fail('joint_activation_state');
 const result=await visit(store);
 checkColdJointActivationOrigin(origin,scope);
 return result;
}
interface NativeIntentStore<Intent extends Retained> {
 readonly revoked:AbortSignal;
 check():void;
 open():Promise<Intent>;
 read():Promise<Intent>;
 markRequestStarted(guard:IntentObservationGuard):Promise<Intent>;
 markReceiptObserved(receipt:SharedDurableNativeActivationReceipt,guard:IntentObservationGuard):Promise<Intent>;
 close():Promise<void>;
}
interface OriginReader<Choice extends ColdChoice,Intent extends Retained> {
 parse(choice:unknown):Choice;
 joint(choice:Choice,options:SharedArchiveIntegrityOptions):JointRoomActivationIntentStore;
 native(choice:Choice,options:SharedArchiveIntegrityOptions):NativeIntentStore<Intent>;
 original(retained:Intent):LocalMetadataRoomBundle;
}
/** No caller-supplied origin slot. Only the fully decoded existing activation
 * intent supplies the four files associated with this exact joint descriptor. */
async function withColdOrigin<Choice extends ColdChoice,Intent extends Retained,T>(
 scope:SelectedNativeRecoveryScope,witness:RoomMetadataTargetWitness,provided:Choice,reader:OriginReader<Choice,Intent>,
 visit:(work:ColdJointActivationOriginWork<Choice,Intent>)=>Promise<T>,
):Promise<T>{
 const actual=roomMetadataTargetIdentity(witness,scope);
 const choice=reader.parse(provided);
 if(!equal(actual,choice.plan.execution)||typeof visit!=='function')throw fail('joint_activation_intent_stale');
 let active=true,joint:JointRoomActivationIntentStore|undefined,native:NativeIntentStore<Intent>|undefined,primary:unknown,failed=false;
 // The admitted private witness holds one immutable execution identity for
 // this visit. Recheck its live custody without serializing the complete plan.
 const check=()=>{
  if(!active)throw fail('joint_activation_closed');
  scope.check();
  if(roomMetadataTargetIdentity(witness,scope)!==actual)throw fail('joint_activation_intent_stale');
 };
 try{
  check();const current=await scope.retainCurrent();check();const options={wasm:current.integrity.wasm,checkAuthority:check,signal:scope.signal};
  joint=reader.joint(choice,options);let publication=await joint.open();check();
  native=reader.native(choice,options);const retained=await native.open();let nativeState=retained.state;check();
  const bundle=reader.original(retained),selected=choice.plan.origin.selection;
  if(!equal(retained.choice,selected.activation)||!equal(bundle.parent.prepared.choice,selected.prepared)||!equal(bundle.parent.current.selection,selected.current)||!equal({bytes:bundle.parent.delivery.bytes,sha256:bundle.parent.delivery.sha256},selected.review)||!equal({bytes:bundle.metadata.bytes,sha256:bundle.metadata.sha256},selected.metadata))throw fail('joint_activation_intent_stale');
  const nativeStore=native,jointStore=joint;
  const result=await withOriginalMetadataJournals(scope,witness,bundle,async(original,journals,journalRevocations)=>{
   if(original.choice.parent.database!==choice.plan.origin.reviewDatabase||original.choice.database!==choice.plan.origin.metadataDatabase)throw fail('joint_activation_intent_stale');
   let visiting=true;const heldCheck=()=>{if(!visiting)throw fail('joint_activation_closed');check();nativeStore.check();jointStore.check();checkHeldOriginalMetadataJournals(scope,original);};heldCheck();
   try{
   const work:ColdJointActivationOriginWork<Choice,Intent>=Object.freeze({choice,retained,publication,original,journals,check:heldCheck,revocations:Object.freeze([nativeStore.revoked,jointStore.revoked,...journalRevocations]),
    async observeNativeStarted(guard:IntentObservationGuard){heldCheck();nativeState=(await nativeStore.markRequestStarted(guard)).state;heldCheck();},
    async observeNativeReceipt(receipt:SharedDurableNativeActivationReceipt,guard:IntentObservationGuard){heldCheck();nativeState=(await nativeStore.markReceiptObserved(receipt,guard)).state;heldCheck();},
    async observePublicationStarted(guard:IntentObservationGuard){heldCheck();publication=await jointStore.markPublicationStarted(guard);heldCheck();},
    async observePublicationReceipt(receipt:SharedNativeRoomPublicationReceipt,guard:IntentObservationGuard){heldCheck();publication=await jointStore.markPublicationObserved(receipt,guard);heldCheck();}
   });
   visits.set(work,{scope,check:heldCheck});
   if(nativeStore instanceof RoomHandoverActivationIntentStore)handoverIntents.set(work,nativeStore);
   const value=await visit(work);heldCheck();
   if(!equal((await nativeStore.read()).state,nativeState)||!equal(await jointStore.read(),publication))throw fail('joint_activation_intent_stale');heldCheck();return value;
   }finally{visiting=false;}
  });check();return result;
 }catch(error){primary=error;failed=true;throw error;}finally{
  active=false;const errors:unknown[]=[];
  for(const close of[()=>native?.close(),()=>joint?.close()])try{await close();}catch(error){errors.push(error);}
  if(errors.length)throw new AggregateError(failed?[primary,...errors]:errors,'Cold joint origin reads did not drain');
 }
}
const ordinary:OriginReader<JointRoomActivationIntentChoice,RoomActivationRetainedIntent>={
 parse:jointRoomActivationIntentChoice,
 joint:(choice,options)=>new JointRoomActivationIntentStore(choice,options),
 native:(choice,options)=>new RoomActivationIntentStore(choice.plan.activation,options),
 original:retained=>retained.capture.recovery.bundle.original.packets.references.parent,
};
const handover:OriginReader<JointHandoverActivationIntentChoice,RoomHandoverActivationRetainedIntent>={
 parse:jointHandoverActivationIntentChoice,
 joint:(choice,options)=>JointRoomActivationIntentStore.acrossHandover(choice,options),
 native:(choice,options)=>new RoomHandoverActivationIntentStore(choice.plan.activation,options),
 original:retained=>retained.capture.capture.recovery.bundle.original.packets.references.parent,
};
export function withColdJointActivationOrigin<T>(
 scope:SelectedNativeRecoveryScope,witness:RoomMetadataTargetWitness,choice:JointRoomActivationIntentChoice,
 visit:(work:ColdJointActivationOriginWork)=>Promise<T>,
):Promise<T>{
 return withColdOrigin(scope,witness,choice,ordinary,visit);
}
export function withColdJointHandoverOrigin<T>(
 scope:SelectedNativeRecoveryScope,witness:RoomMetadataTargetWitness,choice:JointHandoverActivationIntentChoice,
 visit:(work:ColdJointHandoverOriginWork)=>Promise<T>,
):Promise<T>{
 return withColdOrigin(scope,witness,choice,handover,visit);
}
