/** Client-side operational recovery only. No server-host ancestry or activation capability. */
import type {SharedArchiveIntegrityOptions} from "../archive_integrity/contract.js";
import type {SharedPhysicalRoomParticipantStage} from "../physical_room_stage/stage.js";
import type {SharedPhysicalRoomStageParticipant} from "../physical_room_stage/contract.js";
import type {SharedPhysicalRoomRecoveryCatalogSelection} from "../physical_room_catalog/contract.js";
import type {SharedParticipantOperationCurrentPolicy} from "../participant_operation/types.js";
import type {MixedRoomOperationParts} from "../mixed_room_operation/custody.js";
export interface SharedPhysicalRoomOperationTarget {readonly id:string;readonly family:"original"|"generation";readonly operationDatabase:string}
export interface SharedPhysicalRoomOperationBeginOptions extends SharedArchiveIntegrityOptions {
 readonly database:string;readonly stage:SharedPhysicalRoomParticipantStage;readonly expected:SharedPhysicalRoomRecoveryCatalogSelection;
 readonly participants:readonly SharedPhysicalRoomOperationTarget[];
}
export type SharedPhysicalRoomOperationParticipant=SharedPhysicalRoomStageParticipant&Readonly<{operationDatabase:string;currentPolicy:SharedParticipantOperationCurrentPolicy}>;
export interface SharedPhysicalRoomOperationResumeOptions extends SharedArchiveIntegrityOptions {
 readonly database:string;readonly stageDatabase:string;readonly catalogDatabase:string;readonly expected:SharedPhysicalRoomRecoveryCatalogSelection;
 readonly participants:readonly SharedPhysicalRoomOperationParticipant[];
}
export interface SharedPhysicalRoomOperationProgress {
 readonly phase:"prepared"|"operational";
 readonly participants:readonly Readonly<SharedPhysicalRoomOperationTarget&{state:"reserved"|"started"|"complete"}>[];
 /** Retained unselected copies remain unresolved even after component handoff. */
 readonly unreconciledParticipants:readonly string[];
}
/** Actual disconnected clients. Never permission to start a replacement server. */
export type SharedPhysicalRoomOperationParts=MixedRoomOperationParts;
