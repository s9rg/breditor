/** Opaque child reference read. No editable source facade can escape a parent
 * reservation; currentness and actual verification include the held parent. */
import {SharedEditorError} from '../core.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {forgetSourceRecordPayload} from './record_payload.js';
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
export interface ParentReferenceSource{readonly kind:'ready'|'pending';readonly references:readonly RichRetainedAssetReference[]}
export interface ParentReferenceProducer<M extends ParentReferenceSource>{metadata():M;check():void;checkCurrent():void;verify():Promise<void>;dispose():void}
interface Callbacks{check():void;current():void;verify():Promise<void>;release():void}
const token=Object.freeze({}),fail=(suffix:string)=>new SharedEditorError('operational_parent_reference_'+suffix,'Keep the genuine parent and its read-only reference scope alive');
let create:<M extends ParentReferenceSource>(metadata:M,callbacks:Callbacks)=>OperationalParentReferenceRead<M>;
export class OperationalParentReferenceRead<M extends ParentReferenceSource>{
 readonly #metadata:M;#callbacks:Callbacks|undefined;#closed=false;#disposed=false;#disposing=false;#checking=false;#verifying=false;
 private constructor(key:object,metadata:M,callbacks:Callbacks){if(key!==token)throw fail('source');this.#metadata=frozen(structuredClone(metadata));this.#callbacks=callbacks;Object.freeze(this);}
 metadata(){return this.#metadata;}
 check():void{if(this.#closed)throw fail('closed');if(this.#checking)throw fail('busy');this.#checking=true;try{this.#callbacks!.check();if(this.#closed)throw fail('closed');}finally{this.#checking=false;if(this.#closed)dispose.call(this);}}
 checkCurrent():void{if(this.#closed)throw fail('closed');this.#callbacks!.current();if(this.#closed)throw fail('closed');}
 async verify():Promise<void>{if(this.#closed)throw fail('closed');if(this.#verifying)throw fail('busy');this.#verifying=true;try{check.call(this);await this.#callbacks!.verify();check.call(this);}finally{this.#verifying=false;if(this.#closed)dispose.call(this);}}
 /** Retirement is immediate, but failed real release remains retryable. No
  * callback is forgotten before success, including a thrown undefined/false. */
 dispose():void{if(this.#disposed||this.#disposing)return;this.#closed=true;forgetSourceRecordPayload(this);if(this.#checking||this.#verifying)return;this.#disposing=true;try{this.#callbacks?.release();this.#callbacks=undefined;this.#disposed=true;}finally{this.#disposing=false;}}
 static{create=(metadata,callbacks)=>new OperationalParentReferenceRead(token,metadata,callbacks);}
}
const check=OperationalParentReferenceRead.prototype.check,dispose=OperationalParentReferenceRead.prototype.dispose;
/** SDK-owned composition only. Incoming reports never grant source custody. */
export function createParentReferenceRead<M extends ParentReferenceSource>(metadata:M,callbacks:Callbacks){return create(metadata,callbacks);}
