/** SDK-private mutable execution. Saved progress is DATA, never actor custody,
 * participant authority, a provider acknowledgement or room activation. */
import type {RoomExecutionChoice,RoomExecutionReadOptions} from '../native_room_execution/contract.js';
import type {PhysicalOperationV3Participant} from '../physical_room_operation_v3/contract.js';
export interface RoomRunIdentity {
 readonly format:'breditor/native-room-run';readonly formatVersion:1;
 readonly database:string;readonly execution:RoomExecutionChoice;
}
export type RoomRunStage='start'|'resume'|'retired'|'catalog-started'|'root-started'|'root-ready'|'assets-started'|'assets-ready';
export interface RoomRunEvent {
 readonly format:'breditor/native-room-run-event';readonly formatVersion:1;
 readonly execution:string;readonly sequence:number;readonly previous:string|null;readonly stage:RoomRunStage;
}
export interface RoomRunStoredEvent {readonly event:RoomRunEvent;readonly sha256:string}
export interface RoomRunSnapshot {
 readonly identity:RoomRunIdentity;readonly execution:string;
 readonly head:Readonly<{sequence:number;sha256:string}>;readonly events:readonly RoomRunStoredEvent[];
}
/** Read-only bootstrap data. The caller must still choose and approve a fresh
 * start or resume against current storage. */
export type RoomRunJournalObservation=
 |Readonly<{kind:'absent';identity:RoomRunIdentity}>
 |Readonly<{kind:'existing';snapshot:RoomRunSnapshot}>;

export interface RoomRunApproval {
 readonly format:'breditor/native-room-run-approval';readonly formatVersion:1;
 readonly identity:RoomRunIdentity;readonly head:RoomRunSnapshot['head'];
}
export interface RoomRunOptions {
 readonly expected:RoomRunIdentity;readonly participants:readonly PhysicalOperationV3Participant[];
}
export interface RoomRunResult {
 readonly format:'breditor/native-room-run-result';readonly formatVersion:1;
 readonly identity:RoomRunIdentity;readonly head:RoomRunSnapshot['head'];
 readonly state:'targets-and-assets-ready';readonly scope:'held-local-replacement-only';
}
export type RoomRunReadOptions=RoomExecutionReadOptions;

/** Joint fresh decision DATA. The existing execution/journal and approval file
 * keep their original formats; no new stage or stored writer grant is added. */
export interface RoomRunPromotionChoice {
 readonly format:'breditor/native-room-run-promotion-choice';readonly formatVersion:1;
 readonly identity:RoomRunIdentity;readonly head:RoomRunSnapshot['head'];
 readonly approval:import('../physical_room_asset_approval/contract.js').RoomAssetApprovalChoice;
}
export interface RoomRunPromotionOptions {
 readonly expected:RoomRunPromotionChoice;
 readonly approve:(choice:RoomRunPromotionChoice)=>boolean|Promise<boolean>;
 /** Selected-asset access after handoff, independent of the ended attempt. */
 readonly checkAssetAuthority:()=>void;
}
export interface RoomRunPromotionResult {
 readonly format:'breditor/native-room-run-promotion-result';readonly formatVersion:1;
 readonly choice:RoomRunPromotionChoice;
 readonly approval:import('../physical_room_asset_approval/contract.js').RoomAssetApprovalSelection;
 readonly scope:'local-native-packet-selected-asset-and-actor-ownership';
}
