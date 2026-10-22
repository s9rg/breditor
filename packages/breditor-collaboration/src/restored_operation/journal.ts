/** Writable source replay from an independently owned archive. Every bootstrap cut uses
 * real writer leases and prepare/source-commit/ack. A private hold survives temporary
 * source closure; the final genuine source consumes it synchronously after readback. */
import type {SharedSelectionPolicy} from '../types.js';
import type {IndependentHistoryCut,IndependentHistoryStoredCut} from '../independent_history/contract.js';
import {SharedRichEditor} from '../core.js';
import {independentDeliverySource} from '../independent_delivery_source/admission.js';
import {IndependentDeliveryCompanion} from '../independent_delivery/companion.js';
import {RecoveryLease} from '../participant_recovery/lease.js';
import {independentDeliveryParticipantDigest as digest} from '../independent_delivery_participant/codec.js';
import {operationDatabaseName} from '../independent_operation/journal_identity.js';
import {restoredOperationPolicy} from './policy.js';
import {readDedicatedOperationSourceDatabase} from '../independent_operation/read_source_database.js';
import {replayPortableRecovery} from '../independent_operation/portable_replay.js';
import {wrapOperationHead,unwrapOperationHead} from '../independent_operation/operation_head.js';
import {copyOperationCut,sameOperationCut,readOperationCut,operationCutDigest} from '../independent_operation/cut_codec.js';
import {operationJournalFailure as fail} from '../independent_operation/journal_failure.js';
import {forwardProgress} from '../segmented_relay/validation.js';
import {initialRestoredOperationStage} from './stage.js';
import {readRestoredOperationInput,type RestoredOperationInput,type RestoredOperationInputOptions} from './input.js';
import {createRestoredOperationDatabase,existingRestoredOperationDatabase,readRestoredOperationDatabase,readRestoredOperationInputFile,writeRestoredOperationDatabase,type RestoredOperationChecked} from './database.js';
const key=Object.freeze({}),verifyOriginal=SharedRichEditor.prototype.verifyRecoveryOrigin,verifySegmented=SharedRichEditor.prototype.verifySegmentedRecoveryOrigin;
type Replay=Awaited<ReturnType<typeof replayPortableRecovery>>;
let binding:(owner:RestoredOperationJournal)=>ReturnType<RestoredOperationJournal['bindingType']>;
export class RestoredOperationJournal {
 readonly #input:RestoredOperationInput;readonly #db:IDBDatabase;readonly #lease:RecoveryLease;readonly #original:Replay;readonly #live:Replay;readonly #decoder:IndependentDeliveryCompanion;readonly #targets:readonly string[];
 readonly #context:IDBFactory;readonly #locks:LockManager;readonly #authority:()=>void;
 #changed=false;#closed=false;#closing:Promise<void>|undefined;#working=false;#opening=false;#owner:object|undefined;#held=true;#active=false;
 private constructor(token:object,input:RestoredOperationInput,db:IDBDatabase,lease:RecoveryLease,original:Replay,live:Replay,targets:readonly string[],context:IDBFactory,locks:LockManager,authority:()=>void){
  if(token!==key)throw fail();this.#input=input;this.#db=db;this.#lease=lease;this.#original=original;this.#live=live;this.#targets=Object.freeze([...targets]);this.#context=context;this.#locks=locks;this.#authority=authority;this.#decoder=new IndependentDeliveryCompanion(input.factory);
  db.onversionchange=()=>{this.#changed=true;db.close();};Object.freeze(this);
 }
 static begin<P extends SharedSelectionPolicy>(file:Blob,options:RestoredOperationInputOptions<P>):Promise<RestoredOperationJournal>{return RestoredOperationJournal.#open(options,file);}
 /** Cold reopen reads the actual retained input; factories and authority are fresh host inputs. */
 static resume<P extends SharedSelectionPolicy>(options:RestoredOperationInputOptions<P>):Promise<RestoredOperationJournal>{return RestoredOperationJournal.#open(options);}
 static async #open<P extends SharedSelectionPolicy>(options:RestoredOperationInputOptions<P>,file?:Blob):Promise<RestoredOperationJournal>{
  const policy=restoredOperationPolicy(options),database=operationDatabaseName(policy.options.database),context=globalThis.indexedDB,locks=globalThis.navigator?.locks,authority=policy.guard;
  const check=()=>{if(!context||!locks||globalThis.indexedDB!==context||globalThis.navigator?.locks!==locks)throw fail('restored_operation_storage_changed');authority();if(globalThis.indexedDB!==context||globalThis.navigator?.locks!==locks)throw fail('restored_operation_storage_changed');};check();
  let lease:RecoveryLease|undefined,db:IDBDatabase|undefined,input:RestoredOperationInput|undefined,original:Replay|undefined,live:Replay|undefined;
  try{
   lease=await RecoveryLease.acquire(JSON.stringify(database));check();
   if(file===undefined){db=await existingRestoredOperationDatabase(database);check();file=await readRestoredOperationInputFile(db);check();}
   input=await readRestoredOperationInput(file,policy.options) as unknown as RestoredOperationInput;check();
   original=await replayPortableRecovery(input.factory,input.originalData,check);check();live=await replayPortableRecovery(input.factory,input.live,check);check();
   const targets=[];for(const cut of input.targets){targets.push(await operationCutDigest(cut));check();}
   db??=await createRestoredOperationDatabase(database,initialRestoredOperationStage(input.identity),input.original,input.file,check);check();
   const result=new RestoredOperationJournal(key,input,db,lease,original,live,targets,context!,locks!,check);await result.#read();return result;
  }catch(e){db?.close();try{await lease?.close();}finally{original?.dispose();live?.dispose();input?.dispose();}throw e;}
 }
 #readable():void{if(this.#closed||this.#closing)throw fail('restored_operation_closed');if(this.#changed||globalThis.indexedDB!==this.#context||globalThis.navigator?.locks!==this.#locks)throw fail('restored_operation_storage_changed');}
 #check=():void=>{this.#readable();this.#authority();this.#original.check();this.#live.check();this.#readable();};
 #unwrap=(head:string)=>{const inner=unwrapOperationHead(head,this.#input.identity);this.#decoder.readHead(inner);return inner;};
 #readHead=(head:string)=>this.#decoder.readHead(this.#unwrap(head));
 #capture=(core:SharedRichEditor<SharedSelectionPolicy>,versions:readonly string[])=>{
  this.#check();const verify=this.#input.originalData.source.identity.documentHistory==='original'?verifyOriginal:verifySegmented;verify.call(core,this.#original.core);
  for(const packet of this.#input.originalData.source.versions)if(!versions.includes(packet))throw fail('restored_operation_origin');
  if(this.#active){verify.call(core,this.#live.core);for(const packet of this.#input.live.source.versions)if(!versions.includes(packet))throw fail('restored_operation_origin');}this.#check();
 };
 async #read():Promise<RestoredOperationChecked>{
  this.#check();const raw=await readRestoredOperationDatabase(this.#db,this.#input.identity,this.#targets);this.#check();
  if(await digest(raw.original,this.#input.options.signal)!==this.#input.identity.origin||await digest(raw.input,this.#input.options.signal)!==this.#input.fileSha256)throw fail('restored_operation_integrity');this.#check();
  const rows=new Map<string,IndependentHistoryCut>();for(const[k,v]of raw.rows){const cut=await readOperationCut(v,this.#readHead);this.#check();if(await operationCutDigest(cut)!==k)throw fail('restored_operation_integrity');if(raw.record.completed===this.#targets.length){const decoder=new IndependentDeliveryCompanion(this.#input.factory);decoder.load(this.#unwrap(cut.head));forwardProgress(this.#input.live.relay,decoder.current());}rows.set(k,copyOperationCut(cut));}this.#check();this.#active=raw.record.completed===this.#targets.length;return{...raw,rows};
 }
 async #exclusive<T>(run:()=>Promise<T>):Promise<T>{this.#check();if(this.#working)throw fail('restored_operation_busy');this.#working=true;try{return await run();}finally{this.#working=false;}}
 async #select(actual:IndependentHistoryStoredCut|null){return this.#exclusive(async()=>{
  const id=this.#decoder.identity.history.native,complete=await readDedicatedOperationSourceDatabase(this.#input.sourceDatabase,[id.room,id.writer],this.#readHead,this.#check,'restored-operation-v1');this.#check();
  if(actual===null?complete!==null:complete===null||!sameOperationCut(copyOperationCut(actual),complete))throw fail('restored_operation_source_diverged');
  const state=await this.#read(),r=state.record.intent,current=r.current===null?null:state.rows.get(r.current)!,pending=r.pending===null?null:state.rows.get(r.pending)!,observed=actual&&copyOperationCut(actual);
  if(observed===null?current!==null:!(current&&sameOperationCut(observed,current)||pending&&sameOperationCut(observed,pending)))throw fail('restored_operation_source_diverged');
  if(pending)return readOperationCut(pending,this.#readHead);
  if(!this.#active)return readOperationCut(this.#input.targets[state.record.completed]!,this.#readHead);
  if(!actual||!observed||!current||!sameOperationCut(observed,current))throw fail('restored_operation_source_diverged');return actual;
 });}
 async #prepare(expected:string|null,input:IndependentHistoryCut){return this.#exclusive(async()=>{
  const cut=copyOperationCut(await readOperationCut(copyOperationCut(input),this.#readHead)),hash=await operationCutDigest(cut),state=await this.#read(),r=state.record.intent,current=r.current===null?null:state.rows.get(r.current)!;
  if(r.pending!==null){if(r.pending!==hash||!sameOperationCut(cut,state.rows.get(r.pending)!)||expected!==(current?.head??null)&&expected!==cut.head)throw fail('restored_operation_pending');return;}
  if(r.current===hash){if(!sameOperationCut(cut,current!))throw fail();return;}
  if(expected!==(current?.head??null))throw fail('restored_operation_source_diverged');
  const next={...state.record,intent:{...r,sequence:(BigInt(r.sequence)+1n).toString(),pending:hash}};
  await writeRestoredOperationDatabase(this.#db,this.#input.identity,this.#targets,state,next,{id:hash,cut},this.#check);this.#check();
 });}
 async #acknowledge(cut:IndependentHistoryCut){return this.#exclusive(async()=>{
  const hash=await operationCutDigest(cut),state=await this.#read(),r=state.record.intent;
  if(r.pending===null&&r.current===hash){if(!sameOperationCut(cut,state.rows.get(hash)!))throw fail();return;}
  if(r.pending!==hash||!sameOperationCut(cut,state.rows.get(hash)!))throw fail('restored_operation_pending');
  const next={...state.record,completed:state.record.completed+(state.record.completed<this.#targets.length?1:0),intent:{...r,sequence:(BigInt(r.sequence)+1n).toString(),current:hash,pending:null}};
  await writeRestoredOperationDatabase(this.#db,this.#input.identity,this.#targets,state,next,undefined,this.#check);this.#check();this.#active=next.completed===this.#targets.length;
 });}
 async close():Promise<void>{
  if(this.#closed)return;if(this.#owner||this.#opening||this.#working)throw fail('restored_operation_in_use');if(this.#closing)return this.#closing;
  return this.#closing=Promise.resolve().then(async()=>{this.#db.close();try{await this.#lease.close();}finally{this.#original.dispose();this.#live.dispose();this.#input.dispose();this.#closed=true;}}).finally(()=>{this.#closing=undefined;});
 }
 private bindingType(){return{
  identity:structuredClone(this.#decoder.identity),operationIdentity:structuredClone(this.#input.identity),sourceDatabase:this.#input.sourceDatabase,
  readHead:this.#readHead,unwrap:this.#unwrap,wrap:(head:string)=>{this.#decoder.readHead(head);return wrapOperationHead(head,this.#input.identity);},nativeCaptureGuard:Object.freeze({check:this.#check,capture:this.#capture}),
  persistence:Object.freeze({select:(actual:IndependentHistoryStoredCut|null)=>this.#select(actual),prepare:(expected:string|null,cut:IndependentHistoryCut)=>this.#prepare(expected,cut),acknowledge:(cut:IndependentHistoryCut)=>this.#acknowledge(cut),release:async()=>{if(!this.#owner)return;this.#owner=undefined;if(!this.#held)await closeJournal.call(this);}}),
  reserve:()=>{this.#check();if(this.#owner||this.#opening||this.#working)throw fail('restored_operation_in_use');this.#opening=true;let settled=false;return{claim:(owner:object)=>{if(settled||!this.#opening||this.#owner)throw fail();this.#check();const port=independentDeliverySource(owner);if(port.operation!==this||JSON.stringify(port.identity)!==JSON.stringify(this.#decoder.identity))throw fail('restored_operation_source');this.#owner=owner;this.#opening=false;settled=true;},abandon:()=>{if(!settled){settled=true;this.#opening=false;}}};},
  /** The actual source, not a phase DTO, must finish the last replay. No await between
   * this fresh native/host check and consuming the genuine journal hold. */
  consume:(owner:object)=>{this.#check();if(this.#owner!==owner||!this.#active||!this.#held)throw fail('restored_operation_handoff');const port=independentDeliverySource(owner);if(port.operation!==this)throw fail('restored_operation_source');const before=port.stamp(),data=port.read();this.#capture(port.core,data.source.versions);const after=port.stamp();if(before[0]!==after[0]||before[1]!==after[1])throw fail('restored_operation_handoff_changed');this.#held=false;},
  progress:async()=>{const s=await this.#exclusive(()=>this.#read());return{completed:s.record.completed,total:this.#targets.length,ready:s.record.completed===this.#targets.length,pending:s.record.intent.pending!==null};},
  readSource:(owner:object)=>{this.#readable();if(this.#owner!==owner)throw fail('restored_operation_source');const port=independentDeliverySource(owner);if(port.operation!==this)throw fail('restored_operation_source');return port.read();},
  inputFile:()=>{this.#readable();return this.#input.file;},originalFile:()=>{this.#readable();return this.#input.original;},
 };}
 static{binding=owner=>{owner.#readable();return owner.bindingType();};}
}
const closeJournal=RestoredOperationJournal.prototype.close;
export const restoredOperationJournalBinding=(owner:RestoredOperationJournal)=>binding(owner);
