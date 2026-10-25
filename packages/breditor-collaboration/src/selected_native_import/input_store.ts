/** Immutable input retention only. One absent-only transaction retains the
 * complete file; exact retries read, never put/repair/overwrite. This is not a
 * per-client progress journal or a native durability acknowledgement. */
import {PhysicalOperationV3Cancellation} from '../physical_room_operation_v3/storage_cancellation.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {database} from '../physical_room_asset_adoption/policy.js';
import {nativeImportChoice} from './manifest.js';
import {fields,fail,MAX_NATIVE_IMPORT_BYTES} from './policy.js';
import type {SelectedNativeImportChoice} from './contract.js';
export interface SelectedNativeImportInputRecord{readonly format:'breditor/selected-native-import-retained-input';readonly formatVersion:1;readonly choice:SelectedNativeImportChoice;readonly file:Blob}
export function nativeImportInputRecord(value:unknown):SelectedNativeImportInputRecord{const r=fields(value,['format','formatVersion','choice','file']);if(r['format']!=='breditor/selected-native-import-retained-input'||r['formatVersion']!==1)throw fail();const choice=nativeImportChoice(r['choice']),file=archiveBlob(r['file'] as Blob,MAX_NATIVE_IMPORT_BYTES);if(file.size!==choice.input.bytes)throw fail();return Object.freeze({format:'breditor/selected-native-import-retained-input',formatVersion:1,choice,file});}
const table='input';
const existingKey=Object.freeze({});
function schema(db:IDBDatabase){if(db.version!==1||db.objectStoreNames.length!==1||db.objectStoreNames[0]!==table)throw fail('native_import_exists');}
export class SelectedNativeImportInputStore{
 readonly #factory;readonly #name;readonly #wasm;readonly #cancellation;readonly #choice;readonly #initial:SelectedNativeImportInputRecord|undefined;#policy:(()=>void)|undefined;
 #db:IDBDatabase|undefined;#request:IDBOpenDBRequest|undefined;#pending=false;#reject:((reason:unknown)=>void)|undefined;#changed=false;#closing=false;#closed=false;#running:Promise<unknown>|undefined;#cleanup:Promise<void>|undefined;
 constructor(factory:IDBFactory,name:string,expected:SelectedNativeImportInputRecord,authority:()=>void,wasm:SharedArchiveIntegrityOptions['wasm'],signal?:AbortSignal,mode?:object){this.#factory=factory;this.#name=database(name);if(mode===existingKey){this.#choice=nativeImportChoice(expected);this.#initial=undefined;}else{if(mode!==undefined)throw fail('native_import_policy');this.#initial=nativeImportInputRecord(expected);this.#choice=this.#initial.choice;}if(this.#choice.database!==this.#name)throw fail('native_import_policy');this.#policy=authority;this.#wasm=wasm;this.#cancellation=new PhysicalOperationV3Cancellation(signal);Object.freeze(this);}
 checkCurrent=()=>{if(this.#closed||this.#closing||this.#changed||!this.#db||globalThis.indexedDB!==this.#factory)throw fail('native_import_closed');};
 #job=()=>{if(this.#closed||this.#closing||this.#changed||globalThis.indexedDB!==this.#factory||!this.#policy)throw fail('native_import_closed');this.#cancellation.check();this.#policy();if(this.#closed||this.#closing||this.#changed)throw fail('native_import_closed');this.#cancellation.check();};
 #attach(db:IDBDatabase){this.#db=db;db.onversionchange=()=>{this.#changed=true;db.close();};}
 #run<T>(work:()=>Promise<T>):Promise<T>{if(this.#closed||this.#closing)throw fail('native_import_closed');if(this.#running)throw fail('native_import_busy');const task=Promise.resolve().then(work);this.#running=task;return task.finally(()=>{this.#running=undefined;});}
 open():Promise<void>{return this.#run(()=>{
  this.#job();if(this.#pending||this.#db)throw fail('native_import_busy');return new Promise<void>((resolve,reject)=>{const q=this.#factory.open(this.#name,1);let blocked=false,reason:unknown,failed=false,unwatch=()=>{};this.#pending=true;this.#request=q;this.#reject=reject;const abort=(error:unknown)=>{reason=error;failed=true;if(q.transaction){try{q.transaction.abort();}catch{}}else reject(error);},done=()=>{this.#pending=false;this.#request=undefined;this.#reject=undefined;unwatch();};try{unwatch=this.#cancellation.watch(()=>abort(fail('native_import_aborted')));}catch(error){abort(error);}
   q.onupgradeneeded=event=>{this.#attach(q.result);try{this.#job();if(blocked||failed)throw fail('native_import_busy');if(event.oldVersion!==0||!this.#initial)throw fail('native_import_exists');q.result.createObjectStore(table).add(this.#initial,'record');this.#job();}catch(error){abort(error);}};
   q.onblocked=()=>{blocked=true;unwatch();reject(fail('native_import_busy'));};q.onerror=()=>{done();reject(failed?reason:fail('native_import_storage'));};q.onsuccess=()=>{this.#attach(q.result);done();try{this.#job();if(blocked||failed)throw fail('native_import_busy');schema(q.result);resolve();}catch(error){reject(error);}};
  });
 });}
 /** Fresh permission and cancellation for each read. No expired preparation
  * grant is reused; storage identity and actual connection lifetime remain held. */
 verifyFresh(authority:()=>void,signal?:AbortSignal):Promise<SelectedNativeImportInputRecord>{return this.#run(async()=>{const observation=new PhysicalOperationV3Cancellation(signal),check=()=>{this.checkCurrent();observation.check();authority();this.checkCurrent();observation.check();};try{const row=await this.#read(check,observation);check();const context=prepareArchiveIntegrity({wasm:this.#wasm,checkAuthority:check});if(JSON.stringify(row.choice)!==JSON.stringify(this.#choice)||await context.digest(row.file)!==row.choice.input.sha256)throw fail('native_import_exists');check();return row;}finally{observation.close();}});}
 /** Only the immutable input and pure hash runtime survive preparation. */
 sealPreparation():void{this.checkCurrent();if(this.#running||this.#pending)throw fail('native_import_busy');this.#policy=undefined;this.#cancellation.close();}
 #read(check:()=>void,observation:PhysicalOperationV3Cancellation):Promise<SelectedNativeImportInputRecord>{check();const db=this.#db!;schema(db);return new Promise((resolve,reject)=>{const tx=db.transaction(table,'readonly'),store=tx.objectStore(table);let failed=false,reason:unknown,result:SelectedNativeImportInputRecord|undefined,ready=0,unwatch=()=>{};const values:unknown[]=[];const abort=(error:unknown)=>{failed=true;reason=error;try{tx.abort();}catch{}};try{unwatch=observation.watch(()=>abort(fail('native_import_aborted')));}catch(error){abort(error);}tx.onabort=()=>{unwatch();reject(failed?reason:fail('native_import_storage'));};tx.onerror=()=>{};tx.oncomplete=()=>{unwatch();try{check();if(!result)throw fail();resolve(result);}catch(error){reject(error);}};const take=()=>{if(++ready!==2)return;try{check();const keys=values[1] as IDBValidKey[];if(keys.length!==1||keys[0]!=='record')throw fail();result=nativeImportInputRecord(values[0]);if(result.choice.database!==this.#name)throw fail();check();}catch(error){abort(error);}};
   try{if(store.keyPath!==null||store.autoIncrement||store.indexNames.length)throw fail();for(const[i,q]of[store.get('record'),store.getAllKeys()].entries())q.onsuccess=()=>{values[i]=q.result;take();};}catch(error){abort(error);}
  });}
 close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;if(this.#pending){this.#reject?.(fail('native_import_closed'));try{this.#request?.transaction?.abort();}catch{}}this.#cleanup=(async()=>{await this.#running?.catch(()=>{});if(this.#pending)throw fail('native_import_busy');this.#db?.close();this.#db=undefined;this.#policy=undefined;this.#cancellation.close();this.#closed=true;})().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
}
/** SDK-private existing-only construction. Absent storage aborts its upgrade;
 * the stored file is read only after exact outside-choice/hash admission. */
export function existingNativeImportInputStore(factory:IDBFactory,choice:SelectedNativeImportChoice,authority:()=>void,wasm:SharedArchiveIntegrityOptions['wasm'],signal?:AbortSignal):SelectedNativeImportInputStore{return new SelectedNativeImportInputStore(factory,choice.database,choice as unknown as SelectedNativeImportInputRecord,authority,wasm,signal,existingKey);}
