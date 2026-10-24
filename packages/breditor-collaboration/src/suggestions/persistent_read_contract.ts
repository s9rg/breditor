/** Exact original-store records, not native continuity or current server rights.
 * A coordinator calls the genuine owner reader itself; it never accepts one of
 * these data reports or structural handles as an admission capability. */
import type {SharedSuggestionQueueRecord} from './types.js';
type ImmutableSuggestionValue<T>=T extends readonly(infer V)[]?readonly ImmutableSuggestionValue<V>[]:T extends object?{readonly[K in keyof T]:ImmutableSuggestionValue<T[K]>}:T;
export type PersistentSuggestionRecord=ImmutableSuggestionValue<SharedSuggestionQueueRecord>;
export interface PersistentSuggestionRecords{
 readonly format:'breditor/persistent-suggestion-record-read';readonly formatVersion:1;
 readonly scope:'original-store-committed-pending-live';
 readonly committed:PersistentSuggestionRecord;
 readonly pending:PersistentSuggestionRecord|null;
 readonly live:PersistentSuggestionRecord;
}
export interface PersistentSuggestionRead{
 metadata():PersistentSuggestionRecords;
 check():void;
 /** Re-admit the actual original database row, not only cached saved flags. */
 verify():Promise<void>;
 /** SDK-owned storage/source/lease/cancellation checks, without host callbacks. */
 checkCurrent():void;
 dispose():void;
}
