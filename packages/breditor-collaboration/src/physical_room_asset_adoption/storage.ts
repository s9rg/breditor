/** Absent-only selection and complete immutable base bytes in one transaction.
 * Ordered state writes compare the actual predecessor AND every retained byte.
 * Failed/blocked raw openings stay reachable until their real cleanup finishes. */
import {PhysicalOperationV3Cancellation} from '../physical_room_operation_v3/storage_cancellation.js';
import {adoptionRecord,adoptionTransition} from './record.js';
import type {RoomAssetAdoptionRecord} from './contract.js';
import {fail} from './policy.js';
export type AdoptionFiles=ReadonlyMap<string,ArrayBuffer>;
const tables=['bases','selection'];
function schema(db:IDBDatabase):void{if(db.version!==1||[...db.objectStoreNames].join(',')!==tables.join(','))throw fail('asset_adoption_diverged');}
function shape(s:IDBObjectStore):void{if(s.keyPath!==null||s.autoIncrement||s.indexNames.length)throw fail('asset_adoption_diverged');}
export function sameAdoptionBytes(a:unknown,b:ArrayBuffer):boolean{if(!(a instanceof ArrayBuffer)||a.byteLength!==b.byteLength)return false;const x=new Uint8Array(a),y=new Uint8Array(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return false;return true;}
export class RoomAssetAdoptionStore {
 readonly #factory;readonly #name;readonly #checkPolicy;readonly #cancellation;
 #db:IDBDatabase|undefined;#request:IDBOpenDBRequest|undefined;#changed=false;#pending=false;#reject:((e:unknown)=>void)|undefined;#closed=false;#closing=false;#running:Promise<unknown>|undefined;#cleanup:Promise<void>|undefined;
 constructor(factory:IDBFactory,name:string,check:()=>void,signal?:AbortSignal){this.#factory=factory;this.#name=name;this.#checkPolicy=check;this.#cancellation=new PhysicalOperationV3Cancellation(signal);}
 #check=():void=>{if(this.#closed||this.#closing||this.#changed||globalThis.indexedDB!==this.#factory)throw fail('asset_adoption_closed');this.#cancellation.check();this.#checkPolicy();if(this.#closed||this.#closing||this.#changed)throw fail('asset_adoption_closed');};
 #attach(db:IDBDatabase):void{this.#db=db;db.onversionchange=()=>{this.#changed=true;db.close();};}
 #run<T>(work:()=>Promise<T>):Promise<T>{if(this.#running)return Promise.reject(fail('asset_adoption_busy'));let task:Promise<T>;try{task=work();}catch(e){task=Promise.reject(e);}this.#running=task;return task.finally(()=>{this.#running=undefined;});}
 open(initial?:Readonly<{record:RoomAssetAdoptionRecord;files:AdoptionFiles}>,guard:()=>void=this.#check):Promise<void>{return this.#run(()=>{
  this.#check();guard();if(this.#db||this.#pending)throw fail('asset_adoption_busy');
  return new Promise<void>((resolve,reject)=>{const request=this.#factory.open(this.#name,...(initial?[1] as const:[]));let created=false,missing=false,blocked=false,reason:unknown,unwatch=()=>{};this.#request=request;this.#pending=true;this.#reject=reject;
   const abort=(e:unknown)=>{reason=e;const tx=request.transaction;if(tx){try{tx.abort();}catch{}}else{
    // A request queued behind foreign work has no transaction to abort. Refuse
    // the public operation now, but retain the actual raw request until its
    // eventual event drains. Cleanup remains busy and a late upgrade refuses.
    reject(e);
   }},done=()=>{this.#pending=false;this.#request=undefined;this.#reject=undefined;unwatch();};
   try{unwatch=this.#cancellation.watch(()=>abort(fail('asset_adoption_aborted')));}catch(e){abort(e);}
   request.onupgradeneeded=event=>{this.#attach(request.result);try{this.#check();guard();if(blocked)throw fail('asset_adoption_busy');if(!initial){missing=true;request.transaction!.abort();return;}if(event.oldVersion!==0)throw fail('asset_adoption_exists');const record=adoptionRecord(initial.record);if(record.database!==this.#name||initial.files.size!==record.participants.length)throw fail('asset_adoption_diverged');const bases=request.result.createObjectStore('bases'),state=request.result.createObjectStore('selection');
    for(const row of record.participants){guard();const bytes=initial.files.get(row.id);if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==row.base.bytes)throw fail('asset_adoption_diverged');bases.add(bytes,row.id);guard();}state.add(record,'state');guard();created=true;
   }catch(e){abort(e);}};
   request.onblocked=()=>{blocked=true;unwatch();reject(fail('asset_adoption_busy'));};request.onerror=()=>{done();reject(reason??fail(missing?'asset_adoption_missing':'asset_adoption_storage'));};
   request.onsuccess=()=>{this.#attach(request.result);done();try{this.#check();guard();if(blocked)throw fail('asset_adoption_busy');if(initial&&!created)throw fail('asset_adoption_exists');schema(request.result);resolve();}catch(e){reject(e);}};
  });
 });}
 read(guard:()=>void=this.#check):Promise<{record:RoomAssetAdoptionRecord;files:AdoptionFiles}>{return this.#run(()=>this.#transaction(guard));}
 advance(before:RoomAssetAdoptionRecord,after:RoomAssetAdoptionRecord,files:AdoptionFiles,guard:()=>void):Promise<void>{return this.#run(async()=>{adoptionTransition(before,after);await this.#transaction(guard,{before,after,files});});}
 #transaction(guard:()=>void,write?:Readonly<{before:RoomAssetAdoptionRecord;after:RoomAssetAdoptionRecord;files:AdoptionFiles}>):Promise<{record:RoomAssetAdoptionRecord;files:AdoptionFiles}>{
  this.#check();guard();const db=this.#db;if(!db)throw fail('asset_adoption_missing');schema(db);
  return new Promise((resolve,reject)=>{const tx=db.transaction(tables,write?'readwrite':'readonly'),bases=tx.objectStore('bases'),state=tx.objectStore('selection');let reason:unknown,result:{record:RoomAssetAdoptionRecord;files:AdoptionFiles}|undefined,count=0;const values:unknown[]=[];let unwatch=()=>{};
   const abort=(e:unknown)=>{reason=e;try{tx.abort();}catch{}};
   try{unwatch=this.#cancellation.watch(()=>abort(fail('asset_adoption_aborted')));}catch(e){abort(e);}
   tx.onabort=()=>{unwatch();reject(reason??fail());};tx.onerror=()=>{};tx.oncomplete=()=>{unwatch();try{this.#check();guard();if(!result)throw fail('asset_adoption_diverged');resolve(result);}catch(e){reject(e);}};
   const ready=()=>{if(++count!==4)return;try{this.#check();guard();const[raw,keys,names,files]=values as[unknown,IDBValidKey[],IDBValidKey[],unknown[]],record=adoptionRecord(raw);if(record.database!==this.#name||keys.length!==1||keys[0]!=='state'||names.length!==record.participants.length||files.length!==names.length)throw fail('asset_adoption_diverged');const held=new Map<string,ArrayBuffer>();
    for(const[i,row]of record.participants.entries()){const bytes=files[i];if(names[i]!==row.id||!(bytes instanceof ArrayBuffer)||bytes.byteLength!==row.base.bytes)throw fail('asset_adoption_diverged');held.set(row.id,bytes);}
    if(write){if(JSON.stringify(record)!==JSON.stringify(write.before)||write.files.size!==held.size||[...held].some(([id,bytes])=>!sameAdoptionBytes(write.files.get(id),bytes)))throw fail('asset_adoption_diverged');guard();state.put(write.after,'state');result={record:write.after,files:held};}else result={record,files:held};
   }catch(e){abort(e);}};
   try{shape(bases);shape(state);for(const[i,r]of[state.get('state'),state.getAllKeys(),bases.getAllKeys(),bases.getAll()].entries())r.onsuccess=()=>{values[i]=r.result;ready();};}catch(e){abort(e);}
  });
 }
 close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;if(this.#pending){this.#reject?.(fail('asset_adoption_closed'));try{this.#request?.transaction?.abort();}catch{}}this.#cleanup=(async()=>{await this.#running?.catch(()=>{});if(this.#pending)throw fail('asset_adoption_busy');this.#db?.close();this.#db=undefined;this.#cancellation.close();this.#closed=true;})().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
}
