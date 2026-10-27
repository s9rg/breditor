import type{SharedReviewPolicy}from'./review_types.js';
/** Independently authenticated ORIGINAL rights over an exact peer event prefix.
 * These are host input DATA, not credentials or an executable room grant. Never
 * derive source/access/prefixDigest from an untrusted checkpoint alone. */
export interface SharedNativeBranchUnionAuthorization{
 readonly source:Readonly<SharedReviewPolicy>;
 /** Inclusive positive native event counters, always canonical decimal strings. */
 readonly from:string;readonly through:string;
 /** Authenticated source actor prefix at through, including account and document binding. */
 readonly prefixDigest:string;
}
/** One atomic in-memory native publication, not durable save/ACK or activation. */
export interface SharedNativeBranchUnionOutcome{
 readonly documentChanged:boolean;readonly reviewChanged:boolean;
}
