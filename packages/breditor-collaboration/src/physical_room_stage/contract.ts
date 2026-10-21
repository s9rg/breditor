/** Separate inactive native staging; immutable physical catalog formats are unchanged. */
import type {SharedArchiveIntegrityOptions} from "../archive_integrity/contract.js";
import type {SharedPhysicalRoomRecoveryCatalog} from "../physical_room_catalog/catalog.js";
import type {SharedPhysicalRoomRecoveryCatalogSelection} from "../physical_room_catalog/contract.js";
import type {SharedServerLogGenerationParticipantCoverage} from "../server_generation_inventory/contract.js";
import type {SharedRoomRecoveryCatalogV2Participant} from "../room_recovery_catalog_v2/contract.js";
/** Reuses original component factory choices, not either older catalog's saved protocol. */
export type SharedPhysicalRoomStageParticipant=SharedRoomRecoveryCatalogV2Participant;
export interface SharedPhysicalRoomStageOpenOptions extends SharedArchiveIntegrityOptions {
 readonly database:string;readonly catalog:SharedPhysicalRoomRecoveryCatalog;readonly expected:SharedPhysicalRoomRecoveryCatalogSelection;
}
export interface SharedPhysicalRoomStageCheck extends SharedServerLogGenerationParticipantCoverage {
 readonly kind:"checked"|"pending";readonly stagedParticipants:readonly string[];readonly unreconciledParticipants:readonly string[];
}
export interface SharedPhysicalRoomStageProgress {
 readonly phase:"retained"|"staging"|"staged";
 readonly participants:readonly Readonly<{id:string;state:"reserved"|"started"|"complete"}>[];
 readonly unreconciledParticipants:readonly string[];
}
