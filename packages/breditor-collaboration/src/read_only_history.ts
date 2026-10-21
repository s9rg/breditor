/** Separate non-authoring archive capability; a serialized role or old observer marker cannot select it. */
export interface SharedReadOnlyHistoryRustCapability {
 read_only_history_lifecycle_version?():string;
 enable_read_only_segmented_history?(observation:unknown,root:string,active:string):void;
 seal_read_only_history_segment?(observation:unknown,next:string):void;
}
