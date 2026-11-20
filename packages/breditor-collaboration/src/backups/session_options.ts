import type {SharedSessionOptions,SharedDocumentSessionOptions,SharedSearchSessionOptions} from "../persistence/shared_session.js";
import type {SharedHistoryPolicy,SharedRangePolicy,SharedSelectionPolicy} from "../types.js";
import type {SharedBackupRecovery} from "./types.js";
export interface SharedSessionBackupOptions extends Omit<SharedSessionOptions,"create"|"richLanguage"|"history"|"rangeEditing">,SharedBackupRecovery {richLanguage:1|2|3|4;history:SharedHistoryPolicy;rangeEditing:SharedRangePolicy}
export interface SharedDocumentBackupOptions extends Omit<SharedDocumentSessionOptions,"create"|"restore"|"richLanguage"|"history"|"rangeEditing">,SharedBackupRecovery {richLanguage:1|2|3|4;history:SharedHistoryPolicy;rangeEditing:"general-v1"}
export interface SharedSearchBackupOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends Omit<SharedSearchSessionOptions<P>,"create">,SharedBackupRecovery {}
