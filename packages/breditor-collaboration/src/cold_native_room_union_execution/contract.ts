/** SDK-private process-independent continuation of an existing room run.
 * Choices are DATA, not durable grants or authenticated activation. */
import type {PhysicalOperationV3ResumeOptions} from '../physical_room_operation_v3/contract.js';
import type {NativeRoomUnionRunOptions,NativeRoomUnionRunReadOptions,NativeRoomUnionRunIdentity,NativeRoomUnionRunSnapshot} from '../native_room_union_run/contract.js';
import type {SelectedRoomCurrentFile} from '../selected_room_current/contract.js';
export interface ColdNativeRoomUnionExecutionOptions{
 readonly original:PhysicalOperationV3ResumeOptions;
 readonly run:NativeRoomUnionRunOptions;
 readonly reads:NativeRoomUnionRunReadOptions;
 /** Fresh temporary custody namespace, disjoint from every source and target. */
 readonly sourceIntentDatabase:string;
}
export interface ColdNativeRoomUnionExecutionChoice{
 readonly format:'breditor/cold-native-room-union-execution-choice';readonly formatVersion:1;
 readonly identity:NativeRoomUnionRunIdentity;readonly head:NativeRoomUnionRunSnapshot['head'];
 readonly original:SelectedRoomCurrentFile['selection'];
}
export interface ColdNativeRoomUnionExecutionPreview{readonly choice:ColdNativeRoomUnionExecutionChoice;readonly current:SelectedRoomCurrentFile}
export interface ColdNativeRoomUnionExecutionRunOptions{
 readonly expected:ColdNativeRoomUnionExecutionChoice;
 readonly approve:(choice:ColdNativeRoomUnionExecutionChoice)=>boolean|Promise<boolean>;
}
export interface ColdNativeRoomUnionOriginalRepairChoice{
 readonly format:'breditor/cold-native-room-union-original-repair-choice';readonly formatVersion:1;
 readonly identity:NativeRoomUnionRunIdentity;readonly head:NativeRoomUnionRunSnapshot['head'];
 readonly originalDatabase:string;readonly scope:'repair-existing-original-only';
}
