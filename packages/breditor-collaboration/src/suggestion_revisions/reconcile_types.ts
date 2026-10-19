/** Local outbox retention only; counts confer no acceptance or publication authority. */
export interface SharedRetainedRevisionsRecoveryResult {
 readonly added:number;readonly updated:number;readonly unchanged:number;readonly retained:number;
 readonly queued:number;readonly receipts:number;readonly conflicts:number;
}
