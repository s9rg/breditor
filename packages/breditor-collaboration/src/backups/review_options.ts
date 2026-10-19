import type {SharedReviewSessionOptions,SharedReviewedReviewSessionOptions,SharedSearchReviewSessionOptions} from "../persistence/review_session.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedBackupRecovery} from "./types.js";
export interface SharedReviewBackupOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends Omit<SharedReviewSessionOptions<P>,"create">,SharedBackupRecovery {}
export interface SharedReviewedReviewBackupOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends Omit<SharedReviewedReviewSessionOptions<P>,"create">,SharedBackupRecovery {}
export interface SharedSearchReviewBackupOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends Omit<SharedSearchReviewSessionOptions<P>,"create">,SharedBackupRecovery {}
