/** SDK-private process-independent continuation of an existing room run.
 * Choices are DATA, not durable grants or authenticated activation. */
import type {PhysicalOperationV3ResumeOptions} from '../physical_room_operation_v3/contract.js';
import type {RoomRunOptions,RoomRunReadOptions,RoomRunIdentity,RoomRunSnapshot} from '../native_room_execution_run/contract.js';
import type {SelectedRoomCurrentFile} from '../selected_room_current/contract.js';
export interface ColdRoomExecutionOptions{
 readonly original:PhysicalOperationV3ResumeOptions;
 readonly run:RoomRunOptions;
 readonly reads:RoomRunReadOptions;
 /** Fresh temporary custody namespace, disjoint from every source and target. */
 readonly sourceIntentDatabase:string;
}
export interface ColdRoomExecutionChoice{
 readonly format:'breditor/cold-room-execution-choice';readonly formatVersion:1;
 readonly identity:RoomRunIdentity;readonly head:RoomRunSnapshot['head'];
 readonly original:SelectedRoomCurrentFile['selection'];
}
export interface ColdRoomExecutionPreview{readonly choice:ColdRoomExecutionChoice;readonly current:SelectedRoomCurrentFile}
export interface ColdRoomExecutionRunOptions{
 readonly expected:ColdRoomExecutionChoice;
 readonly approve:(choice:ColdRoomExecutionChoice)=>boolean|Promise<boolean>;
}
export interface ColdRoomOriginalRepairChoice{
 readonly format:'breditor/cold-room-original-repair-choice';readonly formatVersion:1;
 readonly identity:RoomRunIdentity;readonly head:RoomRunSnapshot['head'];
 readonly originalDatabase:string;readonly scope:'repair-existing-original-only';
}
