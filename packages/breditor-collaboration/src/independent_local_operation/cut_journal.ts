/** Actual local original/current/pending custody for one live native source.
 * No delivery identity, outbox, old completion marker or activation is inferred. */
import type {SharedSelectionPolicy} from '../types.js';
import type {IndependentHistoryCut,IndependentHistoryStoredCut} from '../independent_history/contract.js';
import type {IndependentLocalOperationDriver} from '../independent_history/local_driver.js';
import {makeIndependentHistoryCut} from '../independent_history/cut.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
import {SharedIndependentParticipantBackup as Backup} from '../independent_participant/backup.js';
import {independentParticipantDigest} from '../independent_participant/codec.js';
import {copyOperationCut,readOperationCut,sameOperationCut,operationCutDigest} from '../independent_operation/cut_codec.js';
import {readDedicatedOperationSourceDatabase} from '../independent_operation/read_source_database.js';
import {RecoveryLease} from '../participant_recovery/lease.js';
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {requireAbsent} from '../participant_recovery/inspect.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {SharedAssetBytesError} from '../asset_bytes/guards.js';
import {observeIndependentRecoveryAbort} from '../independent_recovery/signal.js';
import {IndependentLocalNativeOperationOrigin,independentLocalNativeOriginGuard,independentLocalNativeOriginReadGuard} from './native_origin.js';
import {snapshotLocalJournal,type LocalOperationJournalBeginOptions,type LocalOperationJournalResumeOptions} from './journal_policy.js';
import {localOperationJournalIdentity,type LocalOperationJournalIdentity} from './journal_identity.js';
import {initialLocalOperationIntent} from './cut_intent.js';
import {readLocalOperationHead,wrapLocalOperationHead} from './operation_head.js';
import {createLocalJournalDatabase,existingLocalJournalDatabase,readLocalJournalDatabase,writeLocalJournalDatabase,type LocalJournalChecked} from './journal_database.js';
import {localJournalFailure as fail} from './journal_failure.js';
import {localParticipantJournalOpening,type LocalOperationParticipantOpening} from './participant_opening.js';
const key=Object.freeze({}),p=Backup.prototype,archive=Object.freeze({read:Backup.read,file:p.file,recovery:p.sourceRecovery,blob:p.blob,dispose:p.dispose}),readOrigin=IndependentLocalNativeOperationOrigin.read,disposeOrigin=IndependentLocalNativeOperationOrigin.prototype.dispose;
type Choice=ReturnType<typeof snapshotLocalJournal>;
type Checked=LocalJournalChecked&{readonly decoded:ReadonlyMap<string,IndependentHistoryStoredCut>};
/** Compare already decoded native cuts through their exact head/file value, not
 * their additional runtime replay metadata. Raw store rows still use strict admission. */
