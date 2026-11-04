/** Build the new joint descriptor only after reading the actual complete
 * activation intent, original namespaces and independently retained execution.
 * Capture creates no replacement, sends no request and exposes no owner. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {checkSelectedNativeDeliveryScope} from '../relay/native_delivery.js';
import {readLocalMetadataActivationInScope,SelectedLocalMetadataDelivery} from '../selected_local_metadata_delivery/coordinator.js';
import {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import {readRoomExecution} from '../native_room_execution/coordinator.js';
import type {RoomExecutionReadOptions} from '../native_room_execution/contract.js';
import {roomRunIdentity} from '../native_room_execution_run/identity.js';
import type {RoomRunIdentity} from '../native_room_execution_run/contract.js';
import {nativePublicationHostPort,type SharedNativeRoomPublicationHost} from '../native_publication_control/host.js';
import type {MetadataContinuationDestinations} from '../selected_local_metadata_continuation/contract.js';
import type {RoomActivationIntentChoice} from '../room_native_activation_intent/contract.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {JointActivationMetadataOrigin} from './metadata_origin.js';
import {jointRoomActivationPlan,jointRoomActivationIntentChoice} from './intent_identity.js';
import {jointIntentFailure as fail,jointEqual as equal} from './intent_policy.js';
const metadataRecovery=SelectedLocalMetadataDelivery.prototype.recovery;
export interface JointRoomActivationCaptureInput {
 readonly database:string;readonly metadata:SelectedLocalMetadataDelivery;
 readonly activation:RoomActivationIntentChoice;readonly execution:RoomRunIdentity;
 readonly publication:SharedNativeRoomPublicationHost;readonly destinations:MetadataContinuationDestinations;
}
export async function captureJointRoomActivationIntent(scope:SelectedNativeRecoveryScope,reads:RoomExecutionReadOptions,input:JointRoomActivationCaptureInput){
 checkSelectedNativeDeliveryScope(scope);scope.check();
 const publication=nativePublicationHostPort(input.publication),execution=roomRunIdentity(input.execution),authority=participantAuthority(reads.checkAuthority);publication.check();scope.check();
 const retained=await readLocalMetadataActivationInScope(input.metadata,scope,input.activation);scope.check();
 const original=retained.capture.recovery.bundle.original.packets.references.parent;
 const before=await scope.retainCurrent();scope.check();
 if(!equal(before.current.selection,original.parent.current.selection)||!equal(execution.execution.plan.preparation.plan.before,before.current.selection))throw fail('joint_activation_intent_stale');
 const saved=await readRoomExecution(execution.execution,{...reads,signal:scope.signal,checkAuthority:()=>{scope.check();authority();scope.check();}});scope.check();
 if(!equal(saved.choice,execution.execution))throw fail('joint_activation_intent_stale');
 const origin=await JointActivationMetadataOrigin.capture(scope,input.metadata,retained.choice);scope.check();
 let loaded:Loaded|undefined;
 try{
  loaded=await Loaded.read(before.current,{...before.integrity,signal:scope.signal,checkAuthority:scope.check});scope.check();const root=loaded.nativeCut().root(),approval=loaded.approval().choice;
  const sourceNamespaces=[...new Set([root.database,root.source.catalogDatabase,...root.participants.flatMap(row=>row.namespaces.map(ns=>ns.database)),approval.adoption.database,...approval.adoption.participants.map(row=>row.targetDatabase)])].sort();
  const metadataChoice=metadataRecovery.call(input.metadata).current.choice;
  const plan=jointRoomActivationPlan({format:'breditor/joint-native-room-activation-plan',formatVersion:1,database:input.database,sourceNamespaces,activation:retained.choice,execution,origin:{selection:origin.selection(),reviewDatabase:metadataChoice.parent.database,metadataDatabase:metadataChoice.database},destinations:input.destinations,publication:publication.selection});
  const file=new Blob([JSON.stringify(plan)],{type:'application/json'}),integrity=prepareArchiveIntegrity({...before.integrity,signal:scope.signal,checkAuthority:scope.check}),sha256=await integrity.digest(file);scope.check();
  publication.check();scope.check();if(!equal((await scope.retainCurrent()).current.selection,before.current.selection))throw fail('joint_activation_intent_stale');scope.check();
  return Object.freeze({choice:jointRoomActivationIntentChoice({format:'breditor/joint-native-room-activation-intent',formatVersion:1,plan,bytes:file.size,sha256}),file,origin});
 }finally{loaded?.dispose();}
}
