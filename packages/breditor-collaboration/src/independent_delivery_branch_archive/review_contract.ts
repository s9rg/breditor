import type {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import type {
  SharedReviewGuard, SharedReviewId, SharedReviewOutcome, SharedReviewTarget, SharedReviewThreadHistoryPage,
} from '../review_types.js';
import type {SharedIndependentDeliveryParticipantSelection} from '../independent_delivery_participant/contract.js';
import type {SharedIndependentDeliveryBranchArchiveReadOptions, SharedIndependentDeliveryBranchFile} from './contract.js';

export interface SharedRecoveredBranchReviewThreadOptions extends SharedIndependentDeliveryBranchArchiveReadOptions {
  readonly source: SharedIndependentDeliveryBranchFile;
  readonly thread: SharedReviewId;
  /** Use the preceding page's nextOffset for the same exact archive and thread. */
  readonly offset?: number;
}

export type SharedRecoveredBranchReviewDestination =
  | {readonly kind: 'new_thread'; readonly target: SharedReviewTarget}
  | {readonly kind: 'reply'; readonly thread: SharedReviewId};

export interface SharedRecoveredBranchReviewEvent {
  readonly thread: SharedReviewId;
  readonly index: number;
  readonly id: SharedReviewId;
  readonly digest: string;
}

export interface SharedRecoveredBranchReviewMessageOptions extends SharedIndependentDeliveryBranchArchiveReadOptions {
  readonly source: SharedIndependentDeliveryBranchFile;
  /** Exact original author and body are verified again by the native archived reader. */
  readonly event: SharedRecoveredBranchReviewEvent;
  readonly target: SharedIndependentDeliverySession;
  readonly guard: SharedReviewGuard;
  readonly destination: SharedRecoveredBranchReviewDestination;
}

export interface SharedRecoveredBranchReviewMessage {
  readonly source: Readonly<{
    selection: SharedIndependentDeliveryParticipantSelection;
    event: SharedRecoveredBranchReviewEvent;
  }>;
  readonly principal: string;
  readonly body: string;
  /** Author one ordinary comment under the exact live owner and its current permissions. */
  commit(): SharedReviewOutcome;
}

export interface SharedRecoveredBranchReviewThread {
  readonly source: SharedIndependentDeliveryParticipantSelection;
  readonly page: SharedReviewThreadHistoryPage;
}
