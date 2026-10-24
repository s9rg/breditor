/** Original paired record discovery. These data snapshots do not prove native
 * ancestry or grant server/author rights. No incoming API accepts this handle
 * as custody; the genuine source reader must be called by a coordinator. */
import {SharedEditorError} from '../core.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {SharedPairedCheckpointRecord} from './review_session.js';
type ImmutablePairedValue<T>=T extends readonly(infer V)[]?readonly ImmutablePairedValue<V>[]:T extends object?{readonly[K in keyof T]:ImmutablePairedValue<T[K]>}:T;
export type PersistentPairedRecord=ImmutablePairedValue<SharedPairedCheckpointRecord>;
export interface PersistentPairedMetadata{
 readonly format:'breditor/persistent-paired-record-read';readonly formatVersion:1;
 readonly scope:'original-paired-committed-pending-live';
 readonly committed:PersistentPairedRecord;readonly pending:PersistentPairedRecord|null;readonly live:PersistentPairedRecord;
}
interface Callbacks{check():void;current():void;verify():Promise<void>;release():void}
const key=Object.freeze({}),fail=(suffix:string)=>new SharedEditorError('paired_record_read_'+suffix,'Use the genuine original paired source and current independent read permission');
let create:(metadata:PersistentPairedMetadata,callbacks:Callbacks)=>OriginalPairedRecordRead;
export class OriginalPairedRecordRead{
 readonly #metadata:PersistentPairedMetadata;#callbacks:Callbacks|undefined;#closed=false;#checking=false;#verifying=false;
 private constructor(token:object,metadata:PersistentPairedMetadata,callbacks:Callbacks){if(token!==key)throw fail('source');this.#metadata=frozen(structuredClone(metadata));this.#callbacks=callbacks;Object.freeze(this);}
 metadata(){return this.#metadata;}
 check():void{if(this.#closed)throw fail('closed');if(this.#checking)throw fail('busy');this.#checking=true;try{this.#callbacks!.check();if(this.#closed)throw fail('closed');}finally{this.#checking=false;}}
 checkCurrent():void{if(this.#closed)throw fail('closed');this.#callbacks!.current();if(this.#closed)throw fail('closed');}
 async verify():Promise<void>{if(this.#closed)throw fail('closed');if(this.#verifying)throw fail('busy');this.#verifying=true;try{check.call(this);await this.#callbacks!.verify();check.call(this);}finally{this.#verifying=false;}}
 dispose():void{if(this.#closed)return;this.#closed=true;const callbacks=this.#callbacks;this.#callbacks=undefined;callbacks?.release();}
 static{create=(metadata,callbacks)=>new OriginalPairedRecordRead(key,metadata,callbacks);}
}
const check=OriginalPairedRecordRead.prototype.check;
/** Trusted data wrapper; actual private-field source admission lives with the
 * source owner. This factory is never a caller-supplied source option. */
export function createPairedRecordRead(metadata:PersistentPairedMetadata,callbacks:Callbacks){return create(metadata,callbacks);}
