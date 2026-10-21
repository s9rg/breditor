/** Explicit mixed-family durable operation. Saved readiness selects no factory,
 * account permission, transport connection or historical-copy disposition. */
import type {SharedRoomRecoveryCatalogV2} from "../room_recovery_catalog_v2/catalog.js";
import type {SharedRoomRecoveryCatalogV2Selection,SharedRoomRecoveryCatalogV2Participant} from "../room_recovery_catalog_v2/contract.js";
import type {SharedParticipantOperationCurrentPolicy} from "../participant_operation/types.js";
import type {MixedRoomOperationParts} from "../mixed_room_operation/custody.js";
export interface SharedRoomOperationV2Target{readonly id:string;readonly family:"original"|"generation";readonly operationDatabase:string}
export interface SharedRoomOperationV2BeginOptions{
 readonly database:string;readonly catalog:SharedRoomRecoveryCatalogV2;readonly expected:SharedRoomRecoveryCatalogV2Selection;
 readonly participants:readonly SharedRoomOperationV2Target[];readonly checkAuthority:()=>void;readonly signal?:AbortSignal;
}
export type SharedRoomOperationV2Participant=SharedRoomRecoveryCatalogV2Participant&Readonly<{operationDatabase:string;currentPolicy:SharedParticipantOperationCurrentPolicy}>;
export interface SharedRoomOperationV2ResumeOptions{
 readonly database:string;readonly catalogDatabase:string;readonly expected:SharedRoomRecoveryCatalogV2Selection;
 readonly participants:readonly SharedRoomOperationV2Participant[];readonly checkAuthority:()=>void;readonly signal?:AbortSignal;
}
export interface SharedRoomOperationV2Progress{
 readonly phase:"prepared"|"operational";
 readonly participants:readonly Readonly<SharedRoomOperationV2Target&{state:"reserved"|"started"|"complete"}>[];
 /** All unselected historical copies are still retained. No automatic merging or disposal. */
 readonly unreconciledParticipants:readonly string[];
}
export type SharedRoomOperationV2Parts=MixedRoomOperationParts;
