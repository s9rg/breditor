/** Separate physical server selection. Detached JSON never proves current
 * account authority, native replay, credential continuity or activation. */
import type {SharedRoomBackupCut,SharedRoomParticipantInventoryMetadata,SharedRoomParticipantCoverage,SharedRoomParticipantSource,SharedRoomGenerationParticipantSource} from "../room_participant_inventory/types.js";
export interface SharedServerLogGenerationBackupIdentity {
 /** Native global cut across the explicitly selected physical files, not a standalone log. */
 readonly source:SharedRoomBackupCut;
 readonly manifest:readonly number[];
 readonly archiveSha256:readonly number[];
}
export interface SharedServerLogGenerationParticipantIdentity {
 readonly source:SharedServerLogGenerationBackupIdentity;
 readonly sha256:readonly number[];
}
export interface SharedServerLogGenerationParticipantMetadata {
 readonly format:"breditor/server-log-generation-participants";
 readonly formatVersion:1;
 readonly source:SharedServerLogGenerationBackupIdentity;
 /** Unchanged closed native declarations; the outer family supplies the storage meaning. */
 readonly native:SharedRoomParticipantInventoryMetadata;
}
/** Pure client-prefix diagnostics pinned to the entire physical source. Neither
 * metadata admission nor a covered result proves authenticated room readiness. */
export interface SharedServerLogGenerationParticipantCoverage {
 readonly source:SharedServerLogGenerationBackupIdentity;
 readonly coverage:SharedRoomParticipantCoverage;
}
/** Explicit client file families in one diagnostic cohort. Duplicate original or
 * generation copies remain unresolved; the reader never chooses or discards one. */
export type SharedServerLogGenerationParticipantSource=
 |Readonly<{family:"original"}&SharedRoomParticipantSource>
 |Readonly<{family:"generation"}&SharedRoomGenerationParticipantSource>;
