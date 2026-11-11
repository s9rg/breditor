/** The complete original multipart bytes are committed before any destination
 * metadata is opened. Creation is absent-only; explicit resume is existing-only.
 * Cleanup retains late opens and never deletes a committed or partial intent. */
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {RecoveryLease,checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {PhysicalOperationV3Cancellation} from '../physical_room_operation_v3/storage_cancellation.js';
import {settleOwnedTransaction} from '../persistence/settle_owned_transaction.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {detachLocalMetadataBundle} from '../selected_local_metadata_delivery/bundle.js';
import type {LocalMetadataRoomBundle} from '../selected_local_metadata_delivery/contract.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {continuationChoice,equal,fail} from './policy.js';
import type {MetadataContinuationChoice} from './contract.js';
import {handoverMetadataContinuationChoice} from './handover_choice.js';
import type {HandoverMetadataContinuationChoice} from './handover_contract.js';
const tables=['intent'];
const journalKey=Object.freeze({});
interface IntentWire {
 readonly format:string;
 readonly choice:MetadataContinuationChoice|HandoverMetadataContinuationChoice;
 readChoice(input:unknown):MetadataContinuationChoice|HandoverMetadataContinuationChoice;
}

class MetadataContinuationJournal{
 readonly #factory=recoveryOpeningContext();readonly #locks=navigator.locks;readonly #choice;readonly #wire:IntentWire;readonly #integrity;readonly #authority;readonly #cancel;
 #opening:RecoveryOpeningCustody|undefined;#lease:RecoveryLease|undefined;#db:IDBDatabase|undefined;
 #changed=false;#closing=false;#closed=false;#pending=false;#request:IDBOpenDBRequest|undefined;#reject:((e:unknown)=>void)|undefined;#running:Promise<unknown>|undefined;#ending:Promise<void>|undefined;
 // Archive setup invokes its guard immediately. Install cancellation first,
 // and retire its observers if any constructor admission refuses.
 constructor(token:object,choice:MetadataContinuationChoice,wire:IntentWire,options:SharedArchiveIntegrityOptions){if(token!==journalKey)throw fail();this.#choice=choice;this.#wire=wire;this.#authority=participantAuthority(options.checkAuthority);this.#cancel=new PhysicalOperationV3Cancellation(options.signal);try{this.#integrity=prepareArchiveIntegrity({...options,checkAuthority:this.#check});}catch(error){this.#cancel.close();throw error;}Object.freeze(this);}
 #current=()=>{if(this.#closing||this.#closed||this.#changed||globalThis.indexedDB!==this.#factory||globalThis.navigator?.locks!==this.#locks)throw fail('metadata_continuation_closed');if(this.#lease)checkRecoveryLeasesHeld([this.#lease]);try{this.#cancel.check();}catch{throw fail('metadata_continuation_closed');}};
 #check=()=>{this.#current();this.#authority();this.#current();};
 /** Actual finite-reader guard. A copied descriptor supplies no live journal. */
 check():void{this.#check();}
 #run<T>(work:()=>Promise<T>):Promise<T>{if(this.#running)return Promise.reject(fail('metadata_continuation_busy'));const job=Promise.resolve().then(()=>{this.#check();return work();});this.#running=job;return job.finally(()=>{this.#running=undefined;});}
 async #verify(input:unknown):Promise<LocalMetadataRoomBundle>{
  const r=fields(input,['format','formatVersion','choice','origin']);if(r['format']!==this.#wire.format||r['formatVersion']!==1||!equal(this.#wire.readChoice(r['choice']),this.#wire.choice))throw fail();const origin=detachLocalMetadataBundle(r['origin']),pins=this.#choice.origin;
  if(!equal(origin.parent.prepared.choice,pins.prepared)||!equal(origin.parent.current.selection,pins.current)||origin.parent.delivery.bytes!==pins.review.bytes||origin.parent.delivery.sha256!==pins.review.sha256||origin.metadata.bytes!==pins.metadata.bytes||origin.metadata.sha256!==pins.metadata.sha256)throw fail();
  for(const[file,pin]of[[origin.parent.prepared.file,pins.prepared.before],[origin.parent.current.file,pins.current],[origin.parent.delivery.file,pins.review],[origin.metadata.file,pins.metadata]] as const){if(file.size!==pin.bytes||await this.#integrity.digest(file)!==pin.sha256)throw fail();this.#check();}return origin;
 }
 #attach(db:IDBDatabase){this.#db=db;db.onversionchange=()=>{this.#changed=true;db.close();};}
 open(origin:LocalMetadataRoomBundle):Promise<LocalMetadataRoomBundle>{return this.#open(origin,true);}
 /** A missing existing-only journal cannot create a placeholder namespace. */
 reopen(origin:LocalMetadataRoomBundle):Promise<LocalMetadataRoomBundle>{return this.#open(origin,false);}
 #open(origin:LocalMetadataRoomBundle,create:boolean):Promise<LocalMetadataRoomBundle>{return this.#run(async()=>{
  if(this.#db||this.#opening)throw fail('metadata_continuation_busy');const record={format:this.#wire.format,formatVersion:1,choice:this.#wire.choice,origin:detachLocalMetadataBundle(origin)};await this.#verify(record);
  this.#opening=await RecoveryOpeningCustody.reserve(this.#factory,[this.#choice.database],()=>this.#close(),{policy:()=>fail(),busy:()=>fail('metadata_continuation_busy'),storage:()=>fail('metadata_continuation_storage')});this.#check();this.#lease=await RecoveryLease.acquire(JSON.stringify(this.#choice.database));this.#check();
  await new Promise<void>((resolve,reject)=>{
   const q=this.#factory.open(this.#choice.database,1);let created=false,refused=false,reason:unknown,unwatch=()=>{};this.#pending=true;this.#request=q;this.#reject=reject;
   const abort=(error:unknown)=>{refused=true;reason=error;if(q.transaction){try{q.transaction.abort();}catch{}}else reject(error);},done=()=>{this.#pending=false;this.#request=undefined;this.#reject=undefined;unwatch();};
   try{unwatch=this.#cancel.watch(()=>abort(fail('metadata_continuation_closed')));}catch(error){abort(error);}
   q.onupgradeneeded=event=>{this.#attach(q.result);try{this.#check();if(refused)throw reason;if(event.oldVersion!==0)throw fail();if(!create)throw fail('metadata_continuation_missing');q.result.createObjectStore('intent').add(record,'record');created=true;this.#check();}catch(error){abort(error);}};
   q.onblocked=()=>{refused=true;reason=fail('metadata_continuation_busy');reject(reason);};q.onerror=()=>{done();reject(refused?reason:fail('metadata_continuation_storage'));};q.onsuccess=()=>{this.#attach(q.result);done();try{this.#check();if(refused)throw reason;if(create&&!created)throw fail('metadata_continuation_exists');if(q.result.version!==1||!equal([...q.result.objectStoreNames],tables))throw fail('metadata_continuation_schema');resolve();}catch(error){reject(error);}};
  });
  const value=await new Promise<unknown>((resolve,reject)=>{
   this.#check();const tx=this.#db!.transaction(tables,'readonly'),store=tx.objectStore('intent');let result:unknown,reason:unknown,failed=false,ready=false,unwatch=()=>{};
   const abort=(error:unknown)=>{failed=true;reason=error;try{tx.abort();}catch{}};tx.onerror=()=>{};
   try{unwatch=this.#cancel.watch(()=>abort(fail('metadata_continuation_closed')));}catch(error){abort(error);}
   settleOwnedTransaction(tx,()=>{unwatch();this.#check();if(!ready)throw fail();return result;},()=>{unwatch();return failed?reason:fail('metadata_continuation_storage');},resolve,reject);
   if(store.keyPath!==null||store.autoIncrement||store.indexNames.length){abort(fail());return;}
   const count=store.count();count.onsuccess=()=>{try{this.#check();if(count.result!==1)throw fail();const keys=store.getAllKeys(undefined,2),read=store.get('record');let received=0;const done=()=>{if(++received!==2)return;try{this.#check();if(!equal(keys.result,['record']))throw fail();result=read.result;ready=true;}catch(error){abort(error);}};keys.onsuccess=done;read.onsuccess=done;}catch(error){abort(error);}};
  });return this.#verify(value);
 });}
 close():Promise<void>{this.#closing=true;this.#reject?.(fail('metadata_continuation_closed'));try{this.#request?.transaction?.abort();}catch{}return this.#close().then(()=>this.#opening?.rollback());}
 #close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#ending)return this.#ending;this.#closing=true;this.#ending=(async()=>{await this.#running?.catch(()=>{});if(this.#pending)throw fail('metadata_continuation_busy');if(this.#db){this.#db.onversionchange=null;this.#db.close();}await this.#lease?.close();this.#db=undefined;this.#lease=undefined;this.#cancel.close();this.#closed=true;})().finally(()=>{this.#ending=undefined;});return this.#ending;}
}

export class MetadataContinuationIntent extends MetadataContinuationJournal {
 constructor(choice:MetadataContinuationChoice,options:SharedArchiveIntegrityOptions){
  const selected=continuationChoice(choice);
  super(journalKey,selected,{format:'breditor/selected-local-metadata-continuation-intent',choice:selected,readChoice:continuationChoice},options);
 }
}

export class HandoverMetadataContinuationIntent extends MetadataContinuationJournal {
 constructor(choice:HandoverMetadataContinuationChoice,options:SharedArchiveIntegrityOptions){
  const selected=handoverMetadataContinuationChoice(choice);
  super(journalKey,selected.continuation,{
   format:'breditor/selected-local-metadata-continuation-intent-across-handover',
   choice:selected,
   readChoice:handoverMetadataContinuationChoice,
  },options);
 }
}
