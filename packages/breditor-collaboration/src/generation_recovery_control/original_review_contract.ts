/** Fresh authenticated original acceptance DATA, not a reusable role or writer grant. */
import type {SharedServerLogGenerationRecoveryControlSelection} from './contract.js';
export interface GenerationOriginalReviewRange {readonly actor:string;readonly principal:string;readonly from:string;readonly through:string}
export interface GenerationOriginalReviewQuery {readonly binding:string;readonly ranges:readonly GenerationOriginalReviewRange[]}
export interface GenerationOriginalReviewWindow {readonly source:Readonly<{actor:string;principal:string;role:'comment'|'moderator'}>;readonly from:string;readonly through:string;readonly prefixDigest:string}
export interface GenerationOriginalReviewPending {readonly range:GenerationOriginalReviewRange;readonly acceptedThrough:string;readonly reason:'unknownActor'|'observer'|'unaccepted'}
export interface GenerationOriginalReviewAuthorizations {
 readonly format:'breditor/relay-review-original-authorizations';readonly formatVersion:1;
 readonly descriptor:Readonly<{format:'breditor/relay-review';formatVersion:1;binding:string}>;
 readonly ranges:readonly GenerationOriginalReviewRange[];readonly kind:'covered'|'pending';
 readonly windows:readonly GenerationOriginalReviewWindow[];readonly pending:readonly GenerationOriginalReviewPending[];
}
export interface GenerationOriginalReviewRead {
 readonly format:'breditor/server-log-generation-review-original-authorizations-read';readonly formatVersion:1;
 readonly selection:SharedServerLogGenerationRecoveryControlSelection;readonly requestSha256:string;
 readonly scope:'selected-server-original-review-acceptance';readonly authorizations:GenerationOriginalReviewAuthorizations;
}
export const MAX_GENERATION_ORIGINAL_REVIEW_RESPONSE_BYTES=8*1024*1024;
