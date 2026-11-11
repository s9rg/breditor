/** Cold recovery confirms the retained Native intent while the actual new
 * owners, original journals and original selection remain held. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {generationRecoveryHostPort} from '../generation_recovery_control/host.js';
import {nativeActivationHostPort} from '../native_activation_control/host.js';
import {activationFailure} from '../native_activation_control/policy.js';
import type {SharedDurableNativeActivationReceipt} from '../native_activation_control/contract.js';
import type {RoomMetadataTargetWitness} from '../native_room_execution_run/attempt.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {decideFreshAssetChoice} from '../physical_room_asset_approval/decision.js';
import {readHeldRoomActivation} from '../room_native_activation_intent/commit.js';
import {readHeldHandoverRoomActivation} from '../room_native_handover_activation_intent/commit.js';
import {heldHandoverActivationPath} from '../room_native_handover_activation_intent/path.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import type {ColdJointRoomActivationOptions,ColdJointHandoverActivationOptions} from './cold_contract.js';
import {
 withColdJointActivationOrigin,withColdJointHandoverOrigin,
 type ColdJointActivationOriginWork,type ColdJointHandoverOriginWork,
} from './cold_origin.js';
import {inspectColdJointNativeCapture,inspectColdJointHandoverCapture} from './cold_native_inspection.js';
import {ordinaryJointActivation,handoverJointActivation,type JointActivationVariant,type OrdinaryJointActivation,type HandoverJointActivation} from './attempt_variant.js';
import {jointRoomActivationIntentChoice,jointHandoverActivationIntentChoice} from './intent_identity.js';
import {jointIntentFailure as fail,jointEqual as equal} from './intent_policy.js';

export type ColdOrdinaryActivation=OrdinaryJointActivation&{
 readonly options:ColdJointRoomActivationOptions;
 readonly origin:ColdJointActivationOriginWork;
};
export type ColdHandoverActivation=HandoverJointActivation&{
 readonly options:ColdJointHandoverActivationOptions;
 readonly origin:ColdJointHandoverOriginWork;
};
export type ColdActivationFamily=ColdOrdinaryActivation|ColdHandoverActivation;
export interface ColdActivationVariant<F extends ColdActivationFamily> extends Pick<JointActivationVariant<F>,'store'|'target'|'cut'> {
 parseChoice(choice:unknown):F['choice'];
 readNative(choice:F['choice'],options:SharedArchiveIntegrityOptions):Promise<unknown>;
 withOrigin<T>(scope:SelectedNativeRecoveryScope,witness:RoomMetadataTargetWitness,choice:F['choice'],visit:(origin:F['origin'])=>Promise<T>):Promise<T>;
 confirm(scope:SelectedNativeRecoveryScope,origin:F['origin'],provided:F['commit'],check:()=>void):Promise<F['committed']>;
}
const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
export function decideColdActivation<T>(choice:T,approve:(choice:T)=>boolean|Promise<boolean>,waits:NativeReconstructionWaits){
 const signal=waits.signal;
 return decideFreshAssetChoice(choice,approve,{check:waits.check,signal,watchClosing:cancel=>{
  add.call(signal,'abort',cancel,{once:true});return()=>remove.call(signal,'abort',cancel);
 }});
}
type HeldNativeObservation=Pick<ColdJointActivationOriginWork,'check'|'revocations'|'observeNativeStarted'|'observeNativeReceipt'>;
/** Apply the same authenticated request sequence to an already admitted journal. */
export async function confirmHeldColdNative(
 scope:Pick<SelectedNativeRecoveryScope,'signal'>,origin:HeldNativeObservation,
 port:ReturnType<typeof nativeActivationHostPort>,approve:()=>boolean|Promise<boolean>,
 checkOwner:()=>void,inspect:(signal:AbortSignal)=>Promise<void>,path?:ReturnType<typeof heldHandoverActivationPath>,
):Promise<SharedDurableNativeActivationReceipt>{
 const check=()=>{checkOwner();origin.check();port.check();path?.guard(scope.signal);};
 const waits=new NativeReconstructionWaits(check,[scope.signal,...origin.revocations,...port.signals,...(path?.signals??[])]);
 let started=false;
 try{
  await path?.check(waits.signal);waits.check();
  await inspect(waits.signal);waits.check();
  await decideColdActivation(undefined,approve,waits);
  await path?.check(waits.signal);waits.check();
  await inspect(waits.signal);waits.check();
  started=true;
  await origin.observeNativeStarted();waits.check();
  await path?.check(waits.signal);waits.check();
  const receipt=await port.commit(waits.check,waits.signal);waits.check();
  await path?.check(waits.signal);waits.check();
  await origin.observeNativeReceipt(receipt);waits.check();
  return receipt;
 }catch(error){if(started)throw activationFailure('activation_outcome_unknown',error);throw error;}
 finally{waits.close();}
}
export const coldOrdinaryActivation:ColdActivationVariant<ColdOrdinaryActivation>=Object.freeze({
 parseChoice:jointRoomActivationIntentChoice,withOrigin:withColdJointActivationOrigin,
 store:ordinaryJointActivation.store,target:ordinaryJointActivation.target,cut:ordinaryJointActivation.cut,
 readNative:(choice,options)=>readHeldRoomActivation(choice.plan.activation,options),
 async confirm(scope,origin,provided,check){
  const r=fields(provided,['activation','inspection','approve'],['limits']);
  const input=r as unknown as ColdOrdinaryActivation['commit'];
  const port=nativeActivationHostPort(input.activation),expected=origin.choice.plan.activation;
  generationRecoveryHostPort(input.inspection);
  if(typeof input.approve!=='function'||!equal(port.selection,expected.activation))throw fail('joint_activation_intent_stale');
  const receipt=await confirmHeldColdNative(scope,origin,port,()=>input.approve(expected),check,()=>inspectColdJointNativeCapture(scope,origin,input));
  return Object.freeze({format:'breditor/coordinated-native-activation-result',formatVersion:1,scope:'held-client-metadata-upload-cut-and-actual-native-service',intent:expected,receipt});
 },
} satisfies ColdActivationVariant<ColdOrdinaryActivation>);
export const coldHandoverActivation:ColdActivationVariant<ColdHandoverActivation>=Object.freeze({
 parseChoice:jointHandoverActivationIntentChoice,withOrigin:withColdJointHandoverOrigin,
 store:handoverJointActivation.store,target:handoverJointActivation.target,cut:handoverJointActivation.cut,
 readNative:(choice,options)=>readHeldHandoverRoomActivation(choice.plan.activation,options),
 async confirm(scope,origin,provided,check){
  const r=fields(provided,['activation','inspection','path','approve'],['limits']);
  const input=r as unknown as ColdHandoverActivation['commit'];
  const port=nativeActivationHostPort(input.activation),expected=origin.choice.plan.activation;
  generationRecoveryHostPort(input.inspection);
  const path=heldHandoverActivationPath(input.path,expected.handover);
  if(typeof input.approve!=='function'||!equal(port.selection,expected.activation))throw fail('joint_activation_intent_stale');
  const receipt=await confirmHeldColdNative(scope,origin,port,()=>input.approve(expected),check,signal=>inspectColdJointHandoverCapture(scope,origin,input,signal),path);
  return Object.freeze({
   format:'breditor/coordinated-handover-native-activation-result',formatVersion:1,
   scope:'held-client-metadata-upload-cut-sealed-handover-and-actual-native-service',intent:expected,receipt,
  });
 },
} satisfies ColdActivationVariant<ColdHandoverActivation>);
