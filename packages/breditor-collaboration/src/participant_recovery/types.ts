import type {SharedSelectionPolicy} from "../types.js";
import type {SharedParticipantBackup} from "../participant_backup/archive.js";
import type {SharedParticipantBackupSelection} from "../participant_backup/types.js";
import type {SharedSessionBackupOptions,SharedDocumentBackupOptions,SharedSearchBackupOptions} from "../backups/session_options.js";
import type {SharedReviewBackupOptions,SharedReviewedReviewBackupOptions,SharedSearchReviewBackupOptions} from "../backups/review_options.js";
import type {SharedSuggestionQueueIdentity} from "../suggestions/types.js";
import type {SharedDocumentVersionsIdentity} from "../versions/types.js";
import type {SharedSuggestionTransport} from "../suggestions/transport_port.js";
import type {AssetLimits} from "@breditor/experimental-rich-content";
type FactoryOptions<T>=Omit<T,"database"|"backupJson"|"writerRecovery"|"signal">;
/** Native admission is selected by the host, never by incoming checkpoint metadata. */
export type SharedParticipantRecoverySession<P extends SharedSelectionPolicy=SharedSelectionPolicy>=
 |(P extends "original"?Readonly<{kind:"document";options:FactoryOptions<SharedSessionBackupOptions>}>:never)
 |(P extends "document-v1"?Readonly<{kind:"document-selection";options:FactoryOptions<SharedDocumentBackupOptions>}>:never)
 |Readonly<{kind:"search-document";options:FactoryOptions<SharedSearchBackupOptions<P>>}>
 |Readonly<{kind:"paired";options:FactoryOptions<SharedReviewBackupOptions<P>>}>
 |Readonly<{kind:"reviewed-paired";options:FactoryOptions<SharedReviewedReviewBackupOptions<P>>}>
 |Readonly<{kind:"search-paired";options:FactoryOptions<SharedSearchReviewBackupOptions<P>>}>;
export interface SharedParticipantRecoveryDestinations {
 readonly document:string;readonly uploads:string;
 readonly suggestions?:string;readonly revisions?:string;readonly versions?:string;
}
export interface SharedParticipantRecoveryOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 /** Dedicated new attempt database. Resume needs this exact name and the trusted selection. */
 readonly database:string;readonly backup:SharedParticipantBackup;readonly expected:SharedParticipantBackupSelection;
 readonly destinations:SharedParticipantRecoveryDestinations;
 readonly session:SharedParticipantRecoverySession<P>;
 readonly suggestions?:Readonly<{identity:SharedSuggestionQueueIdentity;ownedHistory?:"reviewed-v1"}>;
 readonly revisions?:Readonly<{binding:string;transport:SharedSuggestionTransport<P>}>;
 readonly versions?:Readonly<{identity:SharedDocumentVersionsIdentity;getToken:(signal:AbortSignal)=>string|Promise<string>}>;
 readonly limits?:Partial<AssetLimits>;
 /** The host fences original owners and reacquires authority; this is not a portable credential. */
 readonly checkAuthority:()=>void;readonly signal?:AbortSignal;
}
export type SharedParticipantRecoveryStep="document"|"suggestions"|"revisions"|"versions"|"uploads";
export interface SharedParticipantRecoveryProgress {
 readonly phase:"preparing"|"ready";
 readonly steps:readonly Readonly<{step:SharedParticipantRecoveryStep;state:"reserved"|"started"|"complete"}>[];
}
