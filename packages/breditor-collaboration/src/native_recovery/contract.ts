/** SDK-private exclusion of actual facades, not native-parent ownership,
 * authentication, persistence, receipt acknowledgement or room activation.
 * Construct only from the genuine coordinator's actual client set. */
import type {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedReviewImportOutcome,SharedReviewPolicy} from '../review_types.js';
export interface NativeRecoveryReservation {
 /** Every exact member remains live, unretired and exclusively reserved. */
 check():void;
 /** Synchronous native admission; never bypass an existing hold or queue.
  * This does not save, authenticate or acknowledge the supplied operations. */
 receiveDocument<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,frame:string):boolean;
 /** Preserve native source-policy and anchor admission. Pending is not an ACK. */
 receiveReview<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,frame:string,verified:SharedReviewPolicy):SharedReviewImportOutcome;
 /** Pure common flag release, idempotent even after a member terminates.
  * Reentrant release during an import refuses; it cannot unlock siblings. */
 close():void;
}
