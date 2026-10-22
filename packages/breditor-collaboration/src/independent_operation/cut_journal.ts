/** Genuine original + bounded current/pending intent, retained for the whole live source lifetime. */
import type {SharedSelectionPolicy} from '../types.js';
import type {IndependentHistoryCut,IndependentHistoryStoredCut} from '../independent_history/contract.js';
import {makeIndependentHistoryCut} from '../independent_history/cut.js';
import type {PreparedIndependentDeliveryRecovery} from '../independent_delivery_recovery/prepare.js';
import {deliveryRecoveryArchive as archive} from '../independent_delivery_recovery/archive.js';
import {independentDeliveryParticipantDigest} from '../independent_delivery_participant/codec.js';
import {IndependentDeliveryCompanion} from '../independent_delivery/companion.js';
import {independentDeliverySource} from '../independent_delivery_source/admission.js';
import {RecoveryLease} from '../participant_recovery/lease.js';
import {requireBackupRecovery} from '../backups/identity.js';
import {IndependentNativeOperationOrigin,independentNativeOriginGuard} from './native_origin.js';
import {wrapOperationHead,unwrapOperationHead} from './operation_head.js';
import {readOperationCut,operationCutDigest,copyOperationCut,sameOperationCut} from './cut_codec.js';
import {initialOperationCutIntent,type IndependentOperationJournalIdentity} from './cut_intent.js';
import {createOperationJournalDatabase,existingOperationJournalDatabase,readOperationJournalDatabase,writeOperationJournalDatabase,type OperationJournalChecked} from './journal_database.js';
import {operationJournalFailure as fail} from './journal_failure.js';
import {operationDatabaseName as name,operationJournalIdentity} from './journal_identity.js';
const key=Object.freeze({}),readOrigin=IndependentNativeOperationOrigin.read,disposeOrigin=IndependentNativeOperationOrigin.prototype.dispose;
export interface IndependentOperationJournalOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly database:string;readonly sourceDatabase:string;readonly prepared:PreparedIndependentDeliveryRecovery<P>;readonly writerRecovery:'host-reacquired';
}
type Checked=OperationJournalChecked&{readonly decoded:ReadonlyMap<string,IndependentHistoryStoredCut>};
let binding:(journal:IndependentOperationCutJournal)=>ReturnType<IndependentOperationCutJournal['bindingType']>;
export class IndependentOperationCutJournal {
 readonly #p:PreparedIndependentDeliveryRecovery;readonly #db:IDBDatabase;readonly #lease:RecoveryLease;readonly #origin:IndependentNativeOperationOrigin;
 readonly #native:ReturnType<typeof independentNativeOriginGuard>;readonly #id:IndependentOperationJournalIdentity;readonly #decoder:IndependentDeliveryCompanion;readonly #baseline:IndependentHistoryCut;
 readonly #context:IDBFactory;readonly #locks:LockManager;#changed=false;#closed=false;#opening=false;#owner:object|undefined;#working=false;#closing:Promise<void>|undefined;
 readonly #readers=new Set<Promise<unknown>>();
 private constructor(token:object,p:PreparedIndependentDeliveryRecovery,db:IDBDatabase,lease:RecoveryLease,origin:IndependentNativeOperationOrigin,id:IndependentOperationJournalIdentity,decoder:IndependentDeliveryCompanion,baseline:IndependentHistoryCut){
  if(token!==key)throw fail();this.#p=p;this.#db=db;this.#lease=lease;this.#origin=origin;this.#native=independentNativeOriginGuard(origin);this.#id=Object.freeze({...id});this.#decoder=decoder;this.#baseline=copyOperationCut(baseline);this.#context=indexedDB;this.#locks=navigator.locks;
  db.onversionchange=()=>{this.#changed=true;db.close();};Object.freeze(this);
 }
 static begin<P extends SharedSelectionPolicy>(options:IndependentOperationJournalOptions<P>):Promise<IndependentOperationCutJournal>{return this.#open(options,false);}
 static resume<P extends SharedSelectionPolicy>(options:IndependentOperationJournalOptions<P>):Promise<IndependentOperationCutJournal>{return this.#open(options,true);}
 static async #open<P extends SharedSelectionPolicy>(input:IndependentOperationJournalOptions<P>,resume:boolean):Promise<IndependentOperationCutJournal>{
  requireBackupRecovery(input.writerRecovery);const database=name(input.database),sourceDatabase=name(input.sourceDatabase),provided=input.prepared as unknown as PreparedIndependentDeliveryRecovery,context=globalThis.indexedDB,locks=globalThis.navigator?.locks,authority=provided.guard;
  const current=()=>{if(!context||!locks||globalThis.indexedDB!==context||globalThis.navigator?.locks!==locks)throw fail('independent_operation_storage_changed');};
  const guard=()=>{current();authority();current();},p={...provided,guard};guard();
  const id=await operationJournalIdentity(database,sourceDatabase,p);p.guard();
  let lease:RecoveryLease|undefined,db:IDBDatabase|undefined,origin:IndependentNativeOperationOrigin|undefined;
  try{lease=await RecoveryLease.acquire(JSON.stringify(database));p.guard();origin=await readOrigin.call(IndependentNativeOperationOrigin,p);p.guard();
   const recovery=archive.recovery.call(p.backup),decoder=new IndependentDeliveryCompanion(p.factory,recovery),native=await makeIndependentHistoryCut(recovery.source.documentCheckpoint,recovery.source.reviewCheckpoint,recovery.source.identity,recovery.source.versions);p.guard();
   const baseline={head:wrapOperationHead(decoder.wrap(JSON.parse(native.head),decoder.capture()),id),files:native.files};
   db=resume?await existingOperationJournalDatabase(database):await createOperationJournalDatabase(database,initialOperationCutIntent(id),archive.file.call(p.backup),p.guard);
   const result=new IndependentOperationCutJournal(key,p,db,lease,origin,id,decoder,baseline);await result.#read();return result;
  }catch(error){db?.close();if(origin)disposeOrigin.call(origin);await lease?.close();throw error;}
 }
 #check():void{if(this.#closed)throw fail('independent_operation_closed');if(this.#changed||globalThis.indexedDB!==this.#context||globalThis.navigator?.locks!==this.#locks)throw fail('independent_operation_storage_changed');this.#native.check();}
 #unwrap=(head:string):string=>{const inner=unwrapOperationHead(head,this.#id);this.#decoder.readHead(inner);return inner;};
 #readHead=(head:string)=>this.#decoder.readHead(this.#unwrap(head));
 async #read():Promise<Checked>{
  this.#check();const raw=await readOperationJournalDatabase(this.#db,this.#id);this.#check();if(await independentDeliveryParticipantDigest(raw.file,this.#p.options.signal)!==this.#id.origin)throw fail();this.#check();
  const rows=new Map<string,IndependentHistoryCut>(),decoded=new Map<string,IndependentHistoryStoredCut>();for(const [id,value]of raw.rows){const cut=await readOperationCut(value,this.#readHead);this.#check();if(await operationCutDigest(cut)!==id)throw fail();rows.set(id,copyOperationCut(cut));decoded.set(id,cut);}
  this.#check();return{record:raw.record,file:raw.file,rows,decoded};
 }
 async #exclusive<T>(run:()=>Promise<T>):Promise<T>{this.#check();if(this.#working)throw fail('independent_operation_busy');this.#working=true;try{return await run();}finally{this.#working=false;}}
 async #select(actual:IndependentHistoryStoredCut|null):Promise<IndependentHistoryStoredCut|null>{return this.#exclusive(async()=>{
  const state=await this.#read(),current=state.record.current===null?null:state.decoded.get(state.record.current)!,pending=state.record.pending===null?null:state.decoded.get(state.record.pending)!,observed=actual===null?null:copyOperationCut(actual);
  if(pending){if(!(observed===null&&current===null||observed!==null&&(current!==null&&sameOperationCut(observed,current)||sameOperationCut(observed,pending))))throw fail('independent_operation_source_diverged');return pending;}
  if(current){if(!observed||!sameOperationCut(observed,current))throw fail('independent_operation_source_diverged');return actual;}
  if(actual)throw fail('independent_operation_source_diverged');return readOperationCut(this.#baseline,this.#readHead);
 });}
 async #prepare(expected:string|null,input:IndependentHistoryCut):Promise<void>{return this.#exclusive(async()=>{
  const cut=copyOperationCut(await readOperationCut(copyOperationCut(input),this.#readHead)),id=await operationCutDigest(cut),state=await this.#read(),current=state.record.current===null?null:state.rows.get(state.record.current)!;
  if(state.record.pending!==null){const pending=state.rows.get(state.record.pending)!;if(state.record.pending!==id||!sameOperationCut(cut,pending)||expected!==(current?.head??null)&&expected!==pending.head)throw fail();return;}
  // Already acknowledged after a lost acknowledgement: source CAS will also be a no-op.
  if(state.record.current===id){if(!sameOperationCut(cut,current!))throw fail();return;}
  if(expected!==(current?.head??null))throw fail('independent_operation_source_diverged');
  const next={...state.record,sequence:(BigInt(state.record.sequence)+1n).toString(),pending:id};await writeOperationJournalDatabase(this.#db,this.#id,state,next,{id,cut},()=>this.#check());this.#check();
 });}
 async #acknowledge(input:IndependentHistoryCut):Promise<void>{return this.#exclusive(async()=>{
  const id=await operationCutDigest(input),state=await this.#read();if(state.record.pending===null&&state.record.current===id){if(!sameOperationCut(input,state.rows.get(id)!))throw fail();return;}
  if(state.record.pending!==id||!sameOperationCut(input,state.rows.get(id)!))throw fail();const next={...state.record,sequence:(BigInt(state.record.sequence)+1n).toString(),current:id,pending:null};
  await writeOperationJournalDatabase(this.#db,this.#id,state,next,undefined,()=>this.#check());this.#check();
 });}
 /** Data for internal operation coordination, not an old-format portable recovery export. */
 async snapshot(){
  this.#check();if(this.#closing)throw fail('independent_operation_closed');if(this.#readers.size>=8)throw fail('independent_operation_busy');
  const work=this.#read().then(state=>({record:{...state.record},current:state.record.current===null?null:copyOperationCut(state.rows.get(state.record.current)!),pending:state.record.pending===null?null:copyOperationCut(state.rows.get(state.record.pending)!)}));
  this.#readers.add(work);void work.finally(()=>this.#readers.delete(work)).catch(()=>{});return work;
 }
 async close():Promise<void>{if(this.#closed)return;if(this.#owner||this.#opening||this.#working)throw fail('independent_operation_in_use');if(this.#closing)return this.#closing;
  return this.#closing=Promise.resolve().then(async()=>{await Promise.allSettled([...this.#readers]);this.#db.close();await this.#lease.close();disposeOrigin.call(this.#origin);archive.dispose.call(this.#p.backup);this.#closed=true;}).finally(()=>{this.#closing=undefined;});
 }
 /** Genuine private factory hooks; their inferred type describes the private binding. */
 private bindingType(){return{
  identity:structuredClone(this.#decoder.identity),sourceDatabase:this.#id.sourceDatabase,
  nativeCaptureGuard:Object.freeze({check:()=>this.#check(),capture:(...args:Parameters<ReturnType<typeof independentNativeOriginGuard>['capture']>)=>{this.#check();this.#native.capture(...args);this.#check();}}),
  readHead:this.#readHead,unwrap:this.#unwrap,wrap:(head:string)=>{this.#decoder.readHead(head);return wrapOperationHead(head,this.#id);},
  persistence:Object.freeze({select:(actual:IndependentHistoryStoredCut|null)=>this.#select(actual),prepare:(expected:string|null,cut:IndependentHistoryCut)=>this.#prepare(expected,cut),acknowledge:(cut:IndependentHistoryCut)=>this.#acknowledge(cut),release:async()=>{if(!this.#owner)return;this.#owner=undefined;await closeJournal.call(this);}}),
  reserve:()=>{this.#check();if(this.#owner||this.#opening||this.#working||this.#closing)throw fail('independent_operation_in_use');this.#opening=true;let settled=false;return{claim:(owner:object)=>{if(settled||!this.#opening||this.#owner)throw fail();this.#check();const port=independentDeliverySource(owner);if(port.operation!==this||JSON.stringify(port.identity)!==JSON.stringify(this.#decoder.identity))throw fail('independent_operation_source');this.#owner=owner;this.#opening=false;settled=true;},abandon:()=>{if(!settled){this.#opening=false;settled=true;}}};},
  readSource:(owner:object)=>{if(this.#owner!==owner)throw fail('independent_operation_source');const port=independentDeliverySource(owner);if(port.operation!==this)throw fail('independent_operation_source');return port.read();},
 };}
 static{binding=journal=>{if(journal.#closed)throw fail('independent_operation_closed');return journal.bindingType();};}
}
const closeJournal=IndependentOperationCutJournal.prototype.close;
/** Private brand admission: structural objects and serialized markers cannot select a journal. */
export const operationJournalBinding=(journal:IndependentOperationCutJournal)=>binding(journal);
