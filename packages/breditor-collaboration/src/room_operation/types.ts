import type {SharedRoomRecoveryCatalog} from "../room_recovery_catalog/catalog.js";
import type {SharedRoomRecoveryCatalogParticipant,SharedRoomRecoveryCatalogSelection} from "../room_recovery_catalog/types.js";
import type {SharedParticipantOperationCurrentPolicy,OperationalSharedParticipantParts} from "../participant_operation/types.js";
import type {SharedSelectionPolicy} from "../types.js";
export interface SharedRoomOperationTarget{readonly id:string;readonly operationDatabase:string}
export interface SharedRoomOperationBeginOptions{
 readonly database:string;readonly catalog:SharedRoomRecoveryCatalog;readonly expected:SharedRoomRecoveryCatalogSelection;
 readonly participants:readonly SharedRoomOperationTarget[];readonly checkAuthority:()=>void;readonly signal?:AbortSignal;
}
/** Original factories and destinations remain explicit; current permissions are separate. */
export interface SharedRoomOperationParticipant extends SharedRoomOperationTarget{
 readonly recovery:SharedRoomRecoveryCatalogParticipant["recovery"];readonly currentPolicy:SharedParticipantOperationCurrentPolicy;
}
export interface SharedRoomOperationResumeOptions{
 readonly database:string;readonly catalogDatabase:string;readonly expected:SharedRoomRecoveryCatalogSelection;
 readonly participants:readonly SharedRoomOperationParticipant[];readonly checkAuthority:()=>void;readonly signal?:AbortSignal;
}
export interface SharedRoomOperationProgress{
 readonly phase:"prepared"|"operational";
 readonly participants:readonly Readonly<{id:string;operationDatabase:string;state:"reserved"|"started"|"complete"}>[];
 /** All unselected copies stay retained. This is not current room/provider reconciliation. */
 readonly unreconciledParticipants:readonly string[];
}
export interface SharedRoomOperationParts{
 readonly participants:readonly Readonly<{id:string;parts:OperationalSharedParticipantParts<SharedSelectionPolicy>}>[];
}
