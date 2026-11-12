/** Actual selected-record I/O, namespace custody and pending-request cleanup.
 * Existing data is NEVER put/replaced: only missing keys are added atomically.
 * Blob comparisons happen in complete reads before/after, outside transactions. */
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {RecoveryLease,checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {participantAuthority} from '../participant_backup/policy.js';import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {storageDatabase,readStorageSchema,sameStorageSchema} from './database_shape.js';import {selectedStorageKey,storageKey} from './keys.js';import {storageFingerprint} from './fingerprint.js';
import {fail,equal,MAX_STORAGE_RECORDS,MAX_STORAGE_DATABASES} from './policy.js';
import type {StorageDatabasePlan,StorageDatabase,StorageStore,StorageDestination} from './contract.js';
export class StorageDatabaseJob{
 readonly #factory=recoveryOpeningContext();readonly #locks=navigator.locks;readonly #options;readonly #authority;readonly #custodies:RecoveryOpeningCustody[]=[];readonly #leases:RecoveryLease[]=[];
 #db:IDBDatabase|undefined;#pending=false;#request:IDBOpenDBRequest|undefined;#reject:((error:unknown)=>void)|undefined;#running:Promise<unknown>|undefined;#closing=false;#closed=false;#changed=false;#ending:Promise<void>|undefined;#releasing:Promise<void>|undefined;
 constructor(options:SharedArchiveIntegrityOptions){this.#options={...options};this.#authority=participantAuthority(options.checkAuthority);Object.freeze(this);}
 check=()=>{if(this.#closing||this.#closed||this.#changed||globalThis.indexedDB!==this.#factory||globalThis.navigator?.locks!==this.#locks)throw fail('room_storage_closed');checkRecoveryLeasesHeld(this.#leases);};
 #guard=()=>{this.check();if(this.#options.signal?.aborted)throw fail('room_storage_aborted');this.#authority();this.check();if(this.#options.signal?.aborted)throw fail('room_storage_aborted');};
 #run<T>(work:()=>Promise<T>):Promise<T>{this.check();if(this.#running||this.#pending)throw fail('room_storage_busy');const task=Promise.resolve().then(work);this.#running=task;return task.finally(()=>{this.#running=undefined;});}
 #integrity():SharedArchiveIntegrityOptions{return{...this.#options,checkAuthority:this.#guard};}
 reserve(names:readonly string[]):Promise<void>{const selected=[...names];return this.#run(async()=>{this.#guard();if(this.#custodies.length||this.#leases.length||selected.length>MAX_STORAGE_DATABASES||new Set(selected).size!==selected.length||selected.some(x=>typeof x!=='string'||!x.length))throw fail('room_storage_policy');selected.sort();for(let i=0;i<selected.length;i+=16){this.#custodies.push(await RecoveryOpeningCustody.reserve(this.#factory,selected.slice(i,i+16),()=>this.#dispose(),{policy:()=>fail('room_storage_policy'),busy:()=>fail('room_storage_busy'),storage:()=>fail('room_storage_storage')}));this.#guard();}for(const name of selected){this.#leases.push(await RecoveryLease.acquire(JSON.stringify(name)));this.#guard();}});}
 #detach(){this.#db?.close();this.#db=undefined;}
 #attach(db:IDBDatabase){this.#db=db;db.onversionchange=()=>{this.#changed=true;db.close();};}
 async #open(plan:StorageDatabasePlan,create?:StorageDatabase):Promise<boolean>{this.#guard();return new Promise((resolve,reject)=>{const q=this.#factory.open(plan.database,1);let absent=false,created=false,failed=false,reason:unknown;this.#pending=true;this.#request=q;this.#reject=reject;const abort=(error:unknown)=>{failed=true;reason=error;try{q.transaction?.abort();}catch{}};const done=()=>{this.#pending=false;this.#request=undefined;this.#reject=undefined;};
  q.onupgradeneeded=event=>{this.#attach(q.result);try{this.#guard();if(failed||event.oldVersion!==0)throw fail('room_storage_exists');if(!create){absent=true;q.transaction!.abort();return;}for(const row of create.stores){const s=q.result.createObjectStore(row.name,{keyPath:row.keyPath===null?null:Array.isArray(row.keyPath)?[...row.keyPath]:row.keyPath as string,autoIncrement:false});for(const index of row.indexes)s.createIndex(index.name,Array.isArray(index.keyPath)?[...index.keyPath]:index.keyPath as string,{unique:index.unique,multiEntry:index.multiEntry});this.#add(s,row,row.keys.map((_,i)=>i),abort);}created=true;this.#guard();}catch(error){abort(error);}};
  q.onblocked=()=>{failed=true;reason=fail('room_storage_busy');reject(reason);};q.onerror=()=>{done();this.#detach();try{this.#guard();if(failed)throw reason;if(absent&&!create){resolve(false);return;}throw fail('room_storage_storage');}catch(error){reject(error);}};
  q.onsuccess=()=>{this.#attach(q.result);done();try{this.#guard();if(failed)throw reason;if(create&&!created)throw fail('room_storage_exists');resolve(true);}catch(error){this.#detach();reject(error);}};
 });}
 #schema(plan:StorageDatabasePlan){const db=this.#db!;if(db.version!==1||plan.stores.some(name=>!db.objectStoreNames.contains(name))||plan.stores[0]!=='journals'&&!equal([...db.objectStoreNames],plan.stores))throw fail('room_storage_schema');}
 #read(plan:StorageDatabasePlan):Promise<StorageDatabase>{this.#guard();this.#schema(plan);return new Promise((resolve,reject)=>{const tx=this.#db!.transaction([...plan.stores],'readonly'),stores:StorageStore[]=[],names=plan.stores;let complete=0,failed=false,reason:unknown;const abort=(error:unknown)=>{failed=true;reason=error;try{tx.abort();}catch{}};tx.onerror=()=>{};tx.onabort=()=>reject(failed?reason:fail('room_storage_storage'));tx.oncomplete=()=>{try{this.#guard();if(complete!==names.length)throw fail();resolve(storageDatabase({database:plan.database,version:1,stores},plan));}catch(error){reject(error);}};
  try{for(const name of names){const s=tx.objectStore(name);const row={...readStorageSchema(s),keys:[] as IDBValidKey[],values:[] as unknown[]};stores.push(row);const accept=(keys:IDBValidKey[],values:unknown[])=>{row.keys=keys;row.values=values;complete++;};
   if(plan.selection.kind==='whole'){const count=s.count();count.onsuccess=()=>{try{this.#guard();if(count.result>MAX_STORAGE_RECORDS)throw fail('room_storage_budget');const keys=s.getAllKeys(undefined,MAX_STORAGE_RECORDS+1),values=s.getAll(undefined,MAX_STORAGE_RECORDS+1);let n=0;const done=()=>{if(++n!==2)return;try{this.#guard();if(keys.result.length!==count.result||values.result.length!==count.result)throw fail();accept(keys.result,values.result);}catch(error){abort(error);}};keys.onsuccess=done;values.onsuccess=done;}catch(error){abort(error);}};
   }else{const keys:IDBValidKey[]=[],values:unknown[]=[];const read=()=>{if(!keys.length){accept(keys,values);return;}let left=keys.length;for(let i=0;i<keys.length;i++){const q=s.get(keys[i]!);q.onsuccess=()=>{try{this.#guard();values[i]=q.result;if(--left===0)accept(keys,values);}catch(error){abort(error);}};}};
    if(plan.selection.kind==='keys'){let left=plan.selection.keys.length;if(!left){accept(keys,values);continue;}for(const key of plan.selection.keys){const q=s.getKey(key);q.onsuccess=()=>{try{this.#guard();if(q.result!==undefined)keys.push(q.result);if(--left===0)read();}catch(error){abort(error);}};}
    }else{let scanned=0;const q=s.openKeyCursor();q.onsuccess=()=>{try{this.#guard();const cursor=q.result;if(!cursor){read();return;}if(++scanned>1000000)throw fail('room_storage_budget');if(selectedStorageKey(cursor.primaryKey,plan.selection)){if(keys.length>=MAX_STORAGE_RECORDS)throw fail('room_storage_budget');keys.push(cursor.primaryKey);}cursor.continue();}catch(error){abort(error);}};}
   }
  }}catch(error){abort(error);}
 });}
 #add(store: IDBObjectStore, row: StorageStore, indices: readonly number[], abort: (error: unknown) => void) {
  for (const i of indices) {
   this.#guard();
   const key = row.keys[i]!;
   const expected = storageKey(key);
   const request = row.keyPath === null ? store.add(row.values[i], key) : store.add(row.values[i]);
   request.onsuccess = () => {
    try {
     this.#guard();
     // IndexedDB reports the actual primary key it derived from the value.
     if (storageKey(request.result) !== expected) throw fail();
    } catch (error) {
     abort(error);
    }
   };
  }
 }
 capture(plan:StorageDatabasePlan):Promise<StorageDatabase>{return this.#run(async()=>{try{if(!await this.#open(plan))throw fail('room_storage_missing');return await this.#read(plan);}finally{this.#detach();}});}
 async #observe(plan:StorageDatabasePlan,expected:StorageDatabase){const exists=await this.#open(plan);let actual:StorageDatabase|null=null;try{if(exists)actual=await this.#read(plan);}finally{this.#detach();}let present=0,missing=0;const absent=new Map<string,number[]>();for(const row of expected.stores){const other=actual?.stores.find(s=>s.name===row.name);if(other&&!sameStorageSchema(row,other))throw fail('room_storage_schema');const byKey=new Map(other?.keys.map((key,i)=>[storageKey(key),i])??[]),want=new Set(row.keys.map(key=>storageKey(key))),indices:number[]=[];if(other?.keys.some(key=>!want.has(storageKey(key))))throw fail('room_storage_conflict');for(let i=0;i<row.keys.length;i++){const old=byKey.get(storageKey(row.keys[i]));if(old===undefined){missing++;indices.push(i);}else{if(await storageFingerprint(other!.values[old],this.#integrity())!==await storageFingerprint(row.values[i],this.#integrity()))throw fail('room_storage_conflict');present++;}}absent.set(row.name,indices);}const kind=!exists?'absent':missing===0?'identical':present===0?'missing':'partial',sha256=await storageFingerprint(actual,this.#integrity());return{choice:{database:plan.database,kind,present,missing,sha256} as StorageDestination,missing:absent};}
 observe(plan:StorageDatabasePlan,expected:StorageDatabase):Promise<StorageDestination>{return this.#run(async()=>{this.#guard();return(await this.#observe(plan,storageDatabase(expected,plan))).choice;});}
 restore(plan: StorageDatabasePlan, expected: StorageDatabase, choice: StorageDestination): Promise<void> {
  return this.#run(async () => {
   const original = storageDatabase(expected, plan);
   const before = await this.#observe(plan, original);
   if (!equal(before.choice, choice)) throw fail('room_storage_stale');

   try {
    if (choice.kind === 'absent') {
     await this.#open(plan, original);
    } else if (before.choice.missing) {
     if (!await this.#open(plan)) throw fail('room_storage_stale');
     this.#schema(plan);
     await new Promise<void>((resolve, reject) => {
      const tx = this.#db!.transaction([...plan.stores], 'readwrite', { durability: 'strict' });
      let failed = false;
      let reason: unknown;
      const abort = (error: unknown) => {
       failed = true;
       reason = error;
       try { tx.abort(); } catch {}
      };
      tx.onerror = () => {};
      tx.onabort = () => reject(failed ? reason : fail('room_storage_storage'));
      tx.oncomplete = () => {
       try { this.#guard(); resolve(); } catch (error) { reject(error); }
      };
      try {
       // The write transaction owns the authoritative schema after reopening.
       const stores = original.stores.map(row => {
        const store = tx.objectStore(row.name);
        if (!sameStorageSchema(row, readStorageSchema(store))) throw fail('room_storage_schema');
        return { row, store };
       });
       for (const { row, store } of stores) this.#add(store, row, before.missing.get(row.name)!, abort);
      } catch (error) {
       abort(error);
      }
     });
    }
   } finally {
    this.#detach();
   }

   const after = await this.#observe(plan, original);
   if (after.choice.kind !== 'identical') throw fail();
   this.#guard();
  });
 }
 close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#releasing)return this.#releasing;this.#closing=true;if(this.#pending){this.#reject?.(fail('room_storage_closed'));try{this.#request?.transaction?.abort();}catch{}}const pending=this.#running;this.#releasing=(async()=>{await pending?.catch(()=>{});if(this.#custodies.length){const results=await Promise.allSettled(this.#custodies.map(entry=>entry.rollback()));if(results.some(r=>r.status==='rejected'))throw fail('room_storage_storage');}else await this.#dispose();})().finally(()=>{this.#releasing=undefined;});return this.#releasing;}
 #dispose():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#ending)return this.#ending;this.#closing=true;this.#ending=(async()=>{await this.#running?.catch(()=>{});if(this.#pending)throw fail('room_storage_busy');this.#detach();for(const lease of [...this.#leases].reverse())await lease.close();this.#leases.length=0;this.#closed=true;})().finally(()=>{this.#ending=undefined;});return this.#ending;}
}
