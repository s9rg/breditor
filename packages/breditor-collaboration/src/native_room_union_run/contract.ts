/** SDK-private mutable execution. Saved progress is DATA, never actor custody,
 * participant authority, a provider acknowledgement or room activation. */
import type {NativeRoomUnionExecutionChoice,NativeRoomUnionExecutionReadOptions} from '../native_room_union_execution/contract.js';
import type {PhysicalOperationV3Participant} from '../physical_room_operation_v3/contract.js';
export interface NativeRoomUnionRunIdentity {
 readonly format:'breditor/native-room-union-run';readonly formatVersion:1;
 readonly database:string;readonly execution:NativeRoomUnionExecutionChoice;
}
export type NativeRoomUnionRunStage='start'|'resume'|'retired'|'catalog-started'|'root-started'|'root-ready'|'assets-started'|'assets-ready'|'handoff-prepared'|'handoff-observed';
export interface NativeRoomUnionRunEvent {
 readonly format:'breditor/native-room-union-run-event';readonly formatVersion:1;
 readonly execution:string;readonly sequence:number;readonly previous:string|null;readonly stage:NativeRoomUnionRunStage;readonly handoff:NativeRoomUnionRunHandoff|null;
}
export interface NativeRoomUnionRunStoredEvent {readonly event:NativeRoomUnionRunEvent;readonly sha256:string}
export interface NativeRoomUnionRunSnapshot {
 readonly identity:NativeRoomUnionRunIdentity;readonly execution:string;
 readonly head:Readonly<{sequence:number;sha256:string}>;readonly events:readonly NativeRoomUnionRunStoredEvent[];
}
export interface NativeRoomUnionRunApproval {
 readonly format:'breditor/native-room-union-run-approval';readonly formatVersion:1;
 readonly identity:NativeRoomUnionRunIdentity;readonly head:NativeRoomUnionRunSnapshot['head'];
}
export interface NativeRoomUnionRunOptions {
 readonly expected:NativeRoomUnionRunIdentity;readonly participants:readonly PhysicalOperationV3Participant[];
}
export interface NativeRoomUnionRunResult {
 readonly format:'breditor/native-room-union-run-result';readonly formatVersion:1;
 readonly identity:NativeRoomUnionRunIdentity;readonly head:NativeRoomUnionRunSnapshot['head'];
 readonly state:'targets-and-assets-ready';readonly scope:'held-local-replacement-only';
}
export type NativeRoomUnionRunReadOptions=NativeRoomUnionExecutionReadOptions;

/** Joint fresh decision DATA. The mixed execution and this distinct journal
 * retain their own identities; no stored writer grant is added. */
export interface NativeRoomUnionRunPromotionChoice {
 readonly format:'breditor/native-room-union-run-promotion-choice';readonly formatVersion:1;
 readonly identity:NativeRoomUnionRunIdentity;readonly head:NativeRoomUnionRunSnapshot['head'];
 readonly approval:import('../physical_room_asset_approval/contract.js').RoomAssetApprovalChoice;
}
export interface NativeRoomUnionRunPromotionOptions {
 readonly expected:NativeRoomUnionRunPromotionChoice;
 readonly approve:(choice:NativeRoomUnionRunPromotionChoice)=>boolean|Promise<boolean>;
 /** Selected-asset access after handoff, independent of the ended attempt. */
 readonly checkAssetAuthority:()=>void;
}
export interface NativeRoomUnionRunPromotionResult {
 readonly format:'breditor/native-room-union-run-promotion-result';readonly formatVersion:1;
 readonly choice:NativeRoomUnionRunPromotionChoice;
 readonly approval:import('../physical_room_asset_approval/contract.js').RoomAssetApprovalSelection;
 readonly scope:'local-native-packet-selected-asset-and-actor-ownership';
}

/** A hash of the exact joint approval, not authority or proof of activation. */
export interface NativeRoomUnionRunHandoff {readonly decisionHead:Readonly<{sequence:number;sha256:string}>;readonly approval:Readonly<{bytes:number;sha256:string}>;readonly approvalFile:import('../physical_room_asset_approval/contract.js').RoomAssetApprovalSelection}

/** Complete restart data reconstructed from a pinned retained approval, never
 * actor custody, acknowledgement of remote authorship or serving permission. */
export interface NativeRoomUnionRunHandoffData {readonly identity:NativeRoomUnionRunIdentity;readonly head:NativeRoomUnionRunSnapshot['head'];readonly state:'prepared'|'observed';readonly choice:NativeRoomUnionRunPromotionChoice;readonly approval:import('../physical_room_asset_approval/contract.js').RoomAssetApprovalFile;readonly basis:import('../selected_room_current/contract.js').SelectedRoomCurrentFile}
