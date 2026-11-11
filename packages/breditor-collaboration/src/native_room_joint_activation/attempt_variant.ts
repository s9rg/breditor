/** Bind each closed intent family to its actual Native and metadata actions.
 * The joint owner keeps source custody and the publication barrier in one place. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {heldHandoverActivationPath} from '../room_native_handover_activation_intent/path.js';
import type {RoomHandoverActivationIntentChoice} from '../room_native_handover_activation_intent/contract.js';
import type {RoomExecutionReadOptions} from '../native_room_execution/contract.js';
import type {RoomMetadataTargetWitness} from '../native_room_execution_run/attempt.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {fields} from '../physical_room_record_cut/policy.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import type {LocalMetadataRoomBundle} from '../selected_local_metadata_delivery/contract.js';
import {SelectedLocalMetadataDelivery as Metadata} from '../selected_local_metadata_delivery/coordinator.js';
import type {MetadataContinuationDestinations,MetadataContinuationResult} from '../selected_local_metadata_continuation/contract.js';
import {
 previewHeldRoomMetadataContinuation,continueHeldRoomMetadata,
 previewHeldRoomMetadataContinuationAcrossHandover,continueHeldRoomMetadataAcrossHandover,
} from '../selected_local_metadata_continuation/coordinator.js';
import type {HandoverMetadataContinuationResult} from '../selected_local_metadata_continuation/handover_contract.js';
import {captureJointRoomActivationIntent,captureJointHandoverActivationIntent} from './intent_capture.js';
import type {JointActivationMetadataOrigin} from './metadata_origin.js';
import type {JointRoomActivationIntentChoice} from './intent_contract.js';
import type {JointRoomActivationPreparationInput,JointRoomNativeCommitInput,JointRoomMetadataInput,JointRoomPublicationInput} from './attempt_contract.js';
import type {JointHandoverActivationIntentChoice,JointHandoverActivationPreparationInput,JointHandoverNativeCommitInput,JointHandoverMetadataInput,JointHandoverPublicationInput} from './handover_contract.js';
import {JointRoomActivationIntentStore} from './intent_store.js';
import {jointIntentFailure as fail} from './intent_policy.js';

const ordinaryCommit=Metadata.prototype.commitNativeActivation;
const handoverCommit=Metadata.prototype.commitNativeActivationAcrossHandover;
export interface OrdinaryJointActivation {
 readonly choice:JointRoomActivationIntentChoice;
 readonly prepare:JointRoomActivationPreparationInput;
 readonly commit:JointRoomNativeCommitInput;
 readonly committed:Awaited<ReturnType<typeof ordinaryCommit>>;
 readonly metadata:JointRoomMetadataInput;
 readonly publication:JointRoomPublicationInput;
 readonly continued:MetadataContinuationResult;
}
export interface HandoverJointActivation {
 readonly choice:JointHandoverActivationIntentChoice;
 readonly prepare:JointHandoverActivationPreparationInput;
 readonly commit:JointHandoverNativeCommitInput;
 readonly committed:Awaited<ReturnType<typeof handoverCommit>>;
 readonly metadata:JointHandoverMetadataInput;
 readonly publication:JointHandoverPublicationInput;
 readonly continued:HandoverMetadataContinuationResult;
}
export type JointActivationFamily=OrdinaryJointActivation|HandoverJointActivation;
type Decision<T>=(choice:T)=>boolean|Promise<boolean>;
interface MetadataVisit<Intent,Result extends JointActivationFamily['continued']> {
 readonly signal:AbortSignal;
 readonly check:()=>void;
 readonly close:()=>void;
 readonly verify:(signal:AbortSignal)=>void|Promise<void>;
 readonly approvePublication:Decision<Intent>|undefined;
 preview():Promise<Result['choice']>;
 run(expected:Result['choice'],resume:boolean):Promise<Result>;
}
export interface JointActivationVariant<F extends JointActivationFamily> {
 capture(scope:SelectedNativeRecoveryScope,reads:RoomExecutionReadOptions,input:F['prepare']):Promise<{
  choice:F['choice'];origin:JointActivationMetadataOrigin<F['choice']['plan']['origin']['selection']>;
 }>;
 store(choice:F['choice'],options:SharedArchiveIntegrityOptions):JointRoomActivationIntentStore;
 commit(metadata:Metadata,expected:F['choice'],input:F['commit']):Promise<F['committed']>;
 target(scope:SelectedNativeRecoveryScope,witness:RoomMetadataTargetWitness,origin:LocalMetadataRoomBundle,choice:F['choice'],
  input:F['metadata']|F['publication'],publishing:boolean):MetadataVisit<F['choice'],F['continued']>;
 cut(result:F['continued']):MetadataContinuationResult['choice']['target'];
}
function targetPolicy<Choice,Intent>(
 scope:SelectedNativeRecoveryScope,provided:unknown,control:'host'|'path',publishing:boolean,
){
 const r=fields(provided,[control,'inventory','checkAuthority','approve',...(publishing?['approvePublication']:[])]);
 const approve=r['approve'],approvePublication=r['approvePublication'];
 if(typeof approve!=='function'||publishing&&typeof approvePublication!=='function')throw fail();
 const authority=participantAuthority(r['checkAuthority'] as ()=>void);
 const check=()=>{scope.check();authority();scope.check();};
 return {r,check,approve:approve as Decision<Choice>,approvePublication:approvePublication as Decision<Intent>|undefined};
}

/** Read and continue the private target using the exact selected sealed path. */
export function handoverMetadataVisit<Intent>(
 scope:SelectedNativeRecoveryScope,witness:RoomMetadataTargetWitness,origin:LocalMetadataRoomBundle,
 destinations:MetadataContinuationDestinations,expectedPath:RoomHandoverActivationIntentChoice['handover'],
 input:unknown,publishing:boolean,
 custody?:Readonly<{check:()=>void;signals:readonly AbortSignal[]}>,
):MetadataVisit<Intent,HandoverMetadataContinuationResult>{
 const {r,check,approve,approvePublication}=targetPolicy<HandoverMetadataContinuationResult['choice'],Intent>(scope,input,'path',publishing);
 const host=r['path'] as JointHandoverMetadataInput['path'];
 const path=heldHandoverActivationPath(host,expectedPath);
 const waits=new NativeReconstructionWaits(()=>{check();custody?.check();path.guard(scope.signal);},
  [scope.signal,...path.signals,...(custody?.signals??[])]);
 const request={...destinations,origin,path:host,inventory:r['inventory'] as JointHandoverMetadataInput['inventory'],checkAuthority:waits.check};
 return {signal:waits.signal,check:waits.check,close:()=>waits.close(),verify:signal=>path.check(signal),approvePublication,
  preview:()=>previewHeldRoomMetadataContinuationAcrossHandover(scope,witness,request),
  run:(expected,resume)=>continueHeldRoomMetadataAcrossHandover(scope,witness,{...request,expected,approve},resume)};
}

