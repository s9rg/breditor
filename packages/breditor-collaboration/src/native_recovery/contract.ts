/** SDK-private exclusion of actual facades, not native-parent ownership,
 * authentication, persistence, receipt acknowledgement or room activation.
 * Construct only from the genuine coordinator's actual client set. */
import type {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedReviewImportOutcome,SharedReviewPolicy} from '../review_types.js';
import type{SharedNativeBranchUnionAuthorization,SharedNativeBranchUnionOutcome}from'../native_branch_union_types.js';
export interface NativeRecoveryReservation {
 /** Every exact member remains live, unretired and exclusively reserved. */
 check():void;
 /** Synchronous native admission; never bypass an existing hold or queue.
  * This does not save, authenticate or acknowledge the supplied operations. */
 receiveDocument<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,frame:string):boolean;
 /** Retain compatible native document inputs without replacing own history.
  * The source must be a genuine quiescent facade. No comment union, source
  * authentication, persistence, pending-input ACK or generation activation. */
 reconcileDocumentBranch<P extends SharedSelectionPolicy,Q extends SharedSelectionPolicy>(core:SharedRichEditor<P>,source:SharedRichEditor<Q>):boolean;
 /** Atomically retain compatible document AND independently authorized peer
  * comments. Host grants pin original roles to exact authenticated event prefixes.
  * This changes neither packet stores nor source affiliation or serving authority. */
 reconcileNativeBranch<P extends SharedSelectionPolicy,Q extends SharedSelectionPolicy>(core:SharedRichEditor<P>,source:SharedRichEditor<Q>,authorizations:readonly SharedNativeBranchUnionAuthorization[]):SharedNativeBranchUnionOutcome;
 /** Preserve native source-policy and anchor admission. Pending is not an ACK. */
 receiveReview<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,frame:string,verified:SharedReviewPolicy):SharedReviewImportOutcome;
 /** Pure common flag release, idempotent even after a member terminates.
  * Reentrant release during an import refuses; it cannot unlock siblings. */
 close():void;
}
