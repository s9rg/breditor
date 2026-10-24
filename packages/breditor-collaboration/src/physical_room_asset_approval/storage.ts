/** Atomic absent-only approval evidence. Existing bytes are compared on retry,
 * never put/initialized/repaired. A queued raw open remains owned until drain. */
import {PhysicalOperationV3Cancellation} from '../physical_room_operation_v3/storage_cancellation.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {fields,fail} from '../physical_room_asset_adoption/policy.js';
import {approvalSelection,MAX_ROOM_ASSET_APPROVAL_BYTES} from './choice.js';
import type {RoomAssetApprovalSelection} from './contract.js';
export interface RetainedRoomAssetApproval{readonly format:'breditor/retained-room-asset-approval';readonly formatVersion:1;readonly selection:RoomAssetApprovalSelection;readonly file:Blob}
export function retainedRoomAssetApproval(value:unknown):RetainedRoomAssetApproval{const r=fields(value,['format','formatVersion','selection','file']);if(r['format']!=='breditor/retained-room-asset-approval'||r['formatVersion']!==1)throw fail('asset_adoption_diverged');const selection=approvalSelection(r['selection']),file=archiveBlob(r['file'] as Blob,MAX_ROOM_ASSET_APPROVAL_BYTES);if(file.size!==selection.bytes)throw fail('asset_adoption_diverged');return{format:'breditor/retained-room-asset-approval',formatVersion:1,selection,file};}
function schema(db:IDBDatabase){if(db.version!==1||db.objectStoreNames.length!==1||db.objectStoreNames[0]!=='approval')throw fail('asset_adoption_exists');}
export class RoomAssetApprovalStore{
 readonly #factory;readonly #name;readonly #policy;readonly #cancellation;
 #db:IDBDatabase|undefined;#request:IDBOpenDBRequest|undefined;#pending=false;#reject:((e:unknown)=>void)|undefined;#changed=false;#closing=false;#closed=false;#running:Promise<unknown>|undefined;#cleanup:Promise<void>|undefined;
 constructor(factory:IDBFactory,name:string,check:()=>void,signal?:AbortSignal){this.#factory=factory;this.#name=name;this.#policy=check;this.#cancellation=new PhysicalOperationV3Cancellation(signal);}
 #check=()=>{if(this.#closed||this.#closing||this.#changed)throw fail('asset_adoption_closed');if(globalThis.indexedDB!==this.#factory)throw fail('asset_adoption_policy');this.#cancellation.check();this.#policy();if(this.#closed||this.#closing||this.#changed)throw fail('asset_adoption_closed');};
 #attach(db:IDBDatabase){this.#db=db;db.onversionchange=()=>{this.#changed=true;db.close();};}
 #run<T>(work:()=>Promise<T>):Promise<T>{if(this.#running)return Promise.reject(fail('asset_adoption_busy'));let task:Promise<T>;try{task=work();}catch(e){task=Promise.reject(e);}this.#running=task;return task.finally(()=>{this.#running=undefined;});}
 open(initial?:RetainedRoomAssetApproval):Promise<void>{return this.#run(()=>{
  this.#check();if(this.#pending||this.#db)throw fail('asset_adoption_busy');const selected=initial&&retainedRoomAssetApproval(initial);this.#check();
  return new Promise((resolve,reject)=>{const q=this.#factory.open(this.#name,...(selected?[1] as const:[]));let missing=false,blocked=false,reason:unknown,unwatch=()=>{};this.#pending=true;this.#request=q;this.#reject=reject;const abort=(e:unknown)=>{reason=e;if(q.transaction){try{q.transaction.abort();}catch{}}else reject(e);},done=()=>{this.#pending=false;this.#request=undefined;this.#reject=undefined;unwatch();};try{unwatch=this.#cancellation.watch(()=>abort(fail('asset_adoption_aborted')));}catch(e){abort(e);}
   q.onupgradeneeded=event=>{this.#attach(q.result);try{this.#check();if(blocked)throw fail('asset_adoption_busy');if(!selected){missing=true;q.transaction!.abort();return;}if(event.oldVersion!==0)throw fail('asset_adoption_exists');q.result.createObjectStore('approval').add(selected,'record');this.#check();}catch(e){abort(e);}};q.onblocked=()=>{blocked=true;unwatch();reject(fail('asset_adoption_busy'));};q.onerror=()=>{done();reject(reason??fail(missing?'asset_adoption_missing':'asset_adoption_storage'));};q.onsuccess=()=>{this.#attach(q.result);done();try{this.#check();if(blocked)throw fail('asset_adoption_busy');schema(q.result);resolve();}catch(e){reject(e);}};
  });
 });}
 read():Promise<RetainedRoomAssetApproval>{return this.#run(()=>{
  this.#check();const db=this.#db;if(!db)throw fail('asset_adoption_missing');schema(db);return new Promise((resolve,reject)=>{const tx=db.transaction('approval','readonly'),store=tx.objectStore('approval');let reason:unknown,result:RetainedRoomAssetApproval|undefined,ready=0,unwatch=()=>{};const values:unknown[]=[];const abort=(e:unknown)=>{reason=e;try{tx.abort();}catch{}};try{unwatch=this.#cancellation.watch(()=>abort(fail('asset_adoption_aborted')));}catch(e){abort(e);}tx.onabort=()=>{unwatch();reject(reason??fail());};tx.onerror=()=>{};tx.oncomplete=()=>{unwatch();try{this.#check();if(!result)throw fail('asset_adoption_diverged');resolve(result);}catch(e){reject(e);}};const take=()=>{if(++ready!==2)return;try{this.#check();const keys=values[1] as IDBValidKey[];if(keys.length!==1||keys[0]!=='record')throw fail('asset_adoption_diverged');result=retainedRoomAssetApproval(values[0]);this.#check();}catch(e){abort(e);}};
   try{if(store.keyPath!==null||store.autoIncrement||store.indexNames.length)throw fail('asset_adoption_diverged');for(const[i,q]of[store.get('record'),store.getAllKeys()].entries())q.onsuccess=()=>{values[i]=q.result;take();};}catch(e){abort(e);}
  });
 });}
 close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;if(this.#pending){this.#reject?.(fail('asset_adoption_closed'));try{this.#request?.transaction?.abort();}catch{}}this.#cleanup=(async()=>{await this.#running?.catch(()=>{});if(this.#pending)throw fail('asset_adoption_busy');this.#db?.close();this.#db=undefined;this.#cancellation.close();this.#closed=true;})().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
}
