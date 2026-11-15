import type {SharedArchiveFileDigest, SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import type {SharedReviewGuard, SharedReviewId, SharedReviewOutcome, SharedReviewTarget, SharedReviewThread, SharedReviewThreadHistoryEntry} from '../review_types.js';
import type {SharedWriterClock} from '../types.js';
import type {SharedRecoveredBranchReviewOptions} from './review_contract.js';
import type {SharedRecoveredBranchReviewIntent} from './review_contract.js';

export interface SharedRecoveredDiscussionOptions extends SharedRecoveredBranchReviewOptions {
  readonly thread: SharedReviewId;
  readonly target: SharedIndependentDeliverySession;
  readonly guard: SharedReviewGuard;
  readonly anchor: SharedReviewTarget;
  /** The current account's own new live discussion message. */
  readonly body: string;
}

export interface SharedRecoveredDiscussionAttachment {
  readonly format: 'breditor/recovered-discussion';
  readonly formatVersion: 1;
  readonly room: Readonly<{endpoint: string; room: string; binding: string}>;
  readonly seed: SharedWriterClock;
  readonly original: Readonly<{archiveSha256: string; birthDigest: string}>;
  readonly link: Readonly<{id: SharedReviewId; principal: string; digest: string}>;
  readonly thread: SharedReviewThread;
  readonly events: readonly SharedReviewThreadHistoryEntry[];
}

export interface SharedPreparedRecoveredDiscussion {
  readonly file: Blob;
  readonly selection: SharedArchiveFileDigest;
  /** Retain this with the chosen file and current destination before commit. */
  readonly intent: SharedRecoveredBranchReviewIntent;
  commit(): SharedReviewOutcome;
}

export interface SharedRecoveredDiscussionReadOptions extends SharedArchiveIntegrityOptions {
  readonly target: SharedIndependentDeliverySession;
}
