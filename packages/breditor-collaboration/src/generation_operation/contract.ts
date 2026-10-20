import type {SharedSelectionPolicy} from "../types.js";
import type {RecoveredSharedGenerationParticipant,RecoveredSharedGenerationParticipantParts} from "../generation_participant/recovery.js";
import type {SharedGenerationParticipantSelection} from "../generation_participant/contract.js";
import type {SharedGenerationParticipantResumeOptions} from "../generation_participant/recovery_contract.js";
/** Publish durable operational intent before transferring genuine completed recovery custody. */
export interface SharedGenerationOperationBeginOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>{readonly database:string;readonly recovered:RecoveredSharedGenerationParticipant<P>;readonly expected:SharedGenerationParticipantSelection;readonly checkAuthority:()=>void;readonly signal?:AbortSignal}
/** Factories and current read-only/review policy are supplied afresh, never selected by a file. */
export interface SharedGenerationOperationResumeOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends Omit<SharedGenerationParticipantResumeOptions<P>,"database">{readonly database:string;readonly recoveryDatabase:string}
export type OperationalSharedGenerationParticipantParts<P extends SharedSelectionPolicy=SharedSelectionPolicy>=RecoveredSharedGenerationParticipantParts<P>;
export interface SharedGenerationOperationProgress{readonly phase:"prepared"|"operational"}
