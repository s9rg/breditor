/** Absent-only START and append-only metadata CAS. The immutable execution
 * file stays in its original one-row store. Commit uncertainty is resolved by
 * a fresh exact read, never overwrite or trusting a previous return value. */
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {PhysicalOperationV3Cancellation} from '../physical_room_operation_v3/storage_cancellation.js';
import {fields,hash,fail} from './policy.js';
import {unionRunIdentity,unionRunEvent,MAX_UNION_RUN_EVENTS} from './identity.js';
import {decodeNativeRoomUnionRun,unionRunTables,type NativeRoomUnionRunRaw,type NativeRoomUnionRunTable} from './journal_rows.js';
import type {NativeRoomUnionRunIdentity,NativeRoomUnionRunSnapshot,NativeRoomUnionRunStoredEvent,NativeRoomUnionRunStage,NativeRoomUnionRunHandoff} from './contract.js';
interface Witness {readonly raw:NativeRoomUnionRunRaw;readonly signature:string;readonly sequence:number;readonly sha256:string}
function schema(db:IDBDatabase) {
 if(db.version!==1||JSON.stringify([...db.objectStoreNames])!==JSON.stringify(unionRunTables))throw fail('room_union_run_exists');
}
export class NativeRoomUnionRunJournalStore {
 readonly #factory;readonly #identity;readonly #wasm;readonly #authority;readonly #cancel;
 readonly #witnesses=new WeakMap<object,Witness>();
 #db:IDBDatabase|undefined;#changed=false;#closing=false;#closed=false;
 #pending=false;#request:IDBOpenDBRequest|undefined;#reject:((reason:unknown)=>void)|undefined;
 #running:Promise<unknown>|undefined;#cleanup:Promise<void>|undefined;
 constructor(factory:IDBFactory,identity:NativeRoomUnionRunIdentity,options:SharedArchiveIntegrityOptions) {
  this.#factory=factory;this.#identity=unionRunIdentity(identity);this.#wasm=options.wasm;
  this.#authority=participantAuthority(options.checkAuthority);this.#cancel=new PhysicalOperationV3Cancellation(options.signal);Object.freeze(this);
 }
 checkCurrent=()=>{if(this.#closing||this.#closed||this.#changed||globalThis.indexedDB!==this.#factory)throw fail('room_union_run_closed');};
 #check=()=>{this.checkCurrent();this.#cancel.check();this.#authority();this.checkCurrent();this.#cancel.check();};
 #context(){return prepareArchiveIntegrity({wasm:this.#wasm,checkAuthority:this.#check});}
 #run<T>(work:()=>Promise<T>):Promise<T>{this.checkCurrent();if(this.#running)throw fail('room_union_run_busy');const task=Promise.resolve().then(work);this.#running=task;return task.finally(()=>{this.#running=undefined;});}
 #attach(db:IDBDatabase){this.#db=db;db.onversionchange=()=>{this.#changed=true;db.close();};}
 open(create:boolean):Promise<NativeRoomUnionRunSnapshot>{return this.#run(async()=>{
  this.#check();if(typeof create!=='boolean'||this.#pending||this.#db)throw fail('room_union_run_busy');
  const context=this.#context(),execution=await context.digest(new Blob([JSON.stringify(this.#identity)]));
  const event=unionRunEvent({format:'breditor/native-room-union-run-event',formatVersion:1,execution,sequence:0,previous:null,stage:'start',handoff:null});
  const row:NativeRoomUnionRunStoredEvent={event,sha256:await context.digest(new Blob([JSON.stringify(event)]))};this.#check();
  await new Promise<void>((resolve,reject)=>{
   const q=this.#factory.open(this.#identity.database,1);let created=false,blocked=false,failed=false,reason:unknown,unwatch=()=>{};
   this.#pending=true;this.#request=q;this.#reject=reject;
   const abort=(error:unknown)=>{failed=true;reason=error;if(q.transaction){try{q.transaction.abort();}catch{}}else reject(error);};
   const done=()=>{this.#pending=false;this.#request=undefined;this.#reject=undefined;unwatch();};
   try{unwatch=this.#cancel.watch(()=>abort(fail('room_union_run_aborted')));}catch(error){abort(error);}
   q.onupgradeneeded=event=>{this.#attach(q.result);try{
    this.#check();if(blocked||failed)throw fail('room_union_run_busy');
    if(event.oldVersion!==0)throw fail('room_union_run_exists');if(!create)throw fail('room_union_run_missing');
    for(const table of unionRunTables)q.result.createObjectStore(table);
    q.transaction!.objectStore('intent').add(this.#identity,'record');q.transaction!.objectStore('events').add(row,0);created=true;this.#check();
   }catch(error){abort(error);}};
   q.onblocked=()=>{blocked=true;unwatch();reject(fail('room_union_run_busy'));};
   q.onerror=()=>{done();reject(failed?reason:fail('room_union_run_storage'));};
   q.onsuccess=()=>{this.#attach(q.result);done();try{this.#check();if(blocked||failed)throw fail('room_union_run_busy');if(create&&!created)throw fail('room_union_run_exists');schema(q.result);resolve();}catch(error){reject(error);}};
  });return this.#load();
 });}
 /** Count every table before bounded reads in the same transaction. */
 #requests(tx:IDBTransaction,done:(raw:NativeRoomUnionRunRaw)=>void,abort:(error:unknown)=>void) {
  const counts:Partial<Record<NativeRoomUnionRunTable,number>>={},result:Partial<Record<NativeRoomUnionRunTable,{keys:IDBValidKey[];values:unknown[]}>>={};let counted=0,read=0;
  try{for(const name of unionRunTables){const store=tx.objectStore(name);if(store.keyPath!==null||store.autoIncrement||store.indexNames.length)throw fail();
   const q=store.count();q.onsuccess=()=>{try{this.#check();counts[name]=q.result;if(++counted!==2)return;
    if(counts.intent!==1||!counts.events||counts.events>MAX_UNION_RUN_EVENTS)throw fail();
    for(const name of unionRunTables){const store=tx.objectStore(name),row={keys:[] as IDBValidKey[],values:[] as unknown[]};result[name]=row;
     const keys=store.getAllKeys(undefined,name==='intent'?2:MAX_UNION_RUN_EVENTS+1),values=store.getAll(undefined,name==='intent'?2:MAX_UNION_RUN_EVENTS+1);
     keys.onsuccess=()=>{try{this.#check();row.keys=keys.result;if(++read===4)done(result as NativeRoomUnionRunRaw);}catch(error){abort(error);}};
     values.onsuccess=()=>{try{this.#check();row.values=values.result;if(++read===4)done(result as NativeRoomUnionRunRaw);}catch(error){abort(error);}};
    }
   }catch(error){abort(error);}};
  }}catch(error){abort(error);}
 }
 #raw():Promise<NativeRoomUnionRunRaw>{this.#check();if(!this.#db)throw fail('room_union_run_closed');schema(this.#db);return new Promise((resolve,reject)=>{
  const tx=this.#db!.transaction([...unionRunTables],'readonly');let result:NativeRoomUnionRunRaw|undefined,failed=false,reason:unknown,unwatch=()=>{};
  const abort=(error:unknown)=>{failed=true;reason=error;try{tx.abort();}catch{}};
  try{unwatch=this.#cancel.watch(()=>abort(fail('room_union_run_aborted')));}catch(error){abort(error);}
  tx.onerror=()=>{};tx.onabort=()=>{unwatch();reject(failed?reason:fail('room_union_run_storage'));};
  tx.oncomplete=()=>{unwatch();try{this.#check();if(!result)throw fail();resolve(result);}catch(error){reject(error);}};
  this.#requests(tx,raw=>{result=raw;},abort);
 });}
 async #load():Promise<NativeRoomUnionRunSnapshot>{const raw=await this.#raw(),data=decodeNativeRoomUnionRun(raw,this.#identity),context=this.#context();
  if(data.execution!==await context.digest(new Blob([JSON.stringify(this.#identity)])))throw fail();
  for(const row of data.events)if(await context.digest(new Blob([JSON.stringify(row.event)]))!==row.sha256)throw fail();this.#check();
  const last=data.events.at(-1)!,snapshot:NativeRoomUnionRunSnapshot=Object.freeze({identity:data.identity,execution:data.execution,head:Object.freeze({sequence:last.event.sequence,sha256:last.sha256}),events:data.events});
  this.#witnesses.set(snapshot,{raw,signature:data.signature,sequence:last.event.sequence,sha256:last.sha256});return snapshot;
 }
 read():Promise<NativeRoomUnionRunSnapshot>{return this.#run(()=>this.#load());}
 append(before:NativeRoomUnionRunSnapshot,stage:Exclude<NativeRoomUnionRunStage,'start'>,handoff:NativeRoomUnionRunHandoff|null=null):Promise<NativeRoomUnionRunSnapshot>{return this.#run(async()=>{
  const witness=this.#witnesses.get(before);if(!witness)throw fail('room_union_run_policy');const sequence=witness.sequence+1;
  if(sequence>=MAX_UNION_RUN_EVENTS)throw fail('room_union_run_budget');const context=this.#context();
  const event=unionRunEvent({format:'breditor/native-room-union-run-event',formatVersion:1,execution:before.execution,sequence,previous:witness.sha256,stage,handoff});
  const row:NativeRoomUnionRunStoredEvent={event,sha256:await context.digest(new Blob([JSON.stringify(event)]))};
  decodeNativeRoomUnionRun({intent:witness.raw.intent,events:{keys:[...witness.raw.events.keys,sequence],values:[...witness.raw.events.values,row]}},this.#identity);this.#check();
  if(!this.#db)throw fail('room_union_run_closed');schema(this.#db);
  await new Promise<void>((resolve,reject)=>{const tx=this.#db!.transaction([...unionRunTables],'readwrite');let failed=false,reason:unknown,written=false,unwatch=()=>{};
   const abort=(error:unknown)=>{failed=true;reason=error;try{tx.abort();}catch{}};
   try{unwatch=this.#cancel.watch(()=>abort(fail('room_union_run_aborted')));}catch(error){abort(error);}
   tx.onerror=()=>{};tx.onabort=()=>{unwatch();reject(failed?reason:fail('room_union_run_storage'));};
   tx.oncomplete=()=>{unwatch();try{this.#check();if(!written)throw fail();resolve();}catch(error){reject(error);}};
   this.#requests(tx,raw=>{try{this.#check();if(decodeNativeRoomUnionRun(raw,this.#identity).signature!==witness.signature)throw fail();tx.objectStore('events').add(row,sequence);written=true;this.#check();}catch(error){abort(error);}},abort);
  });const after=await this.#load();if(after.head.sequence!==sequence||after.head.sha256!==row.sha256)throw fail();return after;
 });}
 close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;
  if(this.#pending){this.#reject?.(fail('room_union_run_closed'));try{this.#request?.transaction?.abort();}catch{}}
  this.#cleanup=(async()=>{await this.#running?.catch(()=>{});if(this.#pending)throw fail('room_union_run_busy');this.#db?.close();this.#db=undefined;this.#cancel.close();this.#closed=true;})().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;
 }
}
