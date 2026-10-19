import type {SharedRoomRecoveryCatalogArchive} from "../room_recovery_catalog/archive.js";
import type {SharedRoomRecoveryCatalogParticipant,SharedRoomRecoveryCatalogSelection} from "../room_recovery_catalog/types.js";
import type {SharedParticipantBackup} from "../participant_backup/archive.js";
import type {SharedAssetReferenceCapture} from "../asset_references_capture.js";
import type {SharedRoomParticipantCoverage} from "../room_participant_inventory/types.js";
/** Every retained file needs its explicit original native factory/policies, including duplicates.
 * Recovery destination names remain validated original policy; this read opens none of them. */
export interface SharedRoomReplayOptions{
 readonly archive:SharedRoomRecoveryCatalogArchive;
 readonly expected:SharedRoomRecoveryCatalogSelection;
 readonly participants:readonly SharedRoomRecoveryCatalogParticipant[];
 readonly checkAuthority:()=>void;
 readonly signal?:AbortSignal;
}
/** Borrowed genuine sources, never editable owners or a global readiness/activation result. */
export interface SharedRoomReplayEntry{
 readonly id:string;
 readonly backup:SharedParticipantBackup;
 readonly source:SharedAssetReferenceCapture;
 /** This copy alone against the original native inventory; other registered streams stay missing. */
 readonly originalInventory:SharedRoomParticipantCoverage;
}
