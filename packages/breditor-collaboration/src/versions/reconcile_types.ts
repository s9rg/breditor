/** Detached local-cache counts, never publication or whole-room readiness proof. */
export interface SharedRetainedVersionRecoveryResult {
 readonly added:number;readonly updated:number;readonly unchanged:number;
 readonly retained:number;readonly queued:number;readonly accepted:number;readonly catalogAdvanced:boolean;
}
