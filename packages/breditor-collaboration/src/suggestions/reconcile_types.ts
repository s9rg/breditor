/** Immutable local retention counts; not server finalization or room activation proof. */
export interface SharedRetainedSuggestionsRecoveryResult {
 readonly added:number;readonly updated:number;readonly unchanged:number;readonly retained:number;
 readonly queuedPublications:number;readonly queuedDecisions:number;readonly publications:number;readonly decisions:number;
}
