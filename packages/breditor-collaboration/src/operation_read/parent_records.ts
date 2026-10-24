/** Internal parent-record read, never a custody-transfer or activation token.
 * Incoming APIs must open a genuine class-branded parent themselves; detached
 * metadata or this data wrapper cannot substitute for that admission. */
import {SharedEditorError} from '../core.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {SharedParticipantBackupSelection} from '../participant_backup/types.js';
import type {OperationRecord} from '../participant_operation/record.js';
import type {RecoveryRecord} from '../participant_recovery/journal.js';
import {createParentReferenceRead,type ParentReferenceSource,type ParentReferenceProducer,type OperationalParentReferenceRead} from './reference_read.js';
type Immutable<T>=T extends readonly(infer V)[]?readonly Immutable<V>[]:T extends object?{readonly[K in keyof T]:Immutable<T[K]>}:T;
export interface OriginalOperationalRecordMetadata{
 readonly format:'breditor/original-operational-record-read';readonly formatVersion:1;
 readonly scope:'held-original-parent-marker-and-archive';readonly selection:Immutable<SharedParticipantBackupSelection>;
 readonly operation:OperationRecord;readonly recovery:Immutable<RecoveryRecord>;
 readonly files:readonly Readonly<{role:'operation-origin';bytes:number;sha256:string}>[];
}
export interface ParentRecordFile{readonly role:'operation-origin';readonly file:Blob}
interface Callbacks<O,R extends ParentReferenceSource>{check():void;current():void;verify():Promise<void>;readReferences(options:O):Promise<ParentReferenceProducer<R>>;files():readonly ParentRecordFile[];release():void}
const key=Object.freeze({}),fail=(suffix:string)=>new SharedEditorError('operational_parent_read_'+suffix,'Use a genuine held parent and fresh independent read permission');
let create:<O,R extends ParentReferenceSource>(metadata:OriginalOperationalRecordMetadata,callbacks:Callbacks<O,R>)=>OperationalParentRecordRead<O,R>;
/** Global class: closed reports retain no producer, archive, policy or source callbacks. */
export class OperationalParentRecordRead<O,R extends ParentReferenceSource>{
 readonly #metadata:OriginalOperationalRecordMetadata;#callbacks:Callbacks<O,R>|undefined;readonly #children=new Set<OperationalParentReferenceRead<R>>();#closed=false;#checking=false;#verifying=false;#readingReferences=false;
 private constructor(token:object,metadata:OriginalOperationalRecordMetadata,callbacks:Callbacks<O,R>){if(token!==key)throw fail('source');this.#metadata=frozen(structuredClone(metadata));this.#callbacks=callbacks;Object.freeze(this);}
 metadata(){return this.#metadata;}
 check():void{if(this.#closed)throw fail('closed');if(this.#checking)throw fail('busy');this.#checking=true;try{this.#callbacks!.check();if(this.#closed)throw fail('closed');}finally{this.#checking=false;}}
 checkCurrent():void{if(this.#closed)throw fail('closed');this.#callbacks!.current();if(this.#closed)throw fail('closed');}
 async verify():Promise<void>{if(this.#closed)throw fail('closed');if(this.#verifying)throw fail('busy');this.#verifying=true;try{check.call(this);await this.#callbacks!.verify();check.call(this);}finally{this.#verifying=false;}}
 /** Only read-only results escape. One live child owns the selected queue/catalog
  * gates; parent disposal closes it before unlocking coordinator custody. */
 async captureReferences(options:O):Promise<OperationalParentReferenceRead<R>>{
  check.call(this);if(this.#readingReferences||this.#children.size)throw fail('busy');this.#readingReferences=true;let child:ParentReferenceProducer<R>|undefined,result:OperationalParentReferenceRead<R>|undefined,complete=false;
  try{await this.verify();check.call(this);child=await this.#callbacks!.readReferences(options);check.call(this);child.check();await this.verify();child.check();const selected=child,current=()=>{this.checkCurrent();selected.checkCurrent();};result=createParentReferenceRead(selected.metadata(),{check:()=>{check.call(this);selected.check();current();},current,verify:async()=>{await this.verify();await selected.verify();current();},release:()=>{try{selected.dispose();}finally{this.#children.delete(result!);}}});this.#children.add(result);current();complete=true;return result;}
  finally{this.#readingReferences=false;if(!complete){if(result)result.dispose();else child?.dispose();}}
 }
 files():readonly ParentRecordFile[]{check.call(this);return this.#callbacks!.files();}
 dispose():void{if(this.#closed)return;this.#closed=true;const callbacks=this.#callbacks;this.#callbacks=undefined;let error:unknown;for(const child of [...this.#children])try{child.dispose();}catch(cause){error??=cause;}this.#children.clear();try{callbacks?.release();}catch(cause){error??=cause;}if(error)throw error;}
 static{create=(metadata,callbacks)=>new OperationalParentRecordRead(key,metadata,callbacks);}
}
const check=OperationalParentRecordRead.prototype.check;
/** Trusted family wrapper only; not an incoming parent/source admission API. */
export function createOriginalOperationalRecordRead<O,R extends ParentReferenceSource>(metadata:OriginalOperationalRecordMetadata,callbacks:Callbacks<O,R>){return create(metadata,callbacks);}
