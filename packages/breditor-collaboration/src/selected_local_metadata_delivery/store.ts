import {settleOwnedTransaction} from '../persistence/settle_owned_transaction.js';
/** Exactly two canonical records, one immutable original before-cut and one
 * full current cut. Same-transaction CAS compares every previous byte, not counters.
 * A post-commit refusal never erases facts or regrants permission. */
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {RecoveryLease,checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {metadataJson,metadataSnapshot,fail} from './policy.js';
import {MAX_LOCAL_METADATA_BYTES} from './data.js';
import {requireMetadataRecordsForward} from './forward.js';
import {forwardProgress} from '../segmented_relay/validation.js';
import type {LocalMetadataDeliveryChoice,LocalMetadataDeliverySnapshot,LocalMetadataDeliveryState} from './contract.js';
const tables=['state'];
export class LocalMetadataDeliveryStore{
 readonly #factory=recoveryOpeningContext();readonly #locks=navigator.locks;readonly #checkAuthority;readonly #choice;
 #opening:RecoveryOpeningCustody|undefined;#lease:RecoveryLease|undefined;#db:IDBDatabase|undefined;
 #committed:LocalMetadataDeliverySnapshot|undefined;
 #changed=false;#closing=false;#closed=false;#pending=false;#request:IDBOpenDBRequest|undefined;#reject:((reason:unknown)=>void)|undefined;#running:Promise<unknown>|undefined;#cleanup:Promise<void>|undefined;
 readonly #witnesses=new WeakMap<LocalMetadataDeliverySnapshot,readonly string[]>();
 constructor(choice:LocalMetadataDeliveryChoice,check:()=>void){this.#choice=choice;this.#checkAuthority=check;Object.freeze(this);}
 checkCurrent=()=>{if(this.#closing||this.#closed||this.#changed||globalThis.indexedDB!==this.#factory||globalThis.navigator?.locks!==this.#locks)throw fail('local_metadata_delivery_closed');if(this.#lease)checkRecoveryLeasesHeld([this.#lease]);};
 #check=()=>{this.checkCurrent();this.#checkAuthority();this.checkCurrent();};
 #run<T>(work:()=>Promise<T>):Promise<T>{this.checkCurrent();if(this.#running)throw fail('local_metadata_delivery_busy');const job=Promise.resolve().then(work);this.#running=job;return job.finally(()=>{this.#running=undefined;});}
 #schema(db:IDBDatabase){if(db.version!==1||JSON.stringify([...db.objectStoreNames])!==JSON.stringify(tables))throw fail();const tx=db.transaction(tables,'readonly'),s=tx.objectStore('state');if(s.keyPath!==null||s.autoIncrement||s.indexNames.length)throw fail();}
 #attach(db:IDBDatabase){this.#db=db;db.onversionchange=()=>{this.#changed=true;db.close();};}
 open(initial?:LocalMetadataDeliveryState):Promise<LocalMetadataDeliverySnapshot>{return this.#run(async()=>{this.#check();if(this.#opening||this.#db)throw fail('local_metadata_delivery_busy');const initialText=initial===undefined?undefined:metadataJson(initial),initialSnapshot=initial===undefined?undefined:await metadataSnapshot({before:initial,current:initial},this.#choice);
  this.#opening=await RecoveryOpeningCustody.reserve(this.#factory,[this.#choice.database],()=>this.#close(),{policy:()=>fail('local_metadata_delivery_policy'),busy:()=>fail('local_metadata_delivery_busy'),storage:()=>fail('local_metadata_delivery_storage')});this.#check();this.#lease=await RecoveryLease.acquire(JSON.stringify(this.#choice.database));this.#check();
  await new Promise<void>((resolve,reject)=>{const q=this.#factory.open(this.#choice.database,1);let created=false,refused=false,reason:unknown;this.#pending=true;this.#request=q;this.#reject=reject;const abort=(error:unknown)=>{refused=true;reason=error;try{q.transaction?.abort();}catch{}};const done=()=>{this.#pending=false;this.#request=undefined;this.#reject=undefined;};
   q.onupgradeneeded=event=>{this.#attach(q.result);try{this.#check();if(refused||event.oldVersion!==0)throw fail('local_metadata_delivery_exists');if(initialText===undefined)throw fail('local_metadata_delivery_missing');const s=q.result.createObjectStore('state');s.add(initialText,'before');s.add(initialText,'current');created=true;}catch(error){abort(error);}};
   q.onblocked=()=>{refused=true;reason=fail('local_metadata_delivery_busy');reject(reason);};q.onerror=()=>{done();reject(refused?reason:fail('local_metadata_delivery_storage'));};q.onsuccess=()=>{this.#attach(q.result);done();if(created&&initialSnapshot)this.#committed=initialSnapshot;try{this.#check();if(refused)throw reason;if(initialText!==undefined&&!created)throw fail('local_metadata_delivery_exists');this.#schema(q.result);resolve();}catch(error){reject(error);}};
  });return this.#load();});}
 #transaction<T>(mode:IDBTransactionMode,visit:(values:readonly string[],tx:IDBTransaction)=>T,committed?:()=>void):Promise<T>{this.#check();if(!this.#db)throw fail('local_metadata_delivery_closed');return new Promise((resolve,reject)=>{const tx=this.#db!.transaction(tables,mode),s=tx.objectStore('state');let failed=false,reason:unknown,ready=false,result:T;
  const abort=(error:unknown)=>{failed=true;reason=error;try{tx.abort();}catch{}};tx.onerror=()=>{};settleOwnedTransaction(tx,()=>{committed?.();this.#check();if(!ready)throw fail();return result;},()=>failed?reason:fail('local_metadata_delivery_storage'),resolve,reject);
  const count=s.count();count.onsuccess=()=>{try{this.#check();if(count.result!==2)throw fail();const keys=s.getAllKeys(undefined,3),values=s.getAll(undefined,3);let n=0;const done=()=>{if(++n!==2)return;try{this.#check();if(JSON.stringify(keys.result)!=='["before","current"]'||values.result.some(v=>typeof v!=='string'||new TextEncoder().encode(v).length>MAX_LOCAL_METADATA_BYTES))throw fail();result=visit(values.result as string[],tx);ready=true;}catch(error){abort(error);}};keys.onsuccess=done;values.onsuccess=done;}catch(error){abort(error);}};
 });}
 async #load():Promise<LocalMetadataDeliverySnapshot>{const raw=await this.#transaction('readonly',r=>r),snapshot=await metadataSnapshot({before:JSON.parse(raw[0]!),current:JSON.parse(raw[1]!)},this.#choice);if(metadataJson(snapshot.before)!==raw[0]||metadataJson(snapshot.current)!==raw[1])throw fail();metadataJson(snapshot);this.#committed=snapshot;this.#check();this.#witnesses.set(snapshot,raw);return snapshot;}
 readFresh():Promise<LocalMetadataDeliverySnapshot>{return this.#run(()=>this.#load());}
 replace(before:LocalMetadataDeliverySnapshot,next:LocalMetadataDeliveryState):Promise<LocalMetadataDeliverySnapshot>{const selected=metadataJson(next);return this.#run(async()=>{const old=this.#witnesses.get(before);if(!old)throw fail('local_metadata_delivery_policy');const admitted=await metadataSnapshot({before:before.before,current:JSON.parse(selected)},this.#choice);metadataJson(admitted);if(admitted.current.revision!==before.current.revision+1)throw fail();for(let i=0;i<before.current.lanes.length;i++){forwardProgress(before.current.lanes[i]!.relay,admitted.current.lanes[i]!.relay);requireMetadataRecordsForward(before.current.lanes[i]!.records,admitted.current.lanes[i]!.records);const a=before.current.lanes[i]!.source.versions,b=admitted.current.lanes[i]!.source.versions;if(a.length>b.length||a.some((packet,j)=>packet!==b[j]))throw fail();}await this.#transaction('readwrite',(raw,tx)=>{if(raw[0]!==old[0]||raw[1]!==old[1])throw fail();tx.objectStore('state').put(selected,'current');},()=>{this.#committed=admitted;});const after=await this.#load();if(metadataJson(after.current)!==selected)throw fail();return after;});}
 /** Last known COMMITTED data remains observable after authority loss. This
  * is never writer permission, pending success or a substitute for fresh read. */
 committed():LocalMetadataDeliverySnapshot|undefined{return this.#committed===undefined?undefined:structuredClone(this.#committed);}
 close():Promise<void>{this.#closing=true;if(this.#pending){this.#reject?.(fail('local_metadata_delivery_closed'));try{this.#request?.transaction?.abort();}catch{}}return this.#opening?this.#opening.rollback():this.#close();}
 #close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;this.#cleanup=(async()=>{await this.#running?.catch(()=>{});if(this.#pending)throw fail('local_metadata_delivery_busy');if(this.#db){this.#db.onversionchange=null;this.#db.close();}await this.#lease?.close();this.#db=undefined;this.#lease=undefined;this.#closed=true;})().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
}
