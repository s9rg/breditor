/** One immutable record in one absent-only upgrade transaction. Existing-only
 * reopen aborts missing creation; a lost completion is resolved by exact read.
 * Count-first reads and tracked pending opens keep bounded cleanup real. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {DeliveryPreparationReadScope} from './read_scope.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {PhysicalOperationV3Cancellation} from '../physical_room_operation_v3/storage_cancellation.js';
import type {DeliveryPreparationChoice,DeliveryPreparationFile} from './contract.js';
import {preparationChoice} from './identity.js';
import {SelectedRoomCurrentArchive} from '../selected_room_current/archive.js';
import {fields,fail,MAX_DELIVERY_PREPARATION_BYTES} from './policy.js';
const archive={read:SelectedRoomCurrentArchive.read,file:SelectedRoomCurrentArchive.prototype.file,dispose:SelectedRoomCurrentArchive.prototype.dispose};
const table='intent',recordKey='record';
function schema(db:IDBDatabase){if(db.version!==1||db.objectStoreNames.length!==1||db.objectStoreNames[0]!==table)throw fail('delivery_preparation_exists');}
function record(value:unknown):DeliveryPreparationFile{const row=fields(value,['format','formatVersion','choice','file']);if(row['format']!=='breditor/selected-native-delivery-prepared-record'||row['formatVersion']!==1)throw fail();const choice=preparationChoice(row['choice']),file=archiveBlob(row['file'] as Blob,MAX_DELIVERY_PREPARATION_BYTES);if(file.size!==choice.before.bytes)throw fail();return Object.freeze({choice,file});}
export class DeliveryPreparationIntentStore{
 readonly #factory;readonly #choice;readonly #cancel;readonly #scope;
 #db:IDBDatabase|undefined;#pending=false;#request:IDBOpenDBRequest|undefined;#reject:((reason:unknown)=>void)|undefined;#closing=false;#closed=false;#running:Promise<unknown>|undefined;#cleanup:Promise<void>|undefined;
 constructor(factory:IDBFactory,choice:DeliveryPreparationChoice,options:SharedArchiveIntegrityOptions){this.#factory=factory;this.#choice=preparationChoice(choice);this.#scope=new DeliveryPreparationReadScope(options);try{this.#cancel=new PhysicalOperationV3Cancellation(this.#scope.signal);}catch(error){this.#scope.close();throw error;}Object.freeze(this);}
 readonly #revoked=new AbortController();
 get revoked():AbortSignal{return this.#revoked.signal;}
 checkCurrent=()=>{if(this.#closing||this.#closed||this.#revoked.signal.aborted||globalThis.indexedDB!==this.#factory)throw fail('delivery_preparation_closed');};
 #check=()=>{this.checkCurrent();this.#cancel.check();this.#scope.check();this.checkCurrent();this.#cancel.check();};
 #run<T>(work:()=>Promise<T>):Promise<T>{this.checkCurrent();if(this.#running)throw fail('delivery_preparation_busy');const task=Promise.resolve().then(work);this.#running=task;return task.finally(()=>{this.#running=undefined;});}
 #attach(db:IDBDatabase){this.#db=db;
  db.onclose=()=>this.#revoked.abort();
  db.onversionchange=()=>{this.#revoked.abort();db.close();};
 }
 async #verify(input:DeliveryPreparationFile):Promise<DeliveryPreparationFile>{if(JSON.stringify(input.choice)!==JSON.stringify(this.#choice))throw fail();const admitted=await archive.read.call(SelectedRoomCurrentArchive,input.file,this.#choice.before,{wasm:this.#scope.integrity.wasm,checkAuthority:this.#check,signal:this.#scope.signal});try{this.#check();return Object.freeze({choice:this.#choice,file:archive.file.call(admitted)});}finally{archive.dispose.call(admitted);}}

 open(initial?:Blob):Promise<DeliveryPreparationFile>{return this.#run(async()=>{this.#check();if(this.#pending||this.#db)throw fail('delivery_preparation_busy');const prepared=initial===undefined?undefined:await this.#verify({choice:this.#choice,file:archiveBlob(initial,MAX_DELIVERY_PREPARATION_BYTES)});this.#check();await new Promise<void>((resolve,reject)=>{const q=this.#factory.open(this.#choice.database,1);let created=false,blocked=false,failed=false,reason:unknown,unwatch=()=>{};this.#request=q;this.#pending=true;this.#reject=reject;const abort=(error:unknown)=>{failed=true;reason=error;if(q.transaction){try{q.transaction.abort();}catch{}}else reject(error);},done=()=>{this.#pending=false;this.#request=undefined;this.#reject=undefined;unwatch();};try{unwatch=this.#cancel.watch(()=>abort(fail('delivery_preparation_aborted')));}catch(error){abort(error);}
 q.onupgradeneeded=event=>{this.#attach(q.result);try{this.#check();if(blocked||failed)throw fail('delivery_preparation_busy');if(event.oldVersion!==0)throw fail('delivery_preparation_exists');if(!prepared)throw fail('delivery_preparation_missing');q.result.createObjectStore(table).add({format:'breditor/selected-native-delivery-prepared-record',formatVersion:1,choice:prepared.choice,file:prepared.file},recordKey);created=true;this.#check();}catch(error){abort(error);}};
 q.onblocked=()=>{blocked=true;unwatch();reject(fail('delivery_preparation_busy'));};q.onerror=()=>{done();reject(failed?reason:fail('delivery_preparation_storage'));};q.onsuccess=()=>{this.#attach(q.result);done();try{this.#check();if(blocked||failed)throw fail('delivery_preparation_busy');if(prepared&&!created)throw fail('delivery_preparation_exists');schema(q.result);resolve();}catch(error){reject(error);}};});return this.#load();});}
 #raw():Promise<DeliveryPreparationFile>{this.#check();if(!this.#db)throw fail('delivery_preparation_closed');schema(this.#db);return new Promise((resolve,reject)=>{const tx=this.#db!.transaction(table,'readonly'),store=tx.objectStore(table);let failed=false,reason:unknown,result:DeliveryPreparationFile|undefined,ready=0,unwatch=()=>{};const abort=(error:unknown)=>{failed=true;reason=error;try{tx.abort();}catch{}};try{unwatch=this.#cancel.watch(()=>abort(fail('delivery_preparation_aborted')));}catch(error){abort(error);}tx.onerror=()=>{};tx.onabort=()=>{unwatch();reject(failed?reason:fail('delivery_preparation_storage'));};tx.oncomplete=()=>{unwatch();try{this.#check();if(!result)throw fail();resolve(result);}catch(error){reject(error);}};
 try{if(store.keyPath!==null||store.autoIncrement||store.indexNames.length)throw fail();const count=store.count();count.onsuccess=()=>{try{this.#check();if(count.result!==1)throw fail();const keys=store.getAllKeys(undefined,2),data=store.get(recordKey);let selectedKeys:IDBValidKey[]|undefined,value:unknown;const take=()=>{if(++ready!==2)return;try{this.#check();if(selectedKeys?.length!==1||selectedKeys[0]!==recordKey)throw fail();result=record(value);}catch(error){abort(error);}};keys.onsuccess=()=>{selectedKeys=keys.result;take();};data.onsuccess=()=>{value=data.result;take();};}catch(error){abort(error);}};}catch(error){abort(error);}});}
 async #load(){return this.#verify(await this.#raw());}
 read():Promise<DeliveryPreparationFile>{return this.#run(()=>this.#load());}
 close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;this.#revoked.abort();this.#scope.close();if(this.#pending){this.#reject?.(fail('delivery_preparation_closed'));try{this.#request?.transaction?.abort();}catch{}}this.#cleanup=(async()=>{await this.#running?.catch(()=>{});if(this.#pending)throw fail('delivery_preparation_busy');this.#db?.close();this.#db=undefined;this.#cancel.close();this.#closed=true;})().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
}
