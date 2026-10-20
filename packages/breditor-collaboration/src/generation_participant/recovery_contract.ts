import type {SharedSelectionPolicy} from "../types.js";
import type {SharedSegmentedRecoveryOptions,SharedSegmentedPersistentSession} from "../persistence/segmented_session.js";
import type {SharedSegmentedRelayRecoveryOptions} from "../segmented_relay/contract.js";
import type {SharedSegmentedRetainedRecoveryOptions} from "../segmented_relay/retained_contract.js";
import type {SharedSegmentedRelaySession} from "../segmented_relay/session.js";
import type {SharedGenerationParticipantOptions,SharedGenerationParticipantSelection} from "./contract.js";
import type {SharedGenerationParticipantBackup} from "./backup.js";
type Factory<T>=Omit<T,"database"|"recovery"|"writerRecovery">;
export type SharedGenerationRecoveryFactory<P extends SharedSelectionPolicy=SharedSelectionPolicy>=
 |Readonly<{kind:"local";options:Factory<SharedSegmentedRecoveryOptions<P>>}>
 |Readonly<{kind:"relay";options:Factory<SharedSegmentedRelayRecoveryOptions<P>>}>
 |Readonly<{kind:"retained";options:Factory<SharedSegmentedRetainedRecoveryOptions<P>>}>;
export type SharedGenerationRecoverySession<P extends SharedSelectionPolicy=SharedSelectionPolicy>=SharedSegmentedPersistentSession<P>|SharedSegmentedRelaySession<P>;
export interface SharedGenerationParticipantResumeOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends SharedGenerationParticipantOptions{
 readonly database:string;readonly expected:SharedGenerationParticipantSelection;
 readonly destinations:Readonly<{source:string;uploads:string}>;readonly session:SharedGenerationRecoveryFactory<P>;
 /** Required current synchronous host check; no account, provider or cross-device grant is restored. */
 readonly checkAuthority:()=>void;
}
export interface SharedGenerationParticipantRecoveryOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends SharedGenerationParticipantResumeOptions<P>{readonly backup:SharedGenerationParticipantBackup}
export interface SharedGenerationParticipantRecoveryProgress{readonly phase:"preparing"|"ready";readonly source:"reserved"|"started"|"complete";readonly uploads:"reserved"|"started"|"complete"}
