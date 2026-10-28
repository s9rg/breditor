/** Fresh authenticated original acceptance DATA, not a reusable role or writer grant. */
import type {SharedPhysicalRecoveryControlSelection} from '../physical_recovery_control/contract.js';
export interface OriginalReviewRange {readonly actor:string;readonly principal:string;readonly from:string;readonly through:string}
export interface OriginalReviewQuery {readonly binding:string;readonly ranges:readonly OriginalReviewRange[]}
export interface OriginalReviewWindow {readonly source:Readonly<{actor:string;principal:string;role:'comment'|'moderator'}>;readonly from:string;readonly through:string;readonly prefixDigest:string}
export interface OriginalReviewPending {readonly range:OriginalReviewRange;readonly acceptedThrough:string;readonly reason:'unknownActor'|'observer'|'unaccepted'}
export interface OriginalReviewAuthorizations {
 readonly format:'breditor/relay-review-original-authorizations';readonly formatVersion:1;
 readonly descriptor:Readonly<{format:'breditor/relay-review';formatVersion:1;binding:string}>;
 readonly ranges:readonly OriginalReviewRange[];readonly kind:'covered'|'pending';
 readonly windows:readonly OriginalReviewWindow[];readonly pending:readonly OriginalReviewPending[];
}
export interface OriginalReviewRead {
 readonly format:'breditor/physical-room-review-original-authorizations-read';readonly formatVersion:1;
 readonly selection:SharedPhysicalRecoveryControlSelection;readonly requestSha256:string;
 readonly scope:'selected-server-original-review-acceptance';readonly authorizations:OriginalReviewAuthorizations;
}
export const MAX_ORIGINAL_REVIEW_RESPONSE_BYTES=8*1024*1024;
