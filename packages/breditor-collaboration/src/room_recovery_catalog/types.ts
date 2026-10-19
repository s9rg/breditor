import type {SharedRoomParticipantInventoryIdentity,SharedRoomParticipantCoverage} from "../room_participant_inventory/types.js";
import type {SharedParticipantBackupSelection} from "../participant_backup/types.js";
import type {SharedParticipantRecoveryOptions} from "../participant_recovery/types.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedRoomRecoveryCatalogArchive} from "./archive.js";

/** A separately retained selection, not a saved account, credential or activation grant. */
export interface SharedRoomRecoveryCatalogSelection {readonly catalog:string;readonly sha256:string}
export interface SharedRoomRecoveryFileIdentity {readonly bytes:number;readonly sha256:string}
export interface SharedRoomRecoveryCatalogMetadata {
 readonly format:"breditor/shared-room-recovery-catalog";readonly formatVersion:1;readonly catalog:string;
 readonly inventory:Readonly<{identity:SharedRoomParticipantInventoryIdentity;bytes:number}>;
 /** Original native server bundle. Native replay/credential/provider checks remain separate. */
 readonly server:SharedRoomRecoveryFileIdentity;
 readonly participants:readonly Readonly<{id:string;selection:SharedParticipantBackupSelection;bytes:number}>[];
}
export interface SharedRoomRecoveryCatalogCaptureOptions {
 readonly catalog:string;
 readonly inventory:Readonly<{file:Blob;expected:SharedRoomParticipantInventoryIdentity}>;
 readonly server:Readonly<{file:Blob;expected:SharedRoomRecoveryFileIdentity}>;
 /** Include every supplied historic/duplicate copy. Candidate choice happens explicitly at staging. */
 readonly participants:readonly Readonly<{id:string;file:Blob;expected:SharedParticipantBackupSelection}>[];
 readonly checkAuthority:()=>void;readonly signal?:AbortSignal;
}
export interface SharedRoomRecoveryCatalogOpenOptions {
 readonly database:string;readonly expected:SharedRoomRecoveryCatalogSelection;
 readonly checkAuthority:()=>void;readonly signal?:AbortSignal;
}
export interface SharedRoomRecoveryCatalogBeginOptions extends SharedRoomRecoveryCatalogOpenOptions {
 /** Capture first and retain its selection before this first storage write; resume handles lost ACKs. */
 readonly archive:SharedRoomRecoveryCatalogArchive;
}
/** Explicit native factories and targets. A stored file/plan never selects executable code. */
export interface SharedRoomRecoveryCatalogParticipant {
 readonly id:string;
 readonly recovery:Omit<SharedParticipantRecoveryOptions<SharedSelectionPolicy>,"backup"|"expected"|"checkAuthority"|"signal">;
}
export interface SharedRoomRecoveryCatalogProgress {
 /** Past control-flow markers only; staging always reopens and verifies the actual participants. */
 readonly phase:"retained"|"staging"|"checked";
 readonly participants:readonly Readonly<{id:string;state:"reserved"|"started"|"complete"}>[];
}
/** Selected-source diagnostics, never a durable all-room readiness or activation proof. */
export interface SharedRoomRecoveryCatalogCheck {
 readonly kind:"checked"|"pending";
 readonly coverage:SharedRoomParticipantCoverage;
 readonly stagedParticipants:readonly string[];
 /** Unselected copies remain retained and unresolved, even when registered streams are covered. */
 readonly unreconciledParticipants:readonly string[];
}
