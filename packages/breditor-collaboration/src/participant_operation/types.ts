import type {RecoveredSharedParticipant,RecoveredSharedParticipantParts} from "../participant_recovery/recovery.js";
import type {SharedParticipantRecoveryOptions} from "../participant_recovery/types.js";
import type {SharedParticipantBackupSelection} from "../participant_backup/types.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedReviewAccess} from "../review_types.js";
export interface SharedParticipantOperationCurrentPolicy{readonly documentReadOnly:boolean;readonly reviewAccess:SharedReviewAccess|null}
/** Begin transfers genuine completed custody; it never selects a source from stored metadata. */
export interface SharedParticipantOperationBeginOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly database:string;readonly recovered:RecoveredSharedParticipant<P>;readonly expected:SharedParticipantBackupSelection;
 readonly checkAuthority:()=>void;readonly signal?:AbortSignal;
}
/** Retained bytes do not select factories, credentials, current policy or destination names. */
export interface SharedParticipantOperationResumeOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends Omit<SharedParticipantRecoveryOptions<P>,"database"|"backup">{
 readonly database:string;readonly recoveryDatabase:string;
 /** Fresh host permissions are separate from the pinned historical recovery plan. */
 readonly currentPolicy:SharedParticipantOperationCurrentPolicy;
}
export type OperationalSharedParticipantParts<P extends SharedSelectionPolicy=SharedSelectionPolicy>=RecoveredSharedParticipantParts<P>;
export interface SharedParticipantOperationProgress{readonly phase:"prepared"|"operational"}
