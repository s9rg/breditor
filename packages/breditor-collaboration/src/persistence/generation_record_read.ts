/** Read-only data discovery, not native replay, author custody or room activation. */
import {SharedEditorError} from '../core.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {SegmentedStoredCut,SegmentedCut,SegmentedReview} from './segmented_contract.js';
type Immutable<T>=T extends readonly(infer V)[]?readonly Immutable<V>[]:T extends object?{readonly[K in keyof T]:Immutable<T[K]>}:T;
/** Exact complete in-memory capture. Companion JSON belongs to the selected
 * private family, not to separately acknowledged child stores. */
export interface GenerationRecordCapture{
 readonly checkpoint:string;readonly review:Immutable<SegmentedReview>|null;readonly versions:readonly string[];
 readonly documentRevision:string;readonly reviewRevision:string|null;readonly companion:string|null;
}
export interface GenerationRecordMetadata{
 readonly format:'breditor/persistent-generation-record-read';readonly formatVersion:1;
 readonly scope:'atomic-generation-committed-attempt-pending-live';
 readonly committed:Immutable<SegmentedStoredCut>;
 readonly attempt:Readonly<{capture:GenerationRecordCapture;cut:Immutable<SegmentedCut>|null}>|null;
 readonly pending:GenerationRecordCapture|null;readonly live:GenerationRecordCapture;
}
interface Callbacks{check():void;current():void;verify():Promise<void>;release():void}
const key=Object.freeze({}),fail=(suffix:string)=>new SharedEditorError('generation_record_read_'+suffix,'Use the actual generation source and current independent read permission');
let create:(metadata:GenerationRecordMetadata,callbacks:Callbacks)=>GenerationRecordRead;
export class GenerationRecordRead{
 readonly #metadata:GenerationRecordMetadata;#callbacks:Callbacks|undefined;#closed=false;#checking=false;#verifying=false;
 private constructor(token:object,metadata:GenerationRecordMetadata,callbacks:Callbacks){if(token!==key)throw fail('source');this.#metadata=frozen(structuredClone(metadata));this.#callbacks=callbacks;Object.freeze(this);}
 metadata(){return this.#metadata;}
 check():void{if(this.#closed)throw fail('closed');if(this.#checking)throw fail('busy');this.#checking=true;try{this.#callbacks!.check();if(this.#closed)throw fail('closed');}finally{this.#checking=false;}}
 checkCurrent():void{if(this.#closed)throw fail('closed');this.#callbacks!.current();if(this.#closed)throw fail('closed');}
 async verify():Promise<void>{if(this.#closed)throw fail('closed');if(this.#verifying)throw fail('busy');this.#verifying=true;try{check.call(this);await this.#callbacks!.verify();check.call(this);}finally{this.#verifying=false;}}
 dispose():void{if(this.#closed)return;this.#closed=true;const callbacks=this.#callbacks;this.#callbacks=undefined;callbacks?.release();}
 static{create=(metadata,callbacks)=>new GenerationRecordRead(key,metadata,callbacks);}
}
const check=GenerationRecordRead.prototype.check;
/** Trusted internal wrapper; no incoming API accepts a handle as source custody. */
export function createGenerationRecordRead(metadata:GenerationRecordMetadata,callbacks:Callbacks){return create(metadata,callbacks);}
