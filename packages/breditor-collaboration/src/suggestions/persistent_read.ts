/** Internal read handle. Global class methods must not keep the owner's factory
 * lexical environment alive when a disposed diagnostic report is retained. No
 * coordinator accepts a caller-supplied handle as source/activation authority. */
import {SharedRelayError} from '../relay/validation.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {PersistentSuggestionRead,PersistentSuggestionRecords} from './persistent_read_contract.js';
interface Callbacks{check():void;current():void;verify():Promise<void>;release():void}
const key=Object.freeze({}),fail=(suffix:string)=>new SharedRelayError('suggestion_persistent_read_'+suffix);
let create:(metadata:PersistentSuggestionRecords,callbacks:Callbacks)=>OriginalPersistentSuggestionRead;
export class OriginalPersistentSuggestionRead implements PersistentSuggestionRead{
 readonly #metadata:PersistentSuggestionRecords;#callbacks:Callbacks|undefined;#closed=false;#checking=false;#verifying=false;
 private constructor(token:object,metadata:PersistentSuggestionRecords,callbacks:Callbacks){if(token!==key)throw fail('source');this.#metadata=frozen(structuredClone(metadata));this.#callbacks=callbacks;Object.freeze(this);}
 metadata(){return this.#metadata;}
 check():void{if(this.#closed)throw fail('closed');if(this.#checking)throw fail('busy');this.#checking=true;try{this.#callbacks!.check();if(this.#closed)throw fail('closed');}finally{this.#checking=false;}}
 checkCurrent():void{if(this.#closed)throw fail('closed');this.#callbacks!.current();if(this.#closed)throw fail('closed');}
 async verify():Promise<void>{if(this.#closed)throw fail('closed');if(this.#verifying)throw fail('busy');this.#verifying=true;try{check.call(this);await this.#callbacks!.verify();check.call(this);}finally{this.#verifying=false;}}
 dispose():void{if(this.#closed)return;this.#closed=true;const callbacks=this.#callbacks;this.#callbacks=undefined;callbacks?.release();}
 static{create=(metadata,callbacks)=>new OriginalPersistentSuggestionRead(key,metadata,callbacks);}
}
const check=OriginalPersistentSuggestionRead.prototype.check;
/** Trusted implementation helper only. Genuine queue brand admission remains
 * in its owner module; this data wrapper is never an incoming source option. */
export function createPersistentSuggestionRead(metadata:PersistentSuggestionRecords,callbacks:Callbacks){return create(metadata,callbacks);}
