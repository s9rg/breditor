/** Immutable complete declared recovery files. Retention and prefix diagnostics are not activation. */
import type {SharedArchiveIntegrityOptions} from "../archive_integrity/contract.js";
import type {SharedServerLogGenerationRoomBackupIdentity} from "../server_generation_archive/contract.js";
import type {SharedServerLogGenerationParticipantIdentity,SharedServerLogGenerationParticipantCoverage} from "../server_generation_inventory/contract.js";
import type {SharedRoomRecoveryCatalogV2Entry,SharedRoomRecoveryCatalogV2Input} from "../room_recovery_catalog_v2/contract.js";
import type {SharedAssetReferenceCapture} from "../asset_references_capture.js";
import type {SharedGenerationSourceCapture} from "../generation_source/capture.js";
import type {SharedPhysicalRoomRecoveryCatalogArchive} from "./archive.js";
export interface SharedPhysicalRoomRecoveryCatalogSelection {readonly catalog:string;readonly sha256:string}
export interface SharedPhysicalRoomRecoveryCatalogMetadata {
 readonly format:"breditor/shared-physical-room-recovery-catalog";readonly formatVersion:1;readonly catalog:string;
 /** Original recovery source is retained as a complete independently selected file, not replaced. */
 readonly origin:Readonly<{identity:SharedServerLogGenerationRoomBackupIdentity;bytes:number}>;
 readonly current:Readonly<{server:Readonly<{identity:SharedServerLogGenerationRoomBackupIdentity;bytes:number}>;participants:Readonly<{identity:SharedServerLogGenerationParticipantIdentity;bytes:number}>}>;
 /** Every supplied original/generation copy remains retained; no implicit writer choice or GC. */
 readonly participants:readonly SharedRoomRecoveryCatalogV2Entry[];
}
export interface SharedPhysicalRoomRecoveryCatalogCaptureOptions extends SharedArchiveIntegrityOptions {
 readonly catalog:string;
 readonly origin:Readonly<{file:Blob;expected:SharedServerLogGenerationRoomBackupIdentity}>;
 readonly current:Readonly<{server:Readonly<{file:Blob;expected:SharedServerLogGenerationRoomBackupIdentity}>;participants:Readonly<{file:Blob;expected:SharedServerLogGenerationParticipantIdentity}>}>;
 readonly participants:readonly SharedRoomRecoveryCatalogV2Input[];
}
export type SharedPhysicalRoomRecoveryCatalogSource=
 |Readonly<{id:string;family:"original";source:SharedAssetReferenceCapture}>
 |Readonly<{id:string;family:"generation";source:SharedGenerationSourceCapture}>;
export interface SharedPhysicalRoomRecoveryCatalogCheck extends SharedServerLogGenerationParticipantCoverage {
 readonly kind:"checked"|"pending";readonly selectedParticipants:readonly string[];readonly unreconciledParticipants:readonly string[];
}
export interface SharedPhysicalRoomRecoveryCatalogOpenOptions extends SharedArchiveIntegrityOptions {readonly database:string;readonly expected:SharedPhysicalRoomRecoveryCatalogSelection}
export interface SharedPhysicalRoomRecoveryCatalogBeginOptions extends SharedPhysicalRoomRecoveryCatalogOpenOptions {readonly archive:SharedPhysicalRoomRecoveryCatalogArchive}
