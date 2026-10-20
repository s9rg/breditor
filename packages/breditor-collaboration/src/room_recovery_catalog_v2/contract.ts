/** Explicit second catalog family. Component formats, factories and native histories are unchanged. */
import type {SharedParticipantBackupSelection} from "../participant_backup/types.js";
import type {SharedGenerationParticipantSelection} from "../generation_participant/contract.js";
import type {SharedRoomParticipantInventoryIdentity} from "../room_participant_inventory/types.js";
import type {SharedRoomRecoveryCatalogSelection,SharedRoomRecoveryFileIdentity} from "../room_recovery_catalog/types.js";
import type {SharedParticipantRecoveryOptions} from "../participant_recovery/types.js";
import type {SharedGenerationParticipantRecoveryOptions} from "../generation_participant/recovery_contract.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedRoomParticipantCoverage} from "../room_participant_inventory/types.js";
import type {SharedRoomRecoveryCatalogArchiveV2} from "./archive.js";
export type SharedRoomRecoveryCatalogV2Selection=SharedRoomRecoveryCatalogSelection;
export type SharedRoomRecoveryCatalogV2Entry=
 |Readonly<{id:string;family:"original";selection:SharedParticipantBackupSelection;bytes:number}>
 |Readonly<{id:string;family:"generation";selection:SharedGenerationParticipantSelection;bytes:number}>;
export interface SharedRoomRecoveryCatalogV2Metadata {
 readonly format:"breditor/shared-room-recovery-catalog";readonly formatVersion:2;readonly catalog:string;
 readonly inventory:Readonly<{identity:SharedRoomParticipantInventoryIdentity;bytes:number}>;
 readonly server:SharedRoomRecoveryFileIdentity;
 /** All supplied original/generation copies remain retained, including duplicate historic writers. */
 readonly participants:readonly SharedRoomRecoveryCatalogV2Entry[];
}
export type SharedRoomRecoveryCatalogV2Input=
 |Readonly<{id:string;family:"original";file:Blob;expected:SharedParticipantBackupSelection}>
 |Readonly<{id:string;family:"generation";file:Blob;expected:SharedGenerationParticipantSelection}>;
export interface SharedRoomRecoveryCatalogV2CaptureOptions {
 readonly catalog:string;
 readonly inventory:Readonly<{file:Blob;expected:SharedRoomParticipantInventoryIdentity}>;
 readonly server:Readonly<{file:Blob;expected:SharedRoomRecoveryFileIdentity}>;
 readonly participants:readonly SharedRoomRecoveryCatalogV2Input[];
 readonly checkAuthority:()=>void;readonly signal?:AbortSignal;
}
type Factory<T>=Omit<T,"backup"|"expected"|"checkAuthority"|"signal">;
export type SharedRoomRecoveryCatalogV2Participant=
 |Readonly<{id:string;family:"original";recovery:Factory<SharedParticipantRecoveryOptions<SharedSelectionPolicy>>}>
 |Readonly<{id:string;family:"generation";recovery:Factory<SharedGenerationParticipantRecoveryOptions<SharedSelectionPolicy>>}>;
export interface SharedRoomRecoveryCatalogV2OpenOptions {readonly database:string;readonly expected:SharedRoomRecoveryCatalogV2Selection;readonly checkAuthority:()=>void;readonly signal?:AbortSignal}
export interface SharedRoomRecoveryCatalogV2BeginOptions extends SharedRoomRecoveryCatalogV2OpenOptions {readonly archive:SharedRoomRecoveryCatalogArchiveV2}
export interface SharedRoomRecoveryCatalogV2Check {readonly kind:"checked"|"pending";readonly coverage:SharedRoomParticipantCoverage;readonly stagedParticipants:readonly string[];readonly unreconciledParticipants:readonly string[]}
export type SharedRoomRecoveryCatalogV2Progress=import("./record.js").CatalogV2Progress;
