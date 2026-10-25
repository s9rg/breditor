/** Internal lifecycle for SDK-created fresh parent readers. Incoming APIs must
 * reserve a genuine parent themselves; this report wrapper is not custody.
 * A failed or closed read releases only its read producer and private busy flag. */
import {SharedEditorError} from '../core.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {forwardSourceRecordPayload,forgetSourceRecordPayload} from './record_payload.js';
import type {ParentReferenceSource,ParentReferenceProducer} from './reference_read.js';
import type {RichAssetStore} from '@breditor/experimental-rich-content';
import type {NativeRetentionSource} from './native_retention.js';
interface Callbacks<M extends ParentReferenceSource>{current():void;open():Promise<ParentReferenceProducer<M>>;release():void;cleanupOpening?:()=>void;uploads?:()=>RichAssetStore;native?:()=>NativeRetentionSource}
const key=Object.freeze({}),fail=(kind:string)=>new SharedEditorError('fresh_parent_read_'+kind,'Keep the genuine parent and its independent read reservation alive');
let create:<M extends ParentReferenceSource>(callbacks:Callbacks<M>)=>FreshParentHistoryReservation<M>;
let upload:<M extends ParentReferenceSource>(owner:FreshParentHistoryReservation<M>)=>RichAssetStore;
let native:<M extends ParentReferenceSource>(owner:FreshParentHistoryReservation<M>)=>NativeRetentionSource;
export class FreshParentHistoryReservation<M extends ParentReferenceSource>{
 #callbacks:Callbacks<M>|undefined;#read:ParentReferenceProducer<M>|undefined;#metadata:M|undefined;#working=false;#closed=false;#disposed=false;#closing=false;
 private constructor(token:object,callbacks:Callbacks<M>){if(token!==key)throw fail('source');this.#callbacks=callbacks;Object.freeze(this);}
 metadata():M{if(!this.#metadata)throw fail('not_prepared');return this.#metadata;}
 async prepare():Promise<void>{if(this.#working||this.#closed||this.#metadata)throw fail('busy');this.#working=true;let complete=false;
  try{this.#callbacks!.current();this.#read=await this.#callbacks!.open();if(this.#closed)throw fail('closed');this.#read.check();const metadata=frozen(structuredClone(this.#read.metadata()));this.#callbacks!.current();this.#read.checkCurrent();if(this.#closed)throw fail('closed');this.#metadata=metadata;forwardSourceRecordPayload(this,this.#read,()=>this.checkCurrent());complete=true;}
  finally{this.#working=false;if(!complete||this.#closed)close.call(this);}
 }
 check():void{if(this.#closed||this.#working||!this.#read||!this.#metadata)throw fail('busy');this.#working=true;try{this.#callbacks!.current();this.#read.check();this.#callbacks!.current();this.#read.checkCurrent();if(this.#closed)throw fail('closed');}finally{this.#working=false;if(this.#closed)close.call(this);}}
 /** Before preparation this checks held custody only; afterwards it also fences
  * every source/record pin. Neither form invokes a host grant or signal getter. */
 checkCurrent():void{if(this.#closed)throw fail('closed');this.#callbacks!.current();if(this.#closed)throw fail('closed');this.#read?.checkCurrent();if(this.#closed)throw fail('closed');this.#callbacks!.current();if(this.#closed)throw fail('closed');}
 async verify():Promise<void>{if(this.#closed||this.#working||!this.#read||!this.#metadata)throw fail('busy');this.#working=true;try{this.#callbacks!.current();await this.#read.verify();this.#callbacks!.current();this.#read.checkCurrent();if(this.#closed)throw fail('closed');}finally{this.#working=false;if(this.#closed)close.call(this);}}
 /** Retirement forbids reads immediately. Actual in-flight opening/verification
  * settles before cleanup, and unpublished or failed release remains retryable. */
 close():void{if(this.#disposed||this.#closing)return;this.#closed=true;forgetSourceRecordPayload(this);if(this.#working)return;this.#closing=true;try{this.#callbacks?.cleanupOpening?.();this.#read?.dispose();this.#read=undefined;this.#callbacks?.release();this.#callbacks=undefined;this.#disposed=true;}finally{this.#closing=false;}}
 static{create=callbacks=>new FreshParentHistoryReservation(key,callbacks);upload=owner=>{if(!owner||typeof owner!=='object'||!(#callbacks in owner)||owner.#closed||!owner.#callbacks?.uploads)throw fail('source');owner.#callbacks.current();const store=owner.#callbacks.uploads();owner.#callbacks.current();return store;};native=owner=>{if(!owner||typeof owner!=='object'||!(#callbacks in owner)||owner.#closed||owner.#working||!owner.#read||!owner.#callbacks?.native)throw fail('source');owner.checkCurrent();const value=owner.#callbacks.native();owner.checkCurrent();return value;};}
}
const close=FreshParentHistoryReservation.prototype.close;
/** Trusted family implementation only, not admission of caller-supplied DTOs. */
export function createFreshParentHistoryReservation<M extends ParentReferenceSource>(callbacks:Callbacks<M>){return create(callbacks);}
/** Internal actual-parent store borrow. The read retains its original whole-store
 * custody; no store is selected by metadata or released by this accessor. */
export function freshParentHistoryUploads<M extends ParentReferenceSource>(owner:FreshParentHistoryReservation<M>):RichAssetStore{return upload(owner);}
/** Internal genuine source, while the SAME complete record reader is held. */
export function freshParentNativeRetention<M extends ParentReferenceSource>(owner:FreshParentHistoryReservation<M>):NativeRetentionSource{return native(owner);}
