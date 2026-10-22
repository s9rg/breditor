/** Durable local restore, without a fabricated delivery companion. The incoming
 * archive is literal provenance. Its verified LIVE is published once under the
 * actual source's two native writer leases, then prepare/save/ack protects later
 * cuts. Nothing here activates a server or claims complete upload ownership. */
import type {SharedSelectionPolicy} from '../types.js';
import type {IndependentHistoryCut,IndependentHistoryStoredCut} from '../independent_history/contract.js';
import type {IndependentLocalOperationDriver} from '../independent_history/local_driver.js';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import {snapshotIndependentRecoveryFactory} from '../independent_recovery/factory_policy.js';
import {SharedRichEditor} from '../core.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {copyOperationCut,readOperationCut,sameOperationCut,operationCutDigest} from '../independent_operation/cut_codec.js';
import {readDedicatedOperationSourceDatabase} from '../independent_operation/read_source_database.js';
import {replayLocalOperationRecovery,type LocalPortableReplay} from '../independent_local_operation/portable_replay.js';
import {assetBytesDigest} from '../asset_bytes/format.js';
import {RecoveryLease} from '../participant_recovery/lease.js';
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {requireAbsent} from '../participant_recovery/inspect.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {independentRecoverySignal} from '../independent_recovery/signal.js';
import {checkAssetBytesSignal} from '../asset_bytes/guards.js';
import {snapshotRestoredLocalPolicy,restoredLocalInputOptions,type RestoredLocalInputOptions} from './policy.js';
import {DetachedRestoredLocalInput,restoredLocalInput as incoming} from './input.js';
import {readRestoredLocalHead,wrapRestoredLocalHead,type RestoredLocalIdentity} from './head.js';
import {initialRestoredLocalIntent} from './intent.js';
import {createRestoredLocalJournalDatabase,existingRestoredLocalJournalDatabase,readRestoredLocalJournalInput,readRestoredLocalJournalDatabase,writeRestoredLocalJournalDatabase} from './database.js';
import {admitRestoredLocalCuts} from './cut_validation.js';
import {restoredLocalFailure as fail} from './failure.js';
import {restoredLocalJournalOpening,type RestoredLocalParticipantOpening} from './participant_opening.js';

const key=Object.freeze({}),verifyOriginal=SharedRichEditor.prototype.verifyRecoveryOrigin,verifySegmented=SharedRichEditor.prototype.verifySegmentedRecoveryOrigin;
type Choice=ReturnType<typeof snapshotRestoredLocalPolicy>;
type Checked=Awaited<ReturnType<typeof admitRestoredLocalCuts>>;
const same=(actual:IndependentHistoryCut,selected:IndependentHistoryCut)=>sameOperationCut(copyOperationCut(actual),selected);
let binding:(journal:RestoredLocalOperationJournal)=>ReturnType<RestoredLocalOperationJournal['bindingType']>;
let openForParticipant:<P extends SharedSelectionPolicy>(parent:RestoredLocalParticipantOpening,provided:RestoredLocalInputOptions<P>,file?:Blob)=>Promise<RestoredLocalOperationJournal>;

export class RestoredLocalOperationJournal{
 readonly #choice:Choice;readonly #id:RestoredLocalIdentity;readonly #db:IDBDatabase;readonly #lease:RecoveryLease;
 readonly #input:DetachedRestoredLocalInput;readonly #anchor:LocalPortableReplay;readonly #baseline:IndependentHistoryStoredCut;
 readonly #context:IDBFactory;readonly #locks:LockManager;readonly #authority:()=>void;readonly #driver:IndependentLocalOperationDriver;
 readonly #readers=new Set<Promise<unknown>>();
 #owner:object|undefined;#opening=false;#working=false;#closed=false;#changed=false;#dbClosed=false;#closing:Promise<void>|undefined;#sourceReleasePending=false;

