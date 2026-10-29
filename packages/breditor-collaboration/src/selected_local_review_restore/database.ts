/** Actual bounded IDB requests for the two unchanged schemas. Probe upgrades
 * are aborted; creation is absent-only. Every existing byte is read-compared.
 * Committed facts survive later policy refusal; cleanup never deletes a database. */
import {fields} from '../physical_room_record_cut/policy.js';
import {preparationChoice} from '../selected_delivery_preparation/identity.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {MAX_SELECTED_ROOM_CURRENT_BYTES} from '../selected_room_current/manifest.js';
import {equal,fail} from '../selected_local_review_delivery/policy.js';
import type {ArchiveIntegrityContext} from '../archive_integrity/context.js';
import type {DeliveryPreparationFile} from '../selected_delivery_preparation/contract.js';
import type {LocalReviewRestorePresence} from './contract.js';
export type RestoreTable='prepared'|'delivery';
export interface RestoreDatabaseData {readonly prepared:DeliveryPreparationFile;readonly deliveryDatabase:string;readonly before:string;readonly current:string}
const schema=(kind:RestoreTable)=>kind==='prepared'?'intent':'state';
export class LocalReviewRestoreDatabase {
 readonly #factory;readonly #checkAuthority;readonly #data;readonly #integrity;
 #db:IDBDatabase|undefined;#changed=false;#closing=false;#closed=false;#pending=false;#request:IDBOpenDBRequest|undefined;#reject:((error:unknown)=>void)|undefined;#running:Promise<unknown>|undefined;#ending:Promise<void>|undefined;
 constructor(factory:IDBFactory,data:RestoreDatabaseData,integrity:ArchiveIntegrityContext,check:()=>void){this.#factory=factory;this.#data=data;this.#integrity=integrity;this.#checkAuthority=check;Object.freeze(this);}
 checkCurrent=()=>{if(this.#closed||this.#closing||this.#changed||globalThis.indexedDB!==this.#factory)throw fail('local_review_restore_closed');};
 #check=()=>{this.checkCurrent();this.#checkAuthority();this.checkCurrent();};
 #run<T>(work:()=>Promise<T>):Promise<T>{this.checkCurrent();if(this.#running||this.#pending)throw fail('local_review_restore_busy');const job=Promise.resolve().then(work);this.#running=job;return job.finally(()=>{this.#running=undefined;});}
 #detach(){this.#db?.close();this.#db=undefined;}
 #attach(db:IDBDatabase){this.#db=db;db.onversionchange=()=>{this.#changed=true;db.close();};}
 #schema(kind:RestoreTable){const db=this.#db!,name=schema(kind);if(db.version!==1||db.objectStoreNames.length!==1||db.objectStoreNames[0]!==name)throw fail('local_review_restore_exists');const tx=db.transaction(name,'readonly'),s=tx.objectStore(name);if(s.keyPath!==null||s.autoIncrement||s.indexNames.length)throw fail('local_review_restore_exists');}
 async #open(kind:RestoreTable,create:boolean):Promise<boolean>{this.#check();if(this.#db||this.#pending)throw fail('local_review_restore_busy');const name=kind==='prepared'?this.#data.prepared.choice.database:this.#data.deliveryDatabase;
  return new Promise<boolean>((resolve,reject)=>{const q=this.#factory.open(name,1);let absent=false,created=false,failed=false,reason:unknown;this.#pending=true;this.#request=q;this.#reject=reject;
   const abort=(error:unknown)=>{failed=true;reason=error;try{q.transaction?.abort();}catch{}};const done=()=>{this.#pending=false;this.#request=undefined;this.#reject=undefined;};
   q.onupgradeneeded=event=>{this.#attach(q.result);try{this.#check();if(failed||event.oldVersion!==0)throw fail('local_review_restore_exists');if(!create){absent=true;q.transaction!.abort();return;}
    const s=q.result.createObjectStore(schema(kind));if(kind==='prepared')s.add({format:'breditor/selected-native-delivery-prepared-record',formatVersion:1,choice:this.#data.prepared.choice,file:this.#data.prepared.file},'record');else{s.add(this.#data.before,'before');s.add(this.#data.current,'current');}created=true;this.#check();
   }catch(error){abort(error);}};
   q.onblocked=()=>{failed=true;reason=fail('local_review_restore_busy');reject(reason);};
   q.onerror=()=>{done();this.#detach();try{this.#check();if(failed)throw reason;if(absent&&!create){resolve(false);return;}throw fail('local_review_restore_storage');}catch(error){reject(error);}};
   q.onsuccess=()=>{this.#attach(q.result);done();try{this.#check();if(failed)throw reason;if(create&&!created)throw fail('local_review_restore_exists');this.#schema(kind);resolve(true);}catch(error){this.#detach();reject(error);}};
  });
 }
 #raw(kind:RestoreTable):Promise<readonly unknown[]>{this.#check();this.#schema(kind);const name=schema(kind),expectedKeys=kind==='prepared'?['record']:['before','current'];return new Promise((resolve,reject)=>{const tx=this.#db!.transaction(name,'readonly'),s=tx.objectStore(name);let failed=false,reason:unknown,raw:unknown[]|undefined;const abort=(error:unknown)=>{failed=true;reason=error;try{tx.abort();}catch{}};tx.onerror=()=>{};tx.onabort=()=>reject(failed?reason:fail('local_review_restore_storage'));tx.oncomplete=()=>{try{this.#check();if(!raw)throw fail();resolve(raw);}catch(error){reject(error);}};
  const count=s.count();count.onsuccess=()=>{try{this.#check();if(count.result!==expectedKeys.length)throw fail('local_review_restore_exists');const keys=s.getAllKeys(undefined,3),values=s.getAll(undefined,3);let n=0;const done=()=>{if(++n!==2)return;try{this.#check();if(!equal(keys.result,expectedKeys))throw fail();raw=values.result;}catch(error){abort(error);}};keys.onsuccess=done;values.onsuccess=done;}catch(error){abort(error);}};
 });}
 async #verify(kind:RestoreTable){const raw=await this.#raw(kind);if(kind==='delivery'){if(raw[0]!==this.#data.before||raw[1]!==this.#data.current)throw fail('local_review_restore_exists');}else{const r=fields(raw[0],['format','formatVersion','choice','file']);if(r['format']!=='breditor/selected-native-delivery-prepared-record'||r['formatVersion']!==1||!equal(preparationChoice(r['choice']),this.#data.prepared.choice))throw fail('local_review_restore_exists');const file=archiveBlob(r['file'] as Blob,MAX_SELECTED_ROOM_CURRENT_BYTES);if(file.size!==this.#data.prepared.file.size||await this.#integrity.digest(file)!==this.#data.prepared.choice.before.sha256)throw fail('local_review_restore_exists');}this.#check();}
 inspect(kind:RestoreTable):Promise<LocalReviewRestorePresence>{return this.#run(async()=>{try{if(!await this.#open(kind,false))return 'absent';await this.#verify(kind);return 'identical';}finally{this.#detach();}});}
 create(kind:RestoreTable):Promise<void>{return this.#run(async()=>{try{await this.#open(kind,true);await this.#verify(kind);}finally{this.#detach();}});}
 close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#ending)return this.#ending;this.#closing=true;if(this.#pending){this.#reject?.(fail('local_review_restore_closed'));try{this.#request?.transaction?.abort();}catch{}}this.#ending=(async()=>{await this.#running?.catch(()=>{});if(this.#pending)throw fail('local_review_restore_busy');this.#detach();this.#closed=true;})().finally(()=>{this.#ending=undefined;});return this.#ending;}
}
