/** Shared native-input journal machinery. Closed intrinsic family slots select
 * concrete codecs and wire semantics; data/caller adapters never do. Each actual
 * kernel has exactly one genuine facade, preserves source-owned input lifetime
 * and keeps permission separate from native/provenance admission. */
import {SharedRichEditor,SharedEditorError} from '../core.js';
import {retainedOperationCuts,sameRetainedOperationCuts,type RetainedOperationCut} from '../operation_read/retained_cuts.js';
import {recordReadMode,type OperationalRecordReadMode} from '../operation_read/record_payload.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {IndependentHistoryCut,IndependentHistoryStoredCut} from '../independent_history/contract.js';
import type {IndependentLocalOperationDriver} from '../independent_history/local_driver.js';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import {snapshotIndependentRecoveryFactory} from '../independent_recovery/factory_policy.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {copyOperationCut,readOperationCut,sameOperationCut,operationCutDigest} from '../independent_operation/cut_codec.js';
import {readDedicatedOperationSourceDatabase} from '../independent_operation/read_source_database.js';
import {replayLocalOperationRecovery,type LocalPortableReplay} from '../independent_local_operation/portable_replay.js';
import {RecoveryLease} from '../participant_recovery/lease.js';
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {requireAbsent} from '../participant_recovery/inspect.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {observeIndependentRecoveryAbort} from '../independent_recovery/signal.js';
import {SharedAssetBytesError} from '../asset_bytes/guards.js';
import {nativeInputJournalFamily,type NativeInputJournalFamily} from './journal_families.js';
import type {NativeInputJournalChoice,NativeInputCutIntent,NativeInputJournalIdentity,NativeInputJournalIntrinsics,NativeInputJournalChecked} from './journal_contract.js';
const key=Object.freeze({}),verifyOriginal=SharedRichEditor.prototype.verifyRecoveryOrigin,verifySegmented=SharedRichEditor.prototype.verifySegmentedRecoveryOrigin;
const same=(actual:IndependentHistoryCut,selected:IndependentHistoryCut)=>sameOperationCut(copyOperationCut(actual),selected);
let binding:<A,C extends NativeInputJournalChoice,O,R extends NativeInputCutIntent,F extends object>(journal:NativeInputJournal<A,C,O,R,F>,facade:F)=>ReturnType<NativeInputJournal<A,C,O,R,F>['bindingType']>;
let creation:<A,C extends NativeInputJournalChoice,O,R extends NativeInputCutIntent,F extends object>(journal:NativeInputJournal<A,C,O,R,F>,family:NativeInputJournalFamily<A,C,O,R,F>)=>void;
export class NativeInputJournal<A,C extends NativeInputJournalChoice,O,R extends NativeInputCutIntent,F extends object>{
 readonly #family:NativeInputJournalFamily<A,C,O,R,F>;readonly #intrinsics:NativeInputJournalIntrinsics<A,C,O,R,F>;
 readonly #choice:C;readonly #id:NativeInputJournalIdentity;readonly #db:IDBDatabase;readonly #lease:RecoveryLease;
 readonly #input:O;readonly #anchor:LocalPortableReplay;readonly #baseline:IndependentHistoryStoredCut;
 readonly #context:IDBFactory;readonly #locks:LockManager;readonly #authority:()=>void;
 #facade:F|undefined;#facadePhase:'idle'|'ready'|'claimed'|'attached'='idle';#exposed=false;#driver!:IndependentLocalOperationDriver;readonly #readers=new Set<Promise<unknown>>();
 #owner:object|undefined;#opening=false;#working=false;#closed=false;#changed=false;#dbClosed=false;#closing:Promise<void>|undefined;#sourceReleasePending=false;
 #readEpoch:object=Object.freeze({});
 private constructor(token:object,family:NativeInputJournalFamily<A,C,O,R,F>,intrinsics:NativeInputJournalIntrinsics<A,C,O,R,F>,choice:C,id:NativeInputJournalIdentity,db:IDBDatabase,lease:RecoveryLease,input:O,anchor:LocalPortableReplay,baseline:IndependentHistoryStoredCut,context:IDBFactory,locks:LockManager,authority:()=>void){
  if(token!==key)throw new SharedEditorError('native_input_operation_closed','Use a genuine family opener');
  this.#family=family;this.#intrinsics=intrinsics;this.#choice=choice;this.#id=id;this.#db=db;this.#lease=lease;this.#input=input;this.#anchor=anchor;this.#baseline=baseline;this.#context=context;this.#locks=locks;this.#authority=authority;
  db.onversionchange=()=>{this.#changed=true;this.#dbClosed=true;db.close();};Object.freeze(this);
 }
 #error=(suffix?:string)=>this.#intrinsics.error(suffix);
 #attachFacade(facade:F):void{
  if(this.#facade!==undefined||this.#facadePhase!=='claimed')throw this.#error('in_use');this.#facade=facade;this.#facadePhase='attached';
  this.#driver=Object.freeze({operation:facade,storage:'local-operation-v1',readHead:this.#readHead,wrap:(head:string)=>this.#intrinsics.head.wrap(head,this.#id),
   nativeCaptureGuard:Object.freeze({check:()=>this.#check(),capture:(core:SharedRichEditor<SharedSelectionPolicy>,versions:readonly string[])=>{this.#check();if(this.#owner&&independentHistoryNative(this.#owner).core!==core)throw this.#error('source');this.#verify(core,versions,()=>this.#check());},signal:this.#choice.read.options.signal}),
   persistence:Object.freeze({select:(actual:IndependentHistoryStoredCut|null)=>this.#select(actual),prepare:(expected:string|null,cut:IndependentHistoryCut)=>this.#prepare(expected,cut),acknowledge:(cut:IndependentHistoryCut)=>this.#acknowledge(cut),release:async()=>{if(this.#owner){this.#owner=undefined;this.#sourceReleasePending=true;}if(this.#sourceReleasePending)await close.call(this);}}),
  });
 }
 static async open<A,C extends NativeInputJournalChoice,O,R extends NativeInputCutIntent,F extends object>(family:NativeInputJournalFamily<A,C,O,R,F>,provided:NoInfer<A>,file?:Blob,parent?:unknown,delegated=false):Promise<F>{
  const intrinsics=nativeInputJournalFamily(family),context=recoveryOpeningContext(),locks=navigator.locks,choice=intrinsics.snapshot(provided),fail=intrinsics.error;
  if(choice.kind!==intrinsics.kind)throw fail();if(!!choice.cohort!==delegated)throw fail('parent_required');
  const storage=()=>{if(globalThis.indexedDB!==context||globalThis.navigator?.locks!==locks)throw fail('storage_changed');};
  const guard=()=>{storage();choice.guard();storage();};
  let db:IDBDatabase|undefined,lease:RecoveryLease|undefined,input:O|undefined,anchor:LocalPortableReplay|undefined,admitted=false;
  const cleanup=async()=>{const results=await Promise.allSettled([Promise.resolve().then(()=>db?.close()),Promise.resolve().then(()=>anchor?.dispose()),Promise.resolve().then(()=>{if(input)intrinsics.input.dispose(input);}),Promise.resolve().then(()=>lease?.close())]);if(results.some(row=>row.status==='rejected'))throw fail('cleanup');};
  const opening=delegated?intrinsics.delegate(parent,context,[choice.database,choice.sourceDatabase],choice.names,cleanup):await RecoveryOpeningCustody.reserve(context,choice.names,cleanup,{policy:()=>fail(),busy:()=>fail('busy'),storage:()=>fail('cleanup')});
  try{
   guard();lease=await RecoveryLease.acquire(JSON.stringify(choice.database));guard();
   if(file===undefined){db=await intrinsics.database.existing(choice.database,guard);file=await intrinsics.database.input(db,guard);guard();}else{await requireAbsent(choice.sourceDatabase);guard();}
   input=await intrinsics.input.read(file,choice);guard();const id=intrinsics.input.identity(input),live=intrinsics.input.live(input),targets=intrinsics.input.targets(input),last=targets.at(-1);if(!last)throw fail();
   const readableOrigin=()=>{storage();if(!admitted)guard();if(!input)throw fail();intrinsics.input.check(input);};
   anchor=await replayLocalOperationRecovery(choice.expected.original,choice.read.options.session,live,readableOrigin);guard();const baseline=await readOperationCut(last,head=>intrinsics.head.read(head,id));guard();
   db??=await intrinsics.database.create(context,choice.database,intrinsics.initial(id),intrinsics.input.file(input),guard,choice.read.options.signal);guard();
   const kernel=new NativeInputJournal(key,family,intrinsics,choice,id,db,lease,input,anchor,baseline,context,locks,guard);kernel.#facadePhase='ready';const facade=intrinsics.facade(kernel);kernel.#attachFacade(facade);
   await kernel.#read();guard();admitted=true;opening.complete();kernel.#exposed=true;return facade;
  }catch(error){await opening.rollback();throw error;}
 }
 #readable():void{
  if(this.#closed||this.#closing)throw this.#error('closed');
  if(this.#changed||this.#dbClosed||globalThis.indexedDB!==this.#context||globalThis.navigator?.locks!==this.#locks)throw this.#error('storage_changed');
  this.#intrinsics.input.check(this.#input);this.#anchor.check();
 }
 #check():void{this.#readable();this.#authority();this.#readable();}
 #verify(core:SharedRichEditor<SharedSelectionPolicy>,versions:readonly string[],guard:()=>void):void{
  const expected=this.#anchor.recovery,verify=expected.identity.documentHistory==='original'?verifyOriginal:verifySegmented;
  guard();if((native.segmentedHistoryPolicy.call(core)??'original')!==expected.identity.documentHistory||native.reviewHistoryPolicy.call(core)!==expected.identity.reviewHistory||versions.length<expected.versions.length||expected.versions.some((packet,index)=>versions[index]!==packet))throw this.#error('origin');
  verify.call(core,this.#anchor.core);guard();verify.call(core,this.#anchor.core);
 }
 #readHead=(head:string)=>{const record=this.#intrinsics.head.read(head,this.#id);if(JSON.stringify(record.identity)!==JSON.stringify(this.#choice.expected.original.identity.source))throw this.#error('source');return record;};
 async #read(guard:()=>void=()=>this.#check(),factory:SharedIndependentRecoveryFactory=this.#choice.read.options.session,anchor:LocalPortableReplay=this.#anchor):Promise<NativeInputJournalChecked<R>>{
  guard();const stored=await this.#intrinsics.database.read(this.#db,this.#id,guard);guard();
  const selected=this.#intrinsics.input.file(this.#input);
  if(stored.file.size!==selected.size||stored.file.type!==selected.type)throw this.#error('input_changed');
  await this.#intrinsics.input.verifyFile(this.#input,stored.file,guard);guard();
  return this.#intrinsics.admit(stored,this.#id,this.#choice.expected.original,factory,anchor,guard);
 }
 #source(guard:()=>void=()=>this.#check()):Promise<IndependentHistoryStoredCut|null>{const n=this.#choice.expected.original.identity.source.native;return readDedicatedOperationSourceDatabase(this.#id.sourceDatabase,[n.room,n.writer],this.#readHead,guard,'local-operation-v1');}
 #exclusive<T>(work:()=>Promise<T>,retains=true):Promise<T>{if(!this.#exposed||this.#closed||this.#closing)throw this.#error('closed');if(this.#working)throw this.#error('busy');if(retains)this.#readEpoch=Object.freeze({});this.#working=true;return Promise.resolve().then(work).finally(()=>{this.#working=false;});}
 #select(actual:IndependentHistoryStoredCut|null):Promise<IndependentHistoryStoredCut|null>{return this.#exclusive(async()=>{
  if(!this.#opening||this.#owner)throw this.#error('in_use');
  const state=await this.#read(),observed=await this.#source();this.#check();if(actual===null?observed!==null:observed===null||!same(observed,actual))throw this.#error('source_changed');
  const r=state.record,current=r.current===null?null:state.decoded.get(r.current)!,pending=r.pending===null?null:state.decoded.get(r.pending)!;
  if(actual===null?current!==null:!((current&&same(actual,current))||(pending&&same(actual,pending))))throw this.#error('source_diverged');
  return pending??current??this.#baseline;
 });}
 #prepare(expected:string|null,input:IndependentHistoryCut):Promise<void>{return this.#exclusive(async()=>{
  if(!this.#opening&&!this.#owner)throw this.#error('in_use');
  const cut=await readOperationCut(copyOperationCut(input),this.#readHead);this.#check();const hash=await operationCutDigest(cut);this.#check();const state=await this.#read();
  const current=state.record.current===null?null:state.rows.get(state.record.current)!,pending=state.record.pending===null?null:state.rows.get(state.record.pending)!;
  if(current&&same(current,cut)){const actual=await this.#source();this.#check();if(!actual||!same(actual,cut))throw this.#error('source_diverged');return;}
  if(expected!==(current?.head??null)&&expected!==pending?.head)throw this.#error('source_diverged');
  if(pending){if(state.record.pending!==hash||!same(pending,cut))throw this.#error('pending');return;}
  const next={...state.record,sequence:(BigInt(state.record.sequence)+1n).toString(),pending:hash};
  // Admit the exact proposed chronological pair before persisting PREPARED.
  const candidate={...state,record:next,rows:new Map(state.rows).set(hash,copyOperationCut(cut))};
  await this.#intrinsics.admit(candidate,this.#id,this.#choice.expected.original,this.#choice.read.options.session,this.#anchor,()=>this.#check());this.#check();
  await this.#intrinsics.database.write(this.#db,this.#id,state,next,{id:hash,cut},()=>this.#check(),this.#choice.read.options.signal);this.#check();
  const saved=await this.#read();if(JSON.stringify(saved.record)!==JSON.stringify(next)||!sameOperationCut(saved.rows.get(hash),cut))throw this.#error('cut');
 });}
 #acknowledge(input:IndependentHistoryCut):Promise<void>{return this.#exclusive(async()=>{
  const cut=await readOperationCut(copyOperationCut(input),this.#readHead);this.#check();const hash=await operationCutDigest(cut);this.#check();
  const actual=await this.#source();this.#check();if(!actual||!same(actual,cut))throw this.#error('source_diverged');
  const state=await this.#read();if(state.record.current===hash&&state.record.pending===null){if(!sameOperationCut(state.rows.get(hash),cut))throw this.#error();return;}
  if(state.record.pending!==hash||!sameOperationCut(state.rows.get(hash),cut))throw this.#error('pending');
  const next={...state.record,sequence:(BigInt(state.record.sequence)+1n).toString(),current:hash,pending:null};
  await this.#intrinsics.database.write(this.#db,this.#id,state,next,undefined,()=>this.#check(),this.#choice.read.options.signal);this.#check();
  const saved=await this.#read();if(JSON.stringify(saved.record)!==JSON.stringify(next))throw this.#error('cut');
 });}
 progress(){return this.#exclusive(async()=>{const state=await this.#read();return Object.freeze({sequence:state.record.sequence,current:state.record.current,pending:state.record.pending});},false);}
 file():Blob{if(!this.#exposed||this.#closed)throw this.#error('closed');return this.#intrinsics.input.file(this.#input);}
 blob(asset:string,generation:string):Blob|undefined{if(!this.#exposed||this.#closed)throw this.#error('closed');return this.#intrinsics.input.blob(this.#input,asset,generation);}
 close():Promise<void>{
  if(this.#closed)return Promise.resolve();if(!this.#exposed)throw this.#error('closed');if(this.#owner||this.#opening||this.#working)throw this.#error('in_use');if(this.#closing)return this.#closing;
  this.#closing=Promise.resolve().then(async()=>{while(this.#readers.size)await Promise.allSettled([...this.#readers]);if(!this.#dbClosed){this.#db.close();this.#dbClosed=true;}await this.#lease.close();this.#anchor.dispose();this.#intrinsics.input.dispose(this.#input);this.#closed=true;}).finally(()=>{this.#closing=undefined;});return this.#closing;
 }
 private bindingType(){return{
  expected:structuredClone(this.#choice.expected),sourceDatabase:this.#id.sourceDatabase,driver:this.#driver,
  reserve:()=>{
   if(this.#closed||this.#closing||this.#owner||this.#opening||this.#working)throw this.#error('in_use');this.#opening=true;
   try{this.#check();}catch(error){this.#opening=false;throw error;}
   let settled=false;return{claim:(owner:object)=>{
    if(settled||!this.#opening||this.#owner)throw this.#error('in_use');this.#check();
    const port=independentHistoryNative(owner);if(port.localOperation!==this.#facade||port.companion||JSON.stringify(port.identity)!==JSON.stringify(this.#choice.expected.original.identity.source))throw this.#error('source');
    const stamp=port.stamp(),data=port.read();this.#verify(port.core,data.versions,()=>this.#check());port.checkManaged();if(port.stamp()!==stamp)throw this.#error('source_changed');
    this.#owner=owner;this.#opening=false;settled=true;
   },abandon:()=>{if(!settled){this.#opening=false;settled=true;}}};
  },
  readSource:(owner:object)=>{if(this.#owner!==owner)throw this.#error('source');const port=independentHistoryNative(owner);if(port.localOperation!==this.#facade||port.companion)throw this.#error('source');return port.read();},
  borrowRead:(owner:object,provided:()=>void,providedSignal?:AbortSignal,providedFactory?:SharedIndependentRecoveryFactory)=>{
   if(this.#readers.size>=8)throw this.#error('busy');const authorize=participantAuthority(provided),signal=providedSignal;
   let released=false,finish!:()=>void,factory=this.#choice.read.options.session,observation:ReturnType<typeof observeIndependentRecoveryAbort>|undefined;const held=new Promise<void>(resolve=>{finish=resolve;}),release=()=>{if(!released){released=true;observation?.release();this.#readers.delete(held);finish();}};this.#readers.add(held);
   try{observation=observeIndependentRecoveryAbort(signal,held);}catch(error){release();throw error;}
   const checkCurrent=()=>{if(released)throw this.#error('read_closed');this.#readable();if(this.#owner!==owner)throw this.#error('source');const port=independentHistoryNative(owner);if(port.localOperation!==this.#facade||port.companion)throw this.#error('source');if(observation!.aborted())throw new SharedAssetBytesError('asset_bytes_aborted','Asset byte work was cancelled');port.checkBorrowed(port.core);};
   const check=()=>{checkCurrent();authorize();checkCurrent();};
   // Snapshot fresh executable read policy after reservation, before authority.
   // Retiring a host writer factory must not prevent an independently selected
   // matching read-only factory from admitting the actual retained native cuts.
   try{if(providedFactory!==undefined)factory=snapshotIndependentRecoveryFactory(this.#choice.expected.original,providedFactory);check();}catch(error){release();throw error;}
   const track=<T>(run:()=>Promise<T>):Promise<T>=>{check();if(this.#readers.size>=8)throw this.#error('busy');const work=Promise.resolve().then(run);this.#readers.add(work);void work.finally(()=>this.#readers.delete(work)).catch(()=>{});return work;};
   return Object.freeze({identity:structuredClone(this.#id),expected:structuredClone(this.#choice.expected),check,checkCurrent,release,
    pinRetained:()=>{checkCurrent();if(this.#working)throw this.#error('busy');const epoch=this.#readEpoch;return()=>{checkCurrent();if(this.#working||this.#readEpoch!==epoch)throw this.#error('reference_changed');};},
    inputFile:()=>{check();return this.#intrinsics.input.file(this.#input);},originalFile:()=>{check();return this.#intrinsics.input.originalFile(this.#input);},uploads:()=>{check();return this.#intrinsics.input.uploads(this.#input);},blob:(asset:string,generation:string)=>{check();return this.#intrinsics.input.blob(this.#input,asset,generation);},
    readSource:()=>{check();const port=independentHistoryNative(owner),stamp=port.stamp(),data=port.read();this.#verify(port.core,data.versions,check);if(port.stamp()!==stamp)throw this.#error('capture_changed');return data;},
    readSnapshot:(mode?:OperationalRecordReadMode)=>track(async()=>{
     recordReadMode(mode);
     let selected:LocalPortableReplay|undefined;
     let result:Readonly<{record:R;input:Blob;current:IndependentHistoryCut|null;pending:IndependentHistoryCut|null;observed:string|null;retained?:readonly RetainedOperationCut[]}>;
     try{
      // A freshly selected runtime reconstructs its own readonly LIVE anchor
      // from exact owned data. Never pass an old runtime's native pointer into
      // another Wasm instance when comparing current/pending ancestry.
      if(providedFactory!==undefined){selected=await replayLocalOperationRecovery(this.#choice.expected.original,factory,this.#anchor.recovery,check);check();}
      const anchor=selected??this.#anchor,a=await this.#read(check,factory,anchor);check();const observed=await this.#source(check);check();const b=await this.#read(check,factory,anchor);check();
      if(JSON.stringify(a.record)!==JSON.stringify(b.record)||mode&&!sameRetainedOperationCuts(a.rows,b.rows))throw this.#error('capture_changed');const r=a.record,current=r.current===null?null:a.rows.get(r.current)!,pending=r.pending===null?null:a.rows.get(r.pending)!;
      if(observed===null?current!==null:!((current&&same(observed,current))||(pending&&same(observed,pending))))throw this.#error('source_diverged');
      result={record:{...r},input:a.file,current:current&&copyOperationCut(current),pending:pending&&copyOperationCut(pending),observed:observed===null?null:observed.head===current?.head?r.current:r.pending,...(mode?{retained:retainedOperationCuts(a.rows)}:{})};
     }finally{selected?.dispose();}
     check();return result;
    }),
   });
  },
 };}
 static{
  creation=(journal,family)=>{const selected=nativeInputJournalFamily(family);if(!journal||typeof journal!=='object'||!(#id in journal)||journal.#family!==family||journal.#facade!==undefined||journal.#closed||journal.#facadePhase!=='ready')throw selected.error('closed');journal.#facadePhase='claimed';};
  binding=(journal,facade)=>{if(!journal||typeof journal!=='object'||!(#id in journal))throw new SharedEditorError('native_input_operation_closed','Use a genuine journal kernel');if(!journal.#exposed||journal.#closed||journal.#facade!==facade)throw journal.#error('closed');return journal.bindingType();};
 }
}
const close=NativeInputJournal.prototype.close;
/** Canonical machinery reads/cleanup, captured before application callbacks. */
export const nativeInputJournalMethods=Object.freeze({progress:NativeInputJournal.prototype.progress,file:NativeInputJournal.prototype.file,blob:NativeInputJournal.prototype.blob,close});
/** A facade can be made only once, for the exact intrinsic family and kernel.
 * Exporting a constructor bridge never turns a caller DTO into an owner. */
export function assertNativeInputJournalFacadeCreation<A,C extends NativeInputJournalChoice,O,R extends NativeInputCutIntent,F extends object>(journal:NativeInputJournal<A,C,O,R,F>,family:NativeInputJournalFamily<A,C,O,R,F>):void{creation(journal,family);}
/** Actual facade identity is part of the driver/source contract. Another facade
 * or serialized completion record cannot borrow that kernel's source rights. */
export function nativeInputJournalBinding<A,C extends NativeInputJournalChoice,O,R extends NativeInputCutIntent,F extends object>(journal:NativeInputJournal<A,C,O,R,F>,facade:F){return binding(journal,facade);}
