/** Separate native comment retention. Neither document generations nor transport imply this family. */
export type SharedReviewHistoryPolicy="original"|"segmented-v1";
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