export const ordinaryJointActivation:JointActivationVariant<OrdinaryJointActivation>=Object.freeze({
 capture:captureJointRoomActivationIntent,
 store:(choice,options)=>new JointRoomActivationIntentStore(choice,options),
 commit(metadata,expected,provided){
  const r=fields(provided,['activation','inspection','approve'],['limits']);
  return ordinaryCommit.call(metadata,{...r,expected:expected.plan.activation} as Parameters<typeof ordinaryCommit>[0]);
 },
 target(scope,witness,origin,choice,input,publishing){
  const {r,check,approve,approvePublication}=targetPolicy<MetadataContinuationResult['choice'],JointRoomActivationIntentChoice>(scope,input,'host',publishing);
  const request={...choice.plan.destinations,origin,host:r['host'] as JointRoomMetadataInput['host'],inventory:r['inventory'] as JointRoomMetadataInput['inventory'],checkAuthority:check};
  return {signal:scope.signal,check,close(){},verify:check,approvePublication,
   preview:()=>previewHeldRoomMetadataContinuation(scope,witness,request),
   run:(expected,resume)=>continueHeldRoomMetadata(scope,witness,{...request,expected,approve},resume)};
 },
 cut:result=>result.choice.target,
} satisfies JointActivationVariant<OrdinaryJointActivation>);

export const handoverJointActivation:JointActivationVariant<HandoverJointActivation>=Object.freeze({
 capture:captureJointHandoverActivationIntent,
 store:(choice,options)=>JointRoomActivationIntentStore.acrossHandover(choice,options),
 commit(metadata,expected,provided){
  const r=fields(provided,['activation','path','inspection','approve'],['limits']);
  return handoverCommit.call(metadata,{...r,expected:expected.plan.activation} as Parameters<typeof handoverCommit>[0]);
 },
 target(scope,witness,origin,choice,input,publishing){
  return handoverMetadataVisit<JointHandoverActivationIntentChoice>(scope,witness,origin,choice.plan.destinations,choice.plan.activation.handover,input,publishing);
 },
 cut:result=>result.choice.continuation.target,
} satisfies JointActivationVariant<HandoverJointActivation>);
