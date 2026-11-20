/** Detached original-store discovery. No incoming API accepts these reports as
 * native ancestry, source custody, server authority or permission to activate. */
import {SharedEditorError} from '../core.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {SharedHistoryPolicy,SharedRangePolicy,SharedSelectionPolicy} from '../types.js';
import type {SharedVersionCatalogRecord} from '../versions/types.js';
import type {SharedSuggestionRevisionsRecord} from '../suggestion_revisions/types.js';
import type {PersistentSuggestionRecords} from '../suggestions/persistent_read_contract.js';
type Immutable<T>=T extends readonly(infer V)[]?readonly Immutable<V>[]:T extends object?{readonly[K in keyof T]:Immutable<T[K]>}:T;
export interface OriginalNativeRecords{
 readonly format:'breditor/persistent-original-native-record-read';readonly formatVersion:1;
 readonly scope:'original-native-committed-pending-live';
 readonly identity:Readonly<{room:string;writer:string;richLanguage:1|2|3|4;history:SharedHistoryPolicy;rangeEditing:SharedRangePolicy;selectionEditing:SharedSelectionPolicy;searchHistory:'search-v1'|null}>;
 readonly committed:Readonly<{checkpoint:string;storageFamily:'original'|'typing-v1'|'general-v1'|'document-v1'|'search-v1'}>;
 readonly pending:Readonly<{checkpoint:string;revision:string}>|null;
 readonly live:Readonly<{checkpoint:string;revision:string}>;
}
export interface OriginalVersionRecords{
 readonly format:'breditor/persistent-original-version-record-read';readonly formatVersion:1;
 readonly scope:'original-version-committed-pending-live';
 readonly committed:Immutable<SharedVersionCatalogRecord>;readonly pending:Immutable<SharedVersionCatalogRecord>|null;readonly live:Immutable<SharedVersionCatalogRecord>;
}
export interface OriginalRevisionRecords{
 readonly format:'breditor/persistent-original-revision-record-read';readonly formatVersion:1;
 readonly scope:'original-revision-and-queue-committed-pending-live';
 readonly committed:Immutable<SharedSuggestionRevisionsRecord>;readonly pending:Immutable<SharedSuggestionRevisionsRecord>|null;readonly live:Immutable<SharedSuggestionRevisionsRecord>;
 /** The one genuine base-queue reservation is owned by this read. */
 readonly queue:PersistentSuggestionRecords;
}
export type OriginalRecordMetadata=OriginalNativeRecords|OriginalVersionRecords|OriginalRevisionRecords;
interface Callbacks{check():void;current():void;verify():Promise<void>;release():void}
const key=Object.freeze({}),fail=(suffix:string)=>new SharedEditorError('original_record_read_'+suffix,'Use the genuine selected original source and current independent read permission');
let create:<M extends OriginalRecordMetadata>(metadata:M,callbacks:Callbacks)=>OriginalRecordRead<M>;
/** A global class deliberately does not retain the async source-factory scope.
 * Disposal clears every producer/authorization link while metadata stays usable. */
export class OriginalRecordRead<M extends OriginalRecordMetadata>{
 readonly #metadata:M;#callbacks:Callbacks|undefined;#closed=false;#checking=false;#verifying=false;
 private constructor(token:object,metadata:M,callbacks:Callbacks){if(token!==key)throw fail('source');this.#metadata=frozen(structuredClone(metadata));this.#callbacks=callbacks;Object.freeze(this);}
 metadata():M{return this.#metadata;}
 check():void{if(this.#closed)throw fail('closed');if(this.#checking)throw fail('busy');this.#checking=true;try{this.#callbacks!.check();if(this.#closed)throw fail('closed');}finally{this.#checking=false;}}
 checkCurrent():void{if(this.#closed)throw fail('closed');this.#callbacks!.current();if(this.#closed)throw fail('closed');}
 async verify():Promise<void>{if(this.#closed)throw fail('closed');if(this.#verifying)throw fail('busy');this.#verifying=true;try{check.call(this);await this.#callbacks!.verify();check.call(this);}finally{this.#verifying=false;}}
 dispose():void{if(this.#closed)return;this.#closed=true;const callbacks=this.#callbacks;this.#callbacks=undefined;callbacks?.release();}
 static{create=(metadata,callbacks)=>new OriginalRecordRead(key,metadata,callbacks);}
}
const check=OriginalRecordRead.prototype.check;
/** Internal data wrapper only. Actual source admission stays in each owner. */
export function createOriginalRecordRead<M extends OriginalRecordMetadata>(metadata:M,callbacks:Callbacks){return create(metadata,callbacks);}
