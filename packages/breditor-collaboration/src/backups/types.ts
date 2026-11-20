import type {SharedHistoryPolicy,SharedRangePolicy,SharedSelectionPolicy} from "../types.js";
/** Explicit expected source. A file never selects a native/profile/recovery family for its caller. */
export interface SharedBackupIdentity {
 room:string;writer:string;richLanguage:1|2|3|4;history:SharedHistoryPolicy;
 rangeEditing:SharedRangePolicy;selectionEditing:SharedSelectionPolicy;searchHistory:"search-v1"|null;
}
export interface SharedSessionBackup {
 readonly format:"breditor/shared-session-backup";readonly formatVersion:1;
 readonly identity:Readonly<SharedBackupIdentity>;readonly checkpointJson:string;readonly sha256:string;
}
/** Same-origin exclusion is enforced here; cross-device/server fencing is a host responsibility. */
export interface SharedBackupRecovery {backupJson:string;writerRecovery:"host-reacquired"}
