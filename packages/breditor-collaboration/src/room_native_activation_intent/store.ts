import {PhysicalOperationV3Cancellation} from '../physical_room_operation_v3/storage_cancellation.js';
/** One absent-only complete intent and monotonic state under actual namespace custody.
 * Existing records are never overwritten. A lost transaction completion retains
 * every committed byte and can be resolved by an existing-only exact reopen. */
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {RecoveryLease,checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {settleOwnedTransaction} from '../persistence/settle_owned_transaction.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {nativeActivationReceipt} from '../native_activation_control/identity.js';
import type {SharedDurableNativeActivationReceipt} from '../native_activation_control/contract.js';
import {decodeRoomActivationIntent} from './decode.js';
import {snapshotRoomActivationEncodedCapture} from './snapshot_encoded.js';
import {roomActivationIntentChoice,roomActivationIntentState} from './identity.js';
import type {RoomActivationEncodedCapture,RoomActivationIntentChoice,RoomActivationIntentState,RoomActivationRetainedIntent} from './contract.js';
import {fail,MAX_ROOM_ACTIVATION_GRAPH_BYTES,MAX_ROOM_ACTIVATION_REVISIONS} from './policy.js';
const tables=['activation'],initialState:RoomActivationIntentState=Object.freeze({format:'breditor/room-native-activation-intent-state',formatVersion:1,revision:0,phase:'prepared',receipt:null});
export class RoomActivationIntentStore {
 readonly #factory=recoveryOpeningContext();readonly #locks=navigator.locks;readonly #choice;readonly #options;readonly #integrity;readonly #cancel;
 #opening:RecoveryOpeningCustody|undefined;#lease:RecoveryLease|undefined;#db:IDBDatabase|undefined;
 #pending=false;#changed=false;#closing=false;#closed=false;#request:IDBOpenDBRequest|undefined;#reject:((error:unknown)=>void)|undefined;#running:Promise<unknown>|undefined;#cleanup:Promise<void>|undefined;
 #committed:RoomActivationIntentState|undefined;
 constructor(choice:RoomActivationIntentChoice,options:SharedArchiveIntegrityOptions){this.#choice=roomActivationIntentChoice(choice);this.#options=options;this.#integrity=prepareArchiveIntegrity(options);this.#cancel=new PhysicalOperationV3Cancellation(options.signal);Object.freeze(this);}
 check=()=>{if(this.#closing||this.#closed||this.#changed||globalThis.indexedDB!==this.#factory||globalThis.navigator?.locks!==this.#locks)throw fail('activation_intent_closed');if(this.#lease)checkRecoveryLeasesHeld([this.#lease]);try{this.#cancel.check();}catch{throw fail('activation_intent_closed');}this.#integrity.guard();try{this.#cancel.check();}catch{throw fail('activation_intent_closed');}if(this.#closing||this.#closed||this.#changed)throw fail('activation_intent_closed');};
 #run<T>(work:()=>Promise<T>):Promise<T>{if(this.#running)return Promise.reject(fail('activation_intent_busy'));const job=Promise.resolve().then(()=>{this.check();return work();});this.#running=job;return job.finally(()=>{this.#running=undefined;});}
 #attach(db:IDBDatabase){this.#db=db;db.onversionchange=()=>{this.#changed=true;db.close();};}
 #schema(db:IDBDatabase){if(db.version!==1||JSON.stringify([...db.objectStoreNames])!==JSON.stringify(tables))throw fail();const tx=db.transaction(tables,'readonly'),s=tx.objectStore('activation');if(s.keyPath!==null||s.autoIncrement||s.indexNames.length)throw fail();}
 open(initial?:RoomActivationEncodedCapture):Promise<RoomActivationRetainedIntent>{return this.#run(async()=>{
  if(this.#db||this.#opening)throw fail('activation_intent_busy');
  const proposed=initial?snapshotRoomActivationEncodedCapture(initial):undefined;
  if(proposed){if(JSON.stringify(proposed.choice)!==JSON.stringify(this.#choice)||JSON.stringify(initial!.choice)!==JSON.stringify(this.#choice))throw fail();await decodeRoomActivationIntent(proposed,this.#options);this.check();}
  this.#opening=await RecoveryOpeningCustody.reserve(this.#factory,[this.#choice.database],()=>this.#close(),{policy:()=>fail('activation_intent_policy'),busy:()=>fail('activation_intent_busy'),storage:()=>fail('activation_intent_storage')});this.check();this.#lease=await RecoveryLease.acquire(JSON.stringify(this.#choice.database));this.check();
  await new Promise<void>((resolve,reject)=>{const q=this.#factory.open(this.#choice.database,1);let created=false,refused=false,reason:unknown,unwatch=()=>{};this.#pending=true;this.#request=q;this.#reject=reject;
   const abort=(error:unknown)=>{refused=true;reason=error;if(q.transaction){try{q.transaction.abort();}catch{}}else reject(error);},done=()=>{
    this.#pending=false;this.#request=undefined;this.#reject=undefined;unwatch();
    // A caller may have stopped waiting before IndexedDB settled the open.
    // The retained rollback can now release custody without that caller.
    if(this.#closing)void this.#opening?.rollback().catch(()=>{});
   };try{unwatch=this.#cancel.watch(()=>abort(fail('activation_intent_closed')));}catch(error){abort(error);}
   q.onupgradeneeded=event=>{this.#attach(q.result);try{this.check();if(event.oldVersion!==0||refused)throw fail('activation_intent_exists');if(!proposed)throw fail('activation_intent_missing');const store=q.result.createObjectStore('activation');store.add(JSON.stringify(this.#choice),'choice');store.add(proposed.graph,'graph');store.add(JSON.stringify(initialState),'state');for(let i=0;i<proposed.objects.length;i++)store.add(proposed.objects[i]!,'blob:'+this.#choice.objects[i]!.sha256);created=true;this.check();}catch(error){abort(error);}};
   q.onblocked=()=>{refused=true;reason=fail('activation_intent_busy');reject(reason);};q.onerror=()=>{done();reject(refused?reason:fail('activation_intent_storage'));};q.onsuccess=()=>{this.#attach(q.result);done();if(created)this.#committed=initialState;try{this.check();if(refused)throw reason;if(proposed&&!created)throw fail('activation_intent_exists');this.#schema(q.result);resolve();}catch(error){reject(error);}};
  });return this.#load();
 });}
 #transaction<T>(mode:IDBTransactionMode,visit:(rows:ReadonlyMap<string,unknown>,tx:IDBTransaction)=>T,committed?:()=>void):Promise<T>{
  this.check();if(!this.#db)throw fail('activation_intent_closed');return new Promise((resolve,reject)=>{
   const tx=this.#db!.transaction(tables,mode),store=tx.objectStore('activation');let reason:unknown,failed=false,ready=false,result:T,unwatch=()=>{};
   const abort=(error:unknown)=>{failed=true;reason=error;try{tx.abort();}catch{}};tx.onerror=()=>{};
   try{unwatch=this.#cancel.watch(()=>abort(fail('activation_intent_closed')));}catch(error){abort(error);}
   settleOwnedTransaction(tx,()=>{unwatch();committed?.();this.check();if(!ready)throw fail();return result;},()=>{unwatch();return failed?reason:fail('activation_intent_storage');},resolve,reject);
   const count=store.count();count.onsuccess=()=>{try{this.check();const wanted=this.#choice.objects.length+3;if(count.result!==wanted)throw fail();const keys=store.getAllKeys(undefined,wanted+1),data=store.getAll(undefined,wanted+1);let received=0;
    const take=()=>{if(++received!==2)return;try{this.check();if(keys.result.length!==wanted||data.result.length!==wanted||keys.result.some(k=>typeof k!=='string'))throw fail();const rows=new Map(keys.result.map((key,i)=>[key as string,data.result[i]]));if(rows.size!==wanted||rows.get('choice')!==JSON.stringify(this.#choice)||!rows.has('graph')||!rows.has('state')||this.#choice.objects.some(p=>!rows.has('blob:'+p.sha256)))throw fail();result=visit(rows,tx);ready=true;}catch(error){abort(error);}};keys.onsuccess=take;data.onsuccess=take;
   }catch(error){abort(error);}};
  });
 }
 async #load():Promise<RoomActivationRetainedIntent>{
  const rows=await this.#transaction('readonly',r=>r),text=rows.get('graph'),stateText=rows.get('state');
  if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_ROOM_ACTIVATION_GRAPH_BYTES||typeof stateText!=='string'||new TextEncoder().encode(stateText).length>128*1024)throw fail();
  const state=roomActivationIntentState(JSON.parse(stateText),this.#choice);if(JSON.stringify(state)!==stateText)throw fail();
  const capture=await decodeRoomActivationIntent({choice:this.#choice,graph:text,objects:this.#choice.objects.map(p=>rows.get('blob:'+p.sha256) as Blob)},this.#options);this.check();this.#committed=state;return Object.freeze({choice:this.#choice,capture,state});
 }
 read():Promise<RoomActivationRetainedIntent>{return this.#run(()=>this.#load());}
 #advance(receipt:SharedDurableNativeActivationReceipt|undefined):Promise<RoomActivationRetainedIntent>{return this.#run(async()=>{
  const before=await this.#load();this.check();
  const chosen=receipt===undefined?null:nativeActivationReceipt(JSON.stringify(receipt),this.#choice.activation);
  if(before.state.phase==='receipt-observed'){if(chosen&&JSON.stringify(chosen)!==JSON.stringify(before.state.receipt))throw fail();return before;}
  if(before.state.revision>=MAX_ROOM_ACTIVATION_REVISIONS)throw fail('activation_intent_policy');
  const next=roomActivationIntentState({format:initialState.format,formatVersion:1,revision:before.state.revision+1,phase:chosen?'receipt-observed':'request-started',receipt:chosen},this.#choice),old=JSON.stringify(before.state),text=JSON.stringify(next);
  await this.#transaction('readwrite',(rows,tx)=>{if(rows.get('state')!==old)throw fail('activation_intent_stale');tx.objectStore('activation').put(text,'state');},()=>{this.#committed=next;});
  const after=await this.#load();if(JSON.stringify(after.state)!==text)throw fail('activation_intent_stale');return after;
 });}
 markRequestStarted():Promise<RoomActivationRetainedIntent>{return this.#advance(undefined);}
 markReceiptObserved(receipt:SharedDurableNativeActivationReceipt):Promise<RoomActivationRetainedIntent>{return this.#advance(receipt);}
 /** Last COMMITTED observation survives authority loss; it grants no service or writer. */
 committed():RoomActivationIntentState|undefined{return this.#committed;}
 close():Promise<void>{this.#closing=true;if(this.#pending){this.#reject?.(fail('activation_intent_closed'));try{this.#request?.transaction?.abort();}catch{}}return this.#close().then(()=>this.#opening?.rollback());}
 #close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;this.#cleanup=(async()=>{await this.#running?.catch(()=>{});if(this.#pending)throw fail('activation_intent_busy');if(this.#db){this.#db.onversionchange=null;this.#db.close();}await this.#lease?.close();this.#db=undefined;this.#lease=undefined;this.#cancel.close();this.#closed=true;})().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
}
