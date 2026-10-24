/** Internal lifecycle for SDK-created fresh parent readers. Incoming APIs must
 * reserve a genuine parent themselves; this report wrapper is not custody.
 * A failed or closed read releases only its read producer and private busy flag. */
import {SharedEditorError} from '../core.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {ParentReferenceSource,ParentReferenceProducer} from './reference_read.js';
import type {RichAssetStore} from '@breditor/experimental-rich-content';
interface Callbacks<M extends ParentReferenceSource>{current():void;open():Promise<ParentReferenceProducer<M>>;release():void;uploads?:()=>RichAssetStore}
const key=Object.freeze({}),fail=(kind:string)=>new SharedEditorError('fresh_parent_read_'+kind,'Keep the genuine parent and its independent read reservation alive');
let create:<M extends ParentReferenceSource>(callbacks:Callbacks<M>)=>FreshParentHistoryReservation<M>;
let upload:<M extends ParentReferenceSource>(owner:FreshParentHistoryReservation<M>)=>RichAssetStore;
export class FreshParentHistoryReservation<M extends ParentReferenceSource>{
 #callbacks:Callbacks<M>|undefined;#read:ParentReferenceProducer<M>|undefined;#metadata:M|undefined;#working=false;#closed=false;
 private constructor(token:object,callbacks:Callbacks<M>){if(token!==key)throw fail('source');this.#callbacks=callbacks;Object.freeze(this);}
 metadata():M{if(!this.#metadata)throw fail('not_prepared');return this.#metadata;}
 async prepare():Promise<void>{if(this.#working||this.#closed||this.#metadata)throw fail('busy');this.#working=true;let complete=false;
  try{this.#callbacks!.current();this.#read=await this.#callbacks!.open();this.#read.check();const metadata=frozen(structuredClone(this.#read.metadata()));this.#callbacks!.current();this.#read.checkCurrent();this.#metadata=metadata;complete=true;}
  finally{this.#working=false;if(!complete)this.close();}
 }
 check():void{if(this.#closed||this.#working||!this.#read||!this.#metadata)throw fail('busy');this.#working=true;try{this.#callbacks!.current();this.#read.check();this.#callbacks!.current();this.#read.checkCurrent();}finally{this.#working=false;}}
 /** Before preparation this checks held custody only; afterwards it also fences
  * every source/record pin. Neither form invokes a host grant or signal getter. */
 checkCurrent():void{if(this.#closed)throw fail('closed');this.#callbacks!.current();this.#read?.checkCurrent();this.#callbacks!.current();}
 async verify():Promise<void>{if(this.#closed||this.#working||!this.#read||!this.#metadata)throw fail('busy');this.#working=true;try{this.#callbacks!.current();await this.#read.verify();this.#callbacks!.current();this.#read.checkCurrent();}finally{this.#working=false;}}
 close():void{if(this.#closed)return;if(this.#working)throw fail('busy');this.#read?.dispose();this.#read=undefined;this.#callbacks!.release();this.#callbacks=undefined;this.#closed=true;}
 static{create=callbacks=>new FreshParentHistoryReservation(key,callbacks);upload=owner=>{if(!owner||typeof owner!=='object'||!(#callbacks in owner)||owner.#closed||!owner.#callbacks?.uploads)throw fail('source');owner.#callbacks.current();const store=owner.#callbacks.uploads();owner.#callbacks.current();return store;};}
}
/** Trusted family implementation only, not admission of caller-supplied DTOs. */
export function createFreshParentHistoryReservation<M extends ParentReferenceSource>(callbacks:Callbacks<M>){return create(callbacks);}
/** Internal actual-parent store borrow. The read retains its original whole-store
 * custody; no store is selected by metadata or released by this accessor. */
export function freshParentHistoryUploads<M extends ParentReferenceSource>(owner:FreshParentHistoryReservation<M>):RichAssetStore{return upload(owner);}
