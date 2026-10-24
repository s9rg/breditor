/** Immutable whole-file retention. Creation writes schema, independently pinned
 * selection and literal Blob in ONE upgrade transaction. Existing namespaces
 * are never initialized, repaired or overwritten. A queued raw open remains
 * owned after public cancellation until its actual event and cleanup drain. */
import {PhysicalOperationV3Cancellation} from '../physical_room_operation_v3/storage_cancellation.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import type {PhysicalRoomRecordCutFile} from './contract.js';
import {recordCutSelection} from './archive.js';
import {fields,fail,MAX_ROOM_RECORD_CUT_BYTES} from './policy.js';
export interface RetainedRoomRecordCut extends PhysicalRoomRecordCutFile{readonly format:'breditor/retained-room-record-cut';readonly formatVersion:1}
export function retainedRoomRecordCut(value:unknown):RetainedRoomRecordCut{
 const r=fields(value,['format','formatVersion','selection','file']);if(r['format']!=='breditor/retained-room-record-cut'||r['formatVersion']!==1)throw fail('record_cut_integrity');const selection=recordCutSelection(r['selection']),file=archiveBlob(r['file'] as Blob,MAX_ROOM_RECORD_CUT_BYTES);if(file.size!==selection.bytes)throw fail('record_cut_integrity');return{format:'breditor/retained-room-record-cut',formatVersion:1,selection,file};
}
function schema(db:IDBDatabase):void{if(db.version!==1||db.objectStoreNames.length!==1||db.objectStoreNames[0]!=='cut')throw fail('record_cut_exists');}
function shape(store:IDBObjectStore):void{if(store.keyPath!==null||store.autoIncrement||store.indexNames.length)throw fail('record_cut_integrity');}
export class RoomRecordCutStore{
 readonly #factory;readonly #name;readonly #policy;readonly #cancellation;
 #db:IDBDatabase|undefined;#request:IDBOpenDBRequest|undefined;#pending=false;#reject:((e:unknown)=>void)|undefined;#changed=false;#closing=false;#closed=false;#running:Promise<unknown>|undefined;#cleanup:Promise<void>|undefined;
 constructor(factory:IDBFactory,name:string,check:()=>void,signal?:AbortSignal){this.#factory=factory;this.#name=name;this.#policy=check;this.#cancellation=new PhysicalOperationV3Cancellation(signal);}
 #check=():void=>{if(this.#closing||this.#closed||this.#changed)throw fail('record_cut_closed');if(globalThis.indexedDB!==this.#factory)throw fail('record_cut_policy');this.#cancellation.check();this.#policy();if(this.#closing||this.#closed||this.#changed)throw fail('record_cut_closed');};
 #attach(db:IDBDatabase):void{this.#db=db;db.onversionchange=()=>{this.#changed=true;db.close();};}
 #run<T>(work:()=>Promise<T>):Promise<T>{if(this.#running)return Promise.reject(fail('record_cut_busy'));let task:Promise<T>;try{task=work();}catch(e){task=Promise.reject(e);}this.#running=task;return task.finally(()=>{this.#running=undefined;});}
 open(initial?:RetainedRoomRecordCut):Promise<void>{return this.#run(()=>{
  this.#check();if(this.#pending||this.#db)throw fail('record_cut_busy');const selected=initial&&retainedRoomRecordCut(initial);this.#check();
  return new Promise<void>((resolve,reject)=>{const request=this.#factory.open(this.#name,...(selected?[1] as const:[]));let missing=false,blocked=false,reason:unknown,unwatch=()=>{};this.#request=request;this.#pending=true;this.#reject=reject;
   const abort=(e:unknown)=>{reason=e;if(request.transaction){try{request.transaction.abort();}catch{}}else reject(e);},done=()=>{this.#pending=false;this.#request=undefined;this.#reject=undefined;unwatch();};
   try{unwatch=this.#cancellation.watch(()=>abort(fail('record_cut_aborted')));}catch(e){abort(e);}
   request.onupgradeneeded=event=>{this.#attach(request.result);try{this.#check();if(blocked)throw fail('record_cut_busy');if(!selected){missing=true;request.transaction!.abort();return;}if(event.oldVersion!==0)throw fail('record_cut_exists');const store=request.result.createObjectStore('cut');store.add(selected,'record');this.#check();}catch(e){abort(e);}};
   request.onblocked=()=>{blocked=true;unwatch();reject(fail('record_cut_busy'));};request.onerror=()=>{done();reject(reason??fail(missing?'record_cut_missing':'record_cut_storage'));};
   request.onsuccess=()=>{this.#attach(request.result);done();try{this.#check();if(blocked)throw fail('record_cut_busy');schema(request.result);resolve();}catch(e){reject(e);}};
  });
 });}
 read():Promise<RetainedRoomRecordCut>{return this.#run(()=>{
  this.#check();const db=this.#db;if(!db)throw fail('record_cut_missing');schema(db);
  return new Promise((resolve,reject)=>{const tx=db.transaction('cut','readonly'),store=tx.objectStore('cut');let reason:unknown,result:RetainedRoomRecordCut|undefined,ready=0,unwatch=()=>{};const values:unknown[]=[];
   const abort=(e:unknown)=>{reason=e;try{tx.abort();}catch{}};try{unwatch=this.#cancellation.watch(()=>abort(fail('record_cut_aborted')));}catch(e){abort(e);}
   tx.onabort=()=>{unwatch();reject(reason??fail('record_cut_storage'));};tx.onerror=()=>{};tx.oncomplete=()=>{unwatch();try{this.#check();if(!result)throw fail('record_cut_integrity');resolve(result);}catch(e){reject(e);}};
   const take=()=>{if(++ready!==2)return;try{this.#check();const keys=values[1] as IDBValidKey[];if(keys.length!==1||keys[0]!=='record')throw fail('record_cut_integrity');result=retainedRoomRecordCut(values[0]);this.#check();}catch(e){abort(e);}};
   try{shape(store);for(const[i,q]of[store.get('record'),store.getAllKeys()].entries())q.onsuccess=()=>{values[i]=q.result;take();};}catch(e){abort(e);}
  });
 });}
 /** No grant or current factory is needed to retire the actual owned handle.
  * Busy means its raw request is still pending, not that cleanup succeeded. */
 close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;if(this.#pending){this.#reject?.(fail('record_cut_closed'));try{this.#request?.transaction?.abort();}catch{}}this.#cleanup=(async()=>{await this.#running?.catch(()=>{});if(this.#pending)throw fail('record_cut_busy');this.#db?.close();this.#db=undefined;this.#cancellation.close();this.#closed=true;})().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
}
