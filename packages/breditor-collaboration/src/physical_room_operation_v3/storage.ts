/** Actual retained connection custody, including unreturned/blocked opens.
 * A failed method never erases its raw handle before cleanup succeeds. No repair,
 * deletion, marker-based owner adoption or overwrite of an occupied destination. */
import {participantAuthority} from '../participant_backup/policy.js';
import {retainInternalFailureCause} from '../internal_failure_cause.js';
import {checkPhysicalOperationV3Record as record,checkPhysicalOperationV3Transition as transition,type PhysicalOperationV3Record} from './record.js';
import {physicalOperationV3Store as table,checkOperationV3Schema as schema,checkOperationV3Store as shape} from './storage_schema.js';
import {PhysicalOperationV3Cancellation} from './storage_cancellation.js';
import {physicalOperationV3Failure as fail,physicalOperationV3Known as known,physicalOperationV3Database as name} from './policy.js';
export class PhysicalOperationV3IntentStore{
 readonly #factory:IDBFactory;readonly #name:string;readonly #authority:()=>void;readonly #cancellation:PhysicalOperationV3Cancellation;
 #db:IDBDatabase|undefined;#changed=false;#pendingOpen=false;#rejectOpen:((reason:unknown)=>void)|undefined;#busy=false;#closing=false;#closed=false;#running:Promise<void>|undefined;#cleanup:Promise<void>|undefined;
 /** The coordinator reserves its actual namespace before constructing this
  * resource. Retain it in opening cleanup BEFORE calling create/open. */
 constructor(factory:IDBFactory,database:string,checkAuthority:()=>void,signal?:AbortSignal){this.#factory=factory;this.#name=name(database);this.#authority=participantAuthority(checkAuthority);this.#cancellation=new PhysicalOperationV3Cancellation(signal);}
 #check():void{if(this.#closed||this.#closing||this.#changed)throw fail('physical_operation_v3_closed');this.#cancellation.check();try{this.#authority();}catch(error){throw retainInternalFailureCause(fail('physical_operation_v3_authority'),error);}this.#cancellation.check();if(this.#closed||this.#closing||this.#changed)throw fail('physical_operation_v3_closed');}
 #attached(db:IDBDatabase):void{this.#db=db;db.onversionchange=()=>{this.#changed=true;db.close();};}
 #run<T>(work:()=>Promise<T>):Promise<T>{
  if(this.#closed||this.#closing)return Promise.reject(fail('physical_operation_v3_closed'));if(this.#busy)return Promise.reject(fail('physical_operation_v3_in_use'));this.#busy=true;let finish!:()=>void;this.#running=new Promise<void>(resolve=>{finish=resolve;});
  let task:Promise<T>;try{task=work();}catch(error){task=Promise.reject(error);}return task.finally(()=>{this.#busy=false;this.#running=undefined;finish();});
 }
 create(initial:PhysicalOperationV3Record):Promise<void>{return this.#run(()=>{const selected=record(initial);if(selected.database!==this.#name)throw fail('physical_operation_v3_diverged');return this.#open(selected);});}
 open():Promise<void>{return this.#run(()=>this.#open());}
 #open(initial?:PhysicalOperationV3Record):Promise<void>{
  this.#check();if(this.#db||this.#pendingOpen)throw fail('physical_operation_v3_in_use');
  return new Promise((resolve,reject)=>{
   const request=this.#factory.open(this.#name,...(initial?[1] as const:[]));this.#pendingOpen=true;this.#rejectOpen=reject;let created=false,missing=false,blocked=false,reason:Error|undefined,unwatch=()=>{};
   const abort=(error:unknown)=>{reason=known(error);try{request.transaction?.abort();}catch{}},done=()=>{this.#pendingOpen=false;this.#rejectOpen=undefined;unwatch();};
   try{unwatch=this.#cancellation.watch(()=>abort(fail('physical_operation_v3_aborted')));}catch(error){abort(error);}
   request.onupgradeneeded=event=>{this.#attached(request.result);try{this.#check();if(blocked)throw fail('physical_operation_v3_in_use');if(!initial){missing=true;request.transaction!.abort();return;}if(event.oldVersion!==0)throw fail('physical_operation_v3_exists');created=true;request.result.createObjectStore(table).add(initial,'state');}catch(error){abort(error);}};
   request.onerror=()=>{done();reject(reason??fail(missing?'physical_operation_v3_missing':request.error?.name==='VersionError'?'physical_operation_v3_exists':'physical_operation_v3_storage'));};
   request.onblocked=()=>{blocked=true;unwatch();reject(fail('physical_operation_v3_in_use'));};
   request.onsuccess=()=>{this.#attached(request.result);done();try{this.#check();if(blocked)throw fail('physical_operation_v3_in_use');if(initial&&!created)throw fail('physical_operation_v3_exists');schema(request.result);resolve();}catch(error){reject(known(error));}};
  });
 }
 read(expected?:PhysicalOperationV3Record):Promise<PhysicalOperationV3Record>{return this.#run(()=>this.#transaction('readonly',undefined,expected));}
 /** Fresh readonly access to this exact already-open connection. No old job
  * authority/cancellation, opening, repair, write or pending-phase adoption. */
 checkReadCurrent():void{if(this.#closed||this.#closing||this.#changed||!this.#db||globalThis.indexedDB!==this.#factory)throw fail('physical_operation_v3_closed');}
 readFresh(expected:PhysicalOperationV3Record,providedAuthority:()=>void,signal?:AbortSignal):Promise<PhysicalOperationV3Record>{return this.#run(async()=>{
  const authority=participantAuthority(providedAuthority),cancellation=new PhysicalOperationV3Cancellation(signal),check=()=>{this.checkReadCurrent();cancellation.check();authority();this.checkReadCurrent();cancellation.check();};
  try{return await this.#transaction('readonly',undefined,expected,check,cancellation);}finally{cancellation.close();}
 });}
 /** A lost acknowledgement is resolved by reading the exact before/after record
  * on retry; this write itself never blindly repeats or replaces unrelated data. */
 advance(before:PhysicalOperationV3Record,next:PhysicalOperationV3Record):Promise<void>{return this.#run(async()=>{const old=record(before),after=record(next,old);transition(old,after);await this.#transaction('readwrite',{before:old,after});});}
 #transaction(mode:IDBTransactionMode,write?:{before:PhysicalOperationV3Record;after:PhysicalOperationV3Record},expected?:PhysicalOperationV3Record,check:()=>void=()=>this.#check(),cancellation:PhysicalOperationV3Cancellation=this.#cancellation):Promise<PhysicalOperationV3Record>{
  check();const db=this.#db;if(!db)throw fail('physical_operation_v3_missing');schema(db);
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(table,mode),store=tx.objectStore(table);let value:PhysicalOperationV3Record|undefined,reason:Error|undefined,unwatch=()=>{};
   const abort=(error:unknown)=>{reason=known(error,'physical_operation_v3_diverged');try{tx.abort();}catch{}};
   try{unwatch=cancellation.watch(()=>abort(fail('physical_operation_v3_aborted')));}catch(error){abort(error);}
   tx.onabort=()=>{unwatch();reject(reason??fail());};tx.onerror=()=>{if(!reason)reason=fail();};
   tx.oncomplete=()=>{unwatch();try{check();if(!value)throw fail('physical_operation_v3_diverged');resolve(value);}catch(error){reject(known(error));}};
   try{shape(store);const count=store.count();count.onsuccess=()=>{try{check();if(count.result!==1)throw fail('physical_operation_v3_diverged');const get=store.get('state');get.onsuccess=()=>{try{check();value=record(get.result,expected);if(value.database!==this.#name)throw fail('physical_operation_v3_diverged');if(write){if(JSON.stringify(value)!==JSON.stringify(write.before))throw fail('physical_operation_v3_diverged');store.put(write.after,'state');value=write.after;}}catch(error){abort(error);}};}catch(error){abort(error);}};}catch(error){abort(error);}
  });
 }
 /** Wait for active I/O. A blocked late open stays reachable and refuses cleanup
  * until its actual request drains; callers retain this store for a retry. */
 close():Promise<void>{
  if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;
  // Closing cannot force a foreign connection or queued deletion to finish.
  // Refuse the observed open promptly, but retain its actual pending request so
  // rollback stays busy and a late upgrade can only abort, never publish data.
  if(this.#pendingOpen)this.#rejectOpen?.(fail('physical_operation_v3_closed'));
  this.#cleanup=(async()=>{await this.#running;if(this.#pendingOpen)throw fail('physical_operation_v3_in_use');if(this.#db){this.#db.close();this.#db=undefined;}this.#cancellation.close();this.#closed=true;})().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;
 }
}
