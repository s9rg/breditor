/** Separate native comment retention. Neither document generations nor transport imply this family. */
export type SharedReviewHistoryPolicy="original"|"segmented-v1"|"continued-v2";
/** Optional complete capability; callers cannot approximate absent native methods in JavaScript. */
export interface SharedReviewGenerationRustCapability {
 review_history_generation_version?():string;
 review_history_family?():string;
 enable_review_history_generations?(observation:unknown,root:string,active:string):void;
 seal_review_history_generation?(observation:unknown,next:string):void;
 enable_observer_review_history_generations?(observation:unknown,root:string,active:string):void;
 seal_observer_review_history_generation?(observation:unknown,next:string):void;
 enable_segmented_review?(observation:unknown,hostPolicy:string,checkpoint:string):void;
 review_segmented_checkpoint?(observation:unknown):string;
}
/** Former-author read-only archival is distinct from the strict zero-authored observer lifecycle. */
export interface SharedReadOnlyReviewHistoryRustCapability {
 read_only_review_history_lifecycle_version?():string;
 enable_read_only_review_history_generations?(observation:unknown,root:string,active:string):void;
 seal_read_only_review_history_generation?(observation:unknown,next:string):void;
}

/** Explicit continuation requires native admission, author and read-only transitions, and exact recovery. */
export interface SharedContinuedReviewHistoryRustCapability {
 continued_review_history_version?():string;
 continue_review_history?(observation:unknown,next:string):void;
 continue_read_only_review_history?(observation:unknown,next:string):void;
 enable_continued_review?(observation:unknown,hostPolicy:string,checkpoint:string):void;
 review_continued_checkpoint?(observation:unknown):string;
}