const sameCut=(actual:IndependentHistoryCut,selected:IndependentHistoryCut)=>sameOperationCut(copyOperationCut(actual),selected);
let binding:(journal:IndependentLocalOperationCutJournal)=>ReturnType<IndependentLocalOperationCutJournal['bindingType']>;
let openForParticipant:<P extends SharedSelectionPolicy>(parent:LocalOperationParticipantOpening,options:LocalOperationJournalResumeOptions<P>,resume:boolean)=>Promise<IndependentLocalOperationCutJournal>;
export class IndependentLocalOperationCutJournal{
 readonly #choice:Choice;readonly #id:LocalOperationJournalIdentity;readonly #db:IDBDatabase;readonly #lease:RecoveryLease;readonly #original:Backup;readonly #origin:IndependentLocalNativeOperationOrigin;
 readonly #context:IDBFactory;readonly #locks:LockManager;readonly #authority:()=>void;readonly #baseline:IndependentHistoryStoredCut;
 readonly #native:ReturnType<typeof independentLocalNativeOriginGuard>;readonly #readNative:ReturnType<typeof independentLocalNativeOriginReadGuard>;readonly #driver:IndependentLocalOperationDriver;
 readonly #readers=new Set<Promise<unknown>>();#owner:object|undefined;#opening=false;#working=false;#closed=false;#changed=false;#dbClosed=false;#closing:Promise<void>|undefined;#sourceReleasePending=false;
 #readEpoch:object=Object.freeze({});
 private constructor(token:object,choice:Choice,id:LocalOperationJournalIdentity,db:IDBDatabase,lease:RecoveryLease,original:Backup,origin:IndependentLocalNativeOperationOrigin,context:IDBFactory,locks:LockManager,authority:()=>void,baseline:IndependentHistoryStoredCut){
  if(token!==key)throw fail('independent_local_operation_closed');this.#choice=choice;this.#id=id;this.#db=db;this.#lease=lease;this.#original=original;this.#origin=origin;this.#context=context;this.#locks=locks;this.#authority=authority;this.#baseline=baseline;this.#native=independentLocalNativeOriginGuard(origin);this.#readNative=independentLocalNativeOriginReadGuard(origin);
  this.#driver=Object.freeze({operation:this,storage:'local-operation-v1',readHead:this.#readHead,wrap:(head:string)=>wrapLocalOperationHead(head,this.#id),nativeCaptureGuard:Object.freeze({check:()=>this.#check(),capture:(...args:Parameters<ReturnType<typeof independentLocalNativeOriginGuard>['capture']>)=>{this.#check();if(this.#owner&&independentHistoryNative(this.#owner).core!==args[0])throw fail('independent_local_operation_source');this.#native.capture(...args);this.#check();},signal:choice.signal}),persistence:Object.freeze({select:(actual:IndependentHistoryStoredCut|null)=>this.#select(actual),prepare:(expected:string|null,cut:IndependentHistoryCut)=>this.#prepare(expected,cut),acknowledge:(cut:IndependentHistoryCut)=>this.#acknowledge(cut),release:async()=>{if(this.#owner){this.#owner=undefined;this.#sourceReleasePending=true;}if(this.#sourceReleasePending)await closeJournal.call(this);}})});
  db.onversionchange=()=>{this.#changed=true;this.#dbClosed=true;db.close();};Object.freeze(this);
 }
 static begin<P extends SharedSelectionPolicy>(options:LocalOperationJournalBeginOptions<P>):Promise<IndependentLocalOperationCutJournal>{if(this!==IndependentLocalOperationCutJournal)throw fail('independent_local_operation_policy');return IndependentLocalOperationCutJournal.#open(options,false);}
 static resume<P extends SharedSelectionPolicy>(options:LocalOperationJournalResumeOptions<P>):Promise<IndependentLocalOperationCutJournal>{if(this!==IndependentLocalOperationCutJournal)throw fail('independent_local_operation_policy');return IndependentLocalOperationCutJournal.#open(options,true);}
 static async #open<P extends SharedSelectionPolicy>(input:LocalOperationJournalResumeOptions<P>,resume:boolean,parent?:LocalOperationParticipantOpening,delegated=false):Promise<IndependentLocalOperationCutJournal>{
  const context=recoveryOpeningContext(),locks=navigator.locks,choice=snapshotLocalJournal(input,!resume),current=()=>{if(globalThis.indexedDB!==context||globalThis.navigator?.locks!==locks)throw fail('independent_local_operation_storage_changed');},guard=()=>{current();choice.guard();current();};let db:IDBDatabase|undefined,lease:RecoveryLease|undefined,original:Backup|undefined,origin:IndependentLocalNativeOperationOrigin|undefined;
  const cleanup=async()=>{const results=await Promise.allSettled([Promise.resolve().then(()=>db?.close()),Promise.resolve().then(()=>{if(origin)disposeOrigin.call(origin);}),Promise.resolve().then(()=>{if(original)archive.dispose.call(original);}),Promise.resolve().then(()=>lease?.close())]);if(results.some(row=>row.status==='rejected'))throw fail('independent_local_operation_cleanup');};
  const opening=delegated?localParticipantJournalOpening(parent!,context,[choice.database,choice.sourceDatabase],cleanup):await RecoveryOpeningCustody.reserve(context,[choice.database,choice.sourceDatabase],cleanup,{policy:()=>fail('independent_local_operation_policy'),busy:()=>fail('independent_local_operation_busy'),storage:()=>fail('independent_local_operation_cleanup')});
  try{guard();lease=await RecoveryLease.acquire(JSON.stringify(choice.database));guard();const id=await localOperationJournalIdentity(choice.database,choice.sourceDatabase,choice.expected);guard();let file=choice.file;
   if(resume){db=await existingLocalJournalDatabase(choice.database,guard);file=(await readLocalJournalDatabase(db,id,guard)).file;guard();}else{await requireAbsent(choice.sourceDatabase);guard();}
   if(!file)throw fail('independent_local_operation_missing');original=await archive.read.call(Backup,file,choice.expected,{limits:choice.limits,...(choice.signal?{signal:choice.signal}:{})});guard();origin=await readOrigin.call(IndependentLocalNativeOperationOrigin,{backup:original,expected:choice.expected,session:choice.session,checkAuthority:guard,...(choice.signal?{signal:choice.signal}:{})});guard();
   const recovery=archive.recovery.call(original),cut=await makeIndependentHistoryCut(recovery.documentCheckpoint,recovery.reviewCheckpoint,recovery.identity,recovery.versions);guard();const baseline=await readOperationCut({head:wrapLocalOperationHead(cut.head,id),files:cut.files},head=>readLocalOperationHead(head,id));guard();db??=await createLocalJournalDatabase(context,choice.database,initialLocalOperationIntent(id),archive.file.call(original),guard,choice.signal);guard();
   const result=new IndependentLocalOperationCutJournal(key,choice,id,db,lease,original,origin,context,locks,guard,baseline);await result.#read();guard();opening.complete();return result;
  }catch(error){await opening.rollback();throw error;}
 }
 #readable():void{if(this.#closed||this.#closing)throw fail('independent_local_operation_closed');if(this.#changed||this.#dbClosed||globalThis.indexedDB!==this.#context||globalThis.navigator?.locks!==this.#locks)throw fail('independent_local_operation_storage_changed');this.#readNative.check();}
 #check():void{this.#readable();this.#authority();this.#readable();this.#native.check();this.#readable();}
 #readHead=(head:string)=>{const record=readLocalOperationHead(head,this.#id);if(JSON.stringify(record.identity)!==JSON.stringify(this.#choice.expected.identity.source))throw fail('independent_local_operation_source');return record;};
 async #read(guard:()=>void=()=>this.#check(),options?:Readonly<{signal?:AbortSignal}>):Promise<Checked>{
  const signal=options?options.signal:this.#choice.signal;guard();const stored=await readLocalJournalDatabase(this.#db,this.#id,guard);guard();if(await independentParticipantDigest(stored.file,signal)!==this.#id.origin)throw fail('independent_local_operation_original_changed');guard();const rows=new Map<string,IndependentHistoryCut>(),decoded=new Map<string,IndependentHistoryStoredCut>(),versions=archive.recovery.call(this.#original).versions;
  for(const[key,raw]of stored.rows){const cut=await readOperationCut(raw,this.#readHead);guard();if(await operationCutDigest(cut)!==key||versions.some(packet=>!cut.record.versions.includes(packet)))throw fail('independent_local_operation_cut');guard();rows.set(key,copyOperationCut(cut));decoded.set(key,cut);}return{...stored,rows,decoded};
 }
 #source(guard:()=>void=()=>this.#check()):Promise<IndependentHistoryStoredCut|null>{const n=this.#choice.expected.identity.source.native;return readDedicatedOperationSourceDatabase(this.#id.sourceDatabase,[n.room,n.writer],this.#readHead,guard,'local-operation-v1');}
 #exclusive<T>(work:()=>Promise<T>):Promise<T>{if(this.#closed||this.#closing)throw fail('independent_local_operation_closed');if(this.#working)throw fail('independent_local_operation_busy');this.#readEpoch=Object.freeze({});this.#working=true;return Promise.resolve().then(work).finally(()=>{this.#working=false;});}
 #select(actual:IndependentHistoryStoredCut|null):Promise<IndependentHistoryStoredCut|null>{return this.#exclusive(async()=>{
  if(!this.#opening||this.#owner)throw fail('independent_local_operation_in_use');const state=await this.#read(),observed=await this.#source();this.#check();if(actual===null?observed!==null:observed===null||!sameCut(observed,actual))throw fail('independent_local_operation_source_changed');const r=state.record,current=r.current===null?null:state.decoded.get(r.current)!,pending=r.pending===null?null:state.decoded.get(r.pending)!;
  if(actual===null?current!==null:!((current&&sameCut(actual,current))||(pending&&sameCut(actual,pending))))throw fail('independent_local_operation_source_diverged');return pending??current??this.#baseline;
 });}
 #prepare(expected:string|null,input:IndependentHistoryCut):Promise<void>{return this.#exclusive(async()=>{
  if(!this.#opening&&!this.#owner)throw fail('independent_local_operation_in_use');const cut=await readOperationCut(copyOperationCut(input),this.#readHead);this.#check();const key=await operationCutDigest(cut);this.#check();let state=await this.#read();const current=state.record.current===null?null:state.rows.get(state.record.current)!,pending=state.record.pending===null?null:state.rows.get(state.record.pending)!;
  if(current&&sameCut(current,cut)){const actual=await this.#source();this.#check();if(!actual||!sameCut(actual,cut))throw fail('independent_local_operation_source_diverged');return;}
  if(expected!==(current?.head??null)&&expected!==pending?.head)throw fail('independent_local_operation_source_diverged');if(pending){if(state.record.pending!==key||!sameCut(pending,cut))throw fail('independent_local_operation_pending');return;}
  const next={...state.record,sequence:(BigInt(state.record.sequence)+1n).toString(),pending:key};await writeLocalJournalDatabase(this.#db,this.#id,state,next,{id:key,cut},()=>this.#check(),this.#choice.signal);this.#check();state=await this.#read();if(JSON.stringify(state.record)!==JSON.stringify(next)||!sameOperationCut(state.rows.get(key),cut))throw fail('independent_local_operation_cut');
 });}
 #acknowledge(input:IndependentHistoryCut):Promise<void>{return this.#exclusive(async()=>{
  const cut=await readOperationCut(copyOperationCut(input),this.#readHead);this.#check();const key=await operationCutDigest(cut);this.#check();const actual=await this.#source();this.#check();if(!actual||!sameCut(actual,cut))throw fail('independent_local_operation_source_diverged');const state=await this.#read();if(state.record.current===key&&state.record.pending===null){if(!sameOperationCut(state.rows.get(key),cut))throw fail();return;}if(state.record.pending!==key||!sameOperationCut(state.rows.get(key),cut))throw fail('independent_local_operation_pending');const next={...state.record,sequence:(BigInt(state.record.sequence)+1n).toString(),current:key,pending:null};await writeLocalJournalDatabase(this.#db,this.#id,state,next,undefined,()=>this.#check(),this.#choice.signal);this.#check();const saved=await this.#read();if(JSON.stringify(saved.record)!==JSON.stringify(next))throw fail('independent_local_operation_cut');
 });}
 progress(){return this.#exclusive(async()=>{const s=await this.#read();return Object.freeze({sequence:s.record.sequence,current:s.record.current,pending:s.record.pending});});}
 /** Owned original data remains exportable after grant loss; not permission to write. */
 file():Blob{if(this.#closed)throw fail('independent_local_operation_closed');return archive.file.call(this.#original);}
 blob(asset:string,generation:string):Blob|undefined{if(this.#closed)throw fail('independent_local_operation_closed');return archive.blob.call(this.#original,asset,generation);}
 close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#owner||this.#opening||this.#working)throw fail('independent_local_operation_in_use');if(this.#closing)return this.#closing;this.#closing=Promise.resolve().then(async()=>{while(this.#readers.size)await Promise.allSettled([...this.#readers]);if(!this.#dbClosed){this.#db.close();this.#dbClosed=true;}await this.#lease.close();disposeOrigin.call(this.#origin);archive.dispose.call(this.#original);this.#closed=true;}).finally(()=>{this.#closing=undefined;});return this.#closing;}
 private bindingType(){return{
  expected:structuredClone(this.#choice.expected),sourceDatabase:this.#id.sourceDatabase,driver:this.#driver,
  reserve:()=>{if(this.#closed||this.#closing||this.#owner||this.#opening||this.#working)throw fail('independent_local_operation_in_use');this.#opening=true;try{this.#check();}catch(error){this.#opening=false;throw error;}let settled=false;return{claim:(owner:object)=>{if(settled||!this.#opening||this.#owner)throw fail('independent_local_operation_in_use');this.#check();const port=independentHistoryNative(owner);if(port.localOperation!==this||port.companion||JSON.stringify(port.identity)!==JSON.stringify(this.#choice.expected.identity.source))throw fail('independent_local_operation_source');this.#check();this.#owner=owner;this.#opening=false;settled=true;},abandon:()=>{if(!settled){this.#opening=false;settled=true;}}};},
  readSource:(owner:object)=>{if(this.#owner!==owner)throw fail('independent_local_operation_source');const port=independentHistoryNative(owner);if(port.localOperation!==this||port.companion)throw fail('independent_local_operation_source');return port.read();},
  borrowRead:(owner:object,readAuthority:()=>void,providedSignal?:AbortSignal)=>{
   if(this.#readers.size>=8)throw fail('independent_local_operation_busy');const authority=participantAuthority(readAuthority),signal=providedSignal;let released=false,finish!:()=>void,observation:ReturnType<typeof observeIndependentRecoveryAbort>|undefined;const held=new Promise<void>(resolve=>{finish=resolve;}),release=()=>{if(!released){released=true;observation?.release();this.#readers.delete(held);finish();}};this.#readers.add(held);
   try{observation=observeIndependentRecoveryAbort(signal,held);}catch(error){release();throw error;}
   const checkCurrent=()=>{if(released)throw fail('independent_local_operation_read_closed');this.#readable();if(this.#owner!==owner)throw fail('independent_local_operation_source');const port=independentHistoryNative(owner);if(port.localOperation!==this||port.companion)throw fail('independent_local_operation_source');if(observation!.aborted())throw new SharedAssetBytesError('asset_bytes_aborted','Asset byte work was cancelled');port.checkBorrowed(port.core);};
   const check=()=>{checkCurrent();authority();checkCurrent();};
   try{check();}catch(error){release();throw error;}const track=<T>(run:()=>Promise<T>):Promise<T>=>{check();if(this.#readers.size>=8)throw fail('independent_local_operation_busy');const work=Promise.resolve().then(run);this.#readers.add(work);void work.finally(()=>this.#readers.delete(work)).catch(()=>{});return work;};
   return Object.freeze({identity:structuredClone(this.#id),expected:structuredClone(this.#choice.expected),check,checkCurrent,release,
    pinRetained:()=>{checkCurrent();if(this.#working)throw fail('independent_local_operation_busy');const epoch=this.#readEpoch;return()=>{checkCurrent();if(this.#working||this.#readEpoch!==epoch)throw fail('independent_local_operation_reference_changed');};},
    readSource:()=>{check();const port=independentHistoryNative(owner),stamp=port.stamp(),data=port.read();this.#readNative.capture(port.core,data.versions);check();const after=port.read();if(port.stamp()!==stamp||data.documentCheckpoint!==after.documentCheckpoint||data.reviewCheckpoint!==after.reviewCheckpoint||data.versions.length!==after.versions.length||data.versions.some((v,i)=>v!==after.versions[i]))throw fail('independent_local_operation_capture_changed');return data;},
    originalFile:()=>{check();return archive.file.call(this.#original);},blob:(asset:string,generation:string)=>{check();return archive.blob.call(this.#original,asset,generation);},
    readSnapshot:()=>track(async()=>{const options=signal?{signal}:{};const a=await this.#read(check,options);check();const observed=await this.#source(check);check();const b=await this.#read(check,options);check();if(JSON.stringify(a.record)!==JSON.stringify(b.record))throw fail('independent_local_operation_capture_changed');const current=a.record.current===null?null:a.rows.get(a.record.current)!,pending=a.record.pending===null?null:a.rows.get(a.record.pending)!;if(observed===null?current!==null:!((current&&sameCut(observed,current))||(pending&&sameCut(observed,pending))))throw fail('independent_local_operation_source_diverged');return{record:{...a.record},file:a.file,current:current&&copyOperationCut(current),pending:pending&&copyOperationCut(pending),observed:observed===null?null:observed.head===current?.head?a.record.current:a.record.pending};}),
   });
  },
 };}
 static{binding=journal=>{if(!journal||typeof journal!=='object'||!(#id in journal)||journal.#closed)throw fail('independent_local_operation_closed');return journal.bindingType();};openForParticipant=(parent,options,resume)=>IndependentLocalOperationCutJournal.#open(options,resume,parent,true);}
}
const closeJournal=IndependentLocalOperationCutJournal.prototype.close;
/** Actual brand admission. This reads no fake object's supplied fields/methods. */
export const localOperationJournalBinding=(journal:IndependentLocalOperationCutJournal)=>binding(journal);
/** A real parent opening may delegate its already reserved journal subset. Old
 * public option fields and ordinary namespace exclusion are unchanged. */
export const openLocalJournalForParticipant=<P extends SharedSelectionPolicy>(parent:LocalOperationParticipantOpening,options:LocalOperationJournalResumeOptions<P>,resume:boolean)=>openForParticipant(parent,options,resume);