 private constructor(token:object,choice:Choice,id:RestoredLocalIdentity,db:IDBDatabase,lease:RecoveryLease,input:DetachedRestoredLocalInput,anchor:LocalPortableReplay,baseline:IndependentHistoryStoredCut,context:IDBFactory,locks:LockManager,authority:()=>void){
  if(token!==key)throw fail('restored_local_operation_closed');
  this.#choice=choice;this.#id=id;this.#db=db;this.#lease=lease;this.#input=input;this.#anchor=anchor;this.#baseline=baseline;this.#context=context;this.#locks=locks;this.#authority=authority;
  this.#driver=Object.freeze({operation:this,storage:'local-operation-v1',readHead:this.#readHead,wrap:(head:string)=>wrapRestoredLocalHead(head,this.#id),
   nativeCaptureGuard:Object.freeze({check:()=>this.#check(),capture:(core:SharedRichEditor<SharedSelectionPolicy>,versions:readonly string[])=>{this.#check();if(this.#owner&&independentHistoryNative(this.#owner).core!==core)throw fail('restored_local_operation_source');this.#verify(core,versions,()=>this.#check());},signal:choice.read.options.signal}),
   persistence:Object.freeze({select:(actual:IndependentHistoryStoredCut|null)=>this.#select(actual),prepare:(expected:string|null,cut:IndependentHistoryCut)=>this.#prepare(expected,cut),acknowledge:(cut:IndependentHistoryCut)=>this.#acknowledge(cut),release:async()=>{if(this.#owner){this.#owner=undefined;this.#sourceReleasePending=true;}if(this.#sourceReleasePending)await close.call(this);}}),
  });
  db.onversionchange=()=>{this.#changed=true;this.#dbClosed=true;db.close();};Object.freeze(this);
 }
 static begin<P extends SharedSelectionPolicy>(file:Blob,options:RestoredLocalInputOptions<P>):Promise<RestoredLocalOperationJournal>{if(this!==RestoredLocalOperationJournal)throw fail();return RestoredLocalOperationJournal.#open(options,file);}
 static resume<P extends SharedSelectionPolicy>(options:RestoredLocalInputOptions<P>):Promise<RestoredLocalOperationJournal>{if(this!==RestoredLocalOperationJournal)throw fail();return RestoredLocalOperationJournal.#open(options);}
 static async #open<P extends SharedSelectionPolicy>(provided:RestoredLocalInputOptions<P>,file?:Blob,parent?:RestoredLocalParticipantOpening,delegated=false):Promise<RestoredLocalOperationJournal>{
  const context=recoveryOpeningContext(),locks=navigator.locks,choice=snapshotRestoredLocalPolicy(provided);
  // Parent-cohort delegation is separate; reserving its names is not ownership.
  if(!!choice.cohort!==delegated)throw fail('restored_local_operation_parent_required');
  const storage=()=>{if(globalThis.indexedDB!==context||globalThis.navigator?.locks!==locks)throw fail('restored_local_operation_storage_changed');};
  const guard=()=>{storage();choice.guard();storage();};
  let db:IDBDatabase|undefined,lease:RecoveryLease|undefined,input:DetachedRestoredLocalInput|undefined,anchor:LocalPortableReplay|undefined,admitted=false;
  const cleanup=async()=>{const results=await Promise.allSettled([Promise.resolve().then(()=>db?.close()),Promise.resolve().then(()=>anchor?.dispose()),Promise.resolve().then(()=>{if(input)incoming.dispose.call(input);}),Promise.resolve().then(()=>lease?.close())]);if(results.some(row=>row.status==='rejected'))throw fail('restored_local_operation_cleanup');};
  const opening=delegated?restoredLocalJournalOpening(parent!,context,[choice.database,choice.sourceDatabase],choice.names,cleanup):await RecoveryOpeningCustody.reserve(context,choice.names,cleanup,{policy:()=>fail(),busy:()=>fail('restored_local_operation_busy'),storage:()=>fail('restored_local_operation_cleanup')});
  try{
   guard();lease=await RecoveryLease.acquire(JSON.stringify(choice.database));guard();
   if(file===undefined){db=await existingRestoredLocalJournalDatabase(choice.database,guard);file=await readRestoredLocalJournalInput(db,guard);guard();}else{await requireAbsent(choice.sourceDatabase);guard();}
   input=await incoming.read.call(DetachedRestoredLocalInput,file,restoredLocalInputOptions(choice));guard();
   const id=incoming.identity.call(input),live=incoming.live.call(input),targets=incoming.targets.call(input),last=targets.at(-1);if(!last)throw fail();
   // After admission this exact read-only native owner is data custody only; an
   // ended former write grant cannot prevent fresh independent read authority.
   const readableOrigin=()=>{storage();if(!admitted)guard();if(!input)throw fail();incoming.check.call(input);};
   anchor=await replayLocalOperationRecovery(choice.expected.original,choice.read.options.session,live,readableOrigin);guard();
   const baseline=await readOperationCut(last,head=>readRestoredLocalHead(head,id));guard();
   db??=await createRestoredLocalJournalDatabase(context,choice.database,initialRestoredLocalIntent(id),incoming.file.call(input),guard,choice.read.options.signal);guard();
   const result=new RestoredLocalOperationJournal(key,choice,id,db,lease,input,anchor,baseline,context,locks,guard);
   await result.#read();guard();admitted=true;opening.complete();return result;
  }catch(error){await opening.rollback();throw error;}
 }
 #readable():void{
  if(this.#closed||this.#closing)throw fail('restored_local_operation_closed');
  if(this.#changed||this.#dbClosed||globalThis.indexedDB!==this.#context||globalThis.navigator?.locks!==this.#locks)throw fail('restored_local_operation_storage_changed');
  incoming.check.call(this.#input);this.#anchor.check();
 }
 #check():void{this.#readable();this.#authority();this.#readable();}
 #verify(core:SharedRichEditor<SharedSelectionPolicy>,versions:readonly string[],guard:()=>void):void{
  const expected=this.#anchor.recovery,verify=expected.identity.documentHistory==='original'?verifyOriginal:verifySegmented;
  guard();if((native.segmentedHistoryPolicy.call(core)??'original')!==expected.identity.documentHistory||native.reviewHistoryPolicy.call(core)!==expected.identity.reviewHistory||versions.length<expected.versions.length||expected.versions.some((packet,index)=>versions[index]!==packet))throw fail('restored_local_operation_origin');
  verify.call(core,this.#anchor.core);guard();verify.call(core,this.#anchor.core);
 }
 #readHead=(head:string)=>{const record=readRestoredLocalHead(head,this.#id);if(JSON.stringify(record.identity)!==JSON.stringify(this.#choice.expected.original.identity.source))throw fail('restored_local_operation_source');return record;};
 async #read(guard:()=>void=()=>this.#check(),factory:SharedIndependentRecoveryFactory=this.#choice.read.options.session,anchor:LocalPortableReplay=this.#anchor):Promise<Checked>{
  guard();const stored=await readRestoredLocalJournalDatabase(this.#db,this.#id,guard);guard();
  const selected=incoming.file.call(this.#input);
  if(stored.file.size!==selected.size||stored.file.type!==selected.type)throw fail('restored_local_operation_input_changed');
  const bytes=await stored.file.arrayBuffer();guard();
  if(await assetBytesDigest(new Uint8Array(bytes))!==JSON.parse(this.#id.plan).input.fileSha256)throw fail('restored_local_operation_input_changed');guard();
  return admitRestoredLocalCuts(stored,this.#id,this.#choice.expected.original,factory,anchor,guard);
 }
 #source(guard:()=>void=()=>this.#check()):Promise<IndependentHistoryStoredCut|null>{const n=this.#choice.expected.original.identity.source.native;return readDedicatedOperationSourceDatabase(this.#id.sourceDatabase,[n.room,n.writer],this.#readHead,guard,'local-operation-v1');}
 #exclusive<T>(work:()=>Promise<T>):Promise<T>{if(this.#closed||this.#closing)throw fail('restored_local_operation_closed');if(this.#working)throw fail('restored_local_operation_busy');this.#working=true;return Promise.resolve().then(work).finally(()=>{this.#working=false;});}
 #select(actual:IndependentHistoryStoredCut|null):Promise<IndependentHistoryStoredCut|null>{return this.#exclusive(async()=>{
  if(!this.#opening||this.#owner)throw fail('restored_local_operation_in_use');
  const state=await this.#read(),observed=await this.#source();this.#check();if(actual===null?observed!==null:observed===null||!same(observed,actual))throw fail('restored_local_operation_source_changed');
  const r=state.record,current=r.current===null?null:state.decoded.get(r.current)!,pending=r.pending===null?null:state.decoded.get(r.pending)!;
  if(actual===null?current!==null:!((current&&same(actual,current))||(pending&&same(actual,pending))))throw fail('restored_local_operation_source_diverged');
  return pending??current??this.#baseline;
 });}
 #prepare(expected:string|null,input:IndependentHistoryCut):Promise<void>{return this.#exclusive(async()=>{
  if(!this.#opening&&!this.#owner)throw fail('restored_local_operation_in_use');
  const cut=await readOperationCut(copyOperationCut(input),this.#readHead);this.#check();const hash=await operationCutDigest(cut);this.#check();const state=await this.#read();
  const current=state.record.current===null?null:state.rows.get(state.record.current)!,pending=state.record.pending===null?null:state.rows.get(state.record.pending)!;
  if(current&&same(current,cut)){const actual=await this.#source();this.#check();if(!actual||!same(actual,cut))throw fail('restored_local_operation_source_diverged');return;}
  if(expected!==(current?.head??null)&&expected!==pending?.head)throw fail('restored_local_operation_source_diverged');
  if(pending){if(state.record.pending!==hash||!same(pending,cut))throw fail('restored_local_operation_pending');return;}
  const next={...state.record,sequence:(BigInt(state.record.sequence)+1n).toString(),pending:hash};
  // Admit the exact proposed chronological pair before persisting PREPARED.
  const candidate={...state,record:next,rows:new Map(state.rows).set(hash,copyOperationCut(cut))};
  await admitRestoredLocalCuts(candidate,this.#id,this.#choice.expected.original,this.#choice.read.options.session,this.#anchor,()=>this.#check());this.#check();
  await writeRestoredLocalJournalDatabase(this.#db,this.#id,state,next,{id:hash,cut},()=>this.#check(),this.#choice.read.options.signal);this.#check();
  const saved=await this.#read();if(JSON.stringify(saved.record)!==JSON.stringify(next)||!sameOperationCut(saved.rows.get(hash),cut))throw fail('restored_local_operation_cut');
 });}
 #acknowledge(input:IndependentHistoryCut):Promise<void>{return this.#exclusive(async()=>{
  const cut=await readOperationCut(copyOperationCut(input),this.#readHead);this.#check();const hash=await operationCutDigest(cut);this.#check();
  const actual=await this.#source();this.#check();if(!actual||!same(actual,cut))throw fail('restored_local_operation_source_diverged');
  const state=await this.#read();if(state.record.current===hash&&state.record.pending===null){if(!sameOperationCut(state.rows.get(hash),cut))throw fail();return;}
  if(state.record.pending!==hash||!sameOperationCut(state.rows.get(hash),cut))throw fail('restored_local_operation_pending');
  const next={...state.record,sequence:(BigInt(state.record.sequence)+1n).toString(),current:hash,pending:null};
  await writeRestoredLocalJournalDatabase(this.#db,this.#id,state,next,undefined,()=>this.#check(),this.#choice.read.options.signal);this.#check();
  const saved=await this.#read();if(JSON.stringify(saved.record)!==JSON.stringify(next))throw fail('restored_local_operation_cut');
 });}
 progress(){return this.#exclusive(async()=>{const state=await this.#read();return Object.freeze({sequence:state.record.sequence,current:state.record.current,pending:state.record.pending});});}
 file():Blob{if(this.#closed)throw fail('restored_local_operation_closed');return incoming.file.call(this.#input);}
 blob(asset:string,generation:string):Blob|undefined{if(this.#closed)throw fail('restored_local_operation_closed');return incoming.blob.call(this.#input,asset,generation);}
 close():Promise<void>{
  if(this.#closed)return Promise.resolve();if(this.#owner||this.#opening||this.#working)throw fail('restored_local_operation_in_use');if(this.#closing)return this.#closing;
  this.#closing=Promise.resolve().then(async()=>{while(this.#readers.size)await Promise.allSettled([...this.#readers]);if(!this.#dbClosed){this.#db.close();this.#dbClosed=true;}await this.#lease.close();this.#anchor.dispose();incoming.dispose.call(this.#input);this.#closed=true;}).finally(()=>{this.#closing=undefined;});return this.#closing;
 }
 private bindingType(){return{
  expected:structuredClone(this.#choice.expected),sourceDatabase:this.#id.sourceDatabase,driver:this.#driver,
  reserve:()=>{
   if(this.#closed||this.#closing||this.#owner||this.#opening||this.#working)throw fail('restored_local_operation_in_use');this.#opening=true;
   try{this.#check();}catch(error){this.#opening=false;throw error;}
   let settled=false;return{claim:(owner:object)=>{
    if(settled||!this.#opening||this.#owner)throw fail('restored_local_operation_in_use');this.#check();
    const port=independentHistoryNative(owner);if(port.localOperation!==this||port.companion||JSON.stringify(port.identity)!==JSON.stringify(this.#choice.expected.original.identity.source))throw fail('restored_local_operation_source');
    const stamp=port.stamp(),data=port.read();this.#verify(port.core,data.versions,()=>this.#check());port.checkManaged();if(port.stamp()!==stamp)throw fail('restored_local_operation_source_changed');
    this.#owner=owner;this.#opening=false;settled=true;
   },abandon:()=>{if(!settled){this.#opening=false;settled=true;}}};
  },
  readSource:(owner:object)=>{if(this.#owner!==owner)throw fail('restored_local_operation_source');const port=independentHistoryNative(owner);if(port.localOperation!==this||port.companion)throw fail('restored_local_operation_source');return port.read();},
  borrowRead:(owner:object,provided:()=>void,providedSignal?:AbortSignal,providedFactory?:SharedIndependentRecoveryFactory)=>{
   if(this.#readers.size>=8)throw fail('restored_local_operation_busy');const authorize=participantAuthority(provided),signal=independentRecoverySignal(providedSignal);
   let released=false,finish!:()=>void,factory=this.#choice.read.options.session;const held=new Promise<void>(resolve=>{finish=resolve;}),release=()=>{if(!released){released=true;this.#readers.delete(held);finish();}};this.#readers.add(held);
   const check=()=>{if(released)throw fail('restored_local_operation_read_closed');this.#readable();if(this.#owner!==owner)throw fail('restored_local_operation_source');const port=independentHistoryNative(owner);if(port.localOperation!==this||port.companion)throw fail('restored_local_operation_source');checkAssetBytesSignal(signal);authorize();checkAssetBytesSignal(signal);this.#readable();port.check();};
   // Snapshot fresh executable read policy after reservation, before authority.
   // Retiring a host writer factory must not prevent an independently selected
   // matching read-only factory from admitting the actual retained native cuts.
   try{if(providedFactory!==undefined)factory=snapshotIndependentRecoveryFactory(this.#choice.expected.original,providedFactory);check();}catch(error){release();throw error;}
   const track=<T>(run:()=>Promise<T>):Promise<T>=>{check();if(this.#readers.size>=8)throw fail('restored_local_operation_busy');const work=Promise.resolve().then(run);this.#readers.add(work);void work.finally(()=>this.#readers.delete(work)).catch(()=>{});return work;};
   return Object.freeze({identity:structuredClone(this.#id),expected:structuredClone(this.#choice.expected),check,release,
    inputFile:()=>{check();return incoming.file.call(this.#input);},originalFile:()=>{check();return incoming.originalFile.call(this.#input);},uploads:()=>{check();return incoming.uploads.call(this.#input);},blob:(asset:string,generation:string)=>{check();return incoming.blob.call(this.#input,asset,generation);},
    readSource:()=>{check();const port=independentHistoryNative(owner),stamp=port.stamp(),data=port.read();this.#verify(port.core,data.versions,check);if(port.stamp()!==stamp)throw fail('restored_local_operation_capture_changed');return data;},
    readSnapshot:()=>track(async()=>{
     let selected:LocalPortableReplay|undefined;
     let result:Readonly<{record:Checked['record'];input:Blob;current:IndependentHistoryCut|null;pending:IndependentHistoryCut|null;observed:string|null}>;
     try{
      // A freshly selected runtime reconstructs its own readonly LIVE anchor
      // from exact owned data. Never pass an old runtime's native pointer into
      // another Wasm instance when comparing current/pending ancestry.
      if(providedFactory!==undefined){selected=await replayLocalOperationRecovery(this.#choice.expected.original,factory,this.#anchor.recovery,check);check();}
      const anchor=selected??this.#anchor,a=await this.#read(check,factory,anchor);check();const observed=await this.#source(check);check();const b=await this.#read(check,factory,anchor);check();
      if(JSON.stringify(a.record)!==JSON.stringify(b.record))throw fail('restored_local_operation_capture_changed');const r=a.record,current=r.current===null?null:a.rows.get(r.current)!,pending=r.pending===null?null:a.rows.get(r.pending)!;
      if(observed===null?current!==null:!((current&&same(observed,current))||(pending&&same(observed,pending))))throw fail('restored_local_operation_source_diverged');
      result={record:{...r},input:a.file,current:current&&copyOperationCut(current),pending:pending&&copyOperationCut(pending),observed:observed===null?null:observed.head===current?.head?r.current:r.pending};
     }finally{selected?.dispose();}
     check();return result;
    }),
   });
  },
 };}
 static{binding=journal=>{if(!journal||typeof journal!=='object'||!(#id in journal)||journal.#closed)throw fail('restored_local_operation_closed');return journal.bindingType();};openForParticipant=(parent,provided,file)=>RestoredLocalOperationJournal.#open(provided,file,parent,true);}
}
const close=RestoredLocalOperationJournal.prototype.close;
/** An actual private journal, not a stored completion flag or structural DTO. */
export const restoredLocalJournalBinding=(journal:RestoredLocalOperationJournal)=>binding(journal);
/** The actual current parent/context/cohort delegates only its native pair.
 * A serialized flag or retired opening cannot bypass namespace reservation. */
export const openRestoredLocalJournalForParticipant=<P extends SharedSelectionPolicy>(parent:RestoredLocalParticipantOpening,provided:RestoredLocalInputOptions<P>,file?:Blob)=>openForParticipant(parent,provided,file);
