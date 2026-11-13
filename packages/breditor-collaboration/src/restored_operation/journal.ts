/** Writable source replay from an independently owned archive. Every bootstrap cut uses
 * real writer leases and prepare/source-commit/ack. A private hold survives temporary
 * source closure; the final genuine source consumes it synchronously after readback. */
import {exactOperationRecoveryInput} from '../operation_read/exact_recovery_input.js';
import {retainedOperationCuts,sameRetainedOperationCuts} from '../operation_read/retained_cuts.js';
import {recordReadMode,type OperationalRecordReadMode} from '../operation_read/record_payload.js';
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
import {participantAuthority} from '../participant_backup/policy.js';
import {SharedAssetBytesError} from '../asset_bytes/guards.js';
import {observeIndependentRecoveryAbort} from '../independent_recovery/signal.js';
import {portableCutRecovery} from '../independent_operation/portable_cut.js';
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
 #changed=false;#closed=false;#retiring=false;#closing:Promise<void>|undefined;#working=false;#opening=false;#owner:object|undefined;#held=true;#active=false;
 readonly #readers=new Set<Promise<unknown>>();
 // A persistence retry can change retained cuts without changing native LIVE.
 #readEpoch:object=Object.freeze({});
 private constructor(token:object,input:RestoredOperationInput,db:IDBDatabase,lease:RecoveryLease,original:Replay,live:Replay,targets:readonly string[],context:IDBFactory,locks:LockManager,authority:()=>void){
  if(token!==key)throw fail();this.#input=input;this.#db=db;this.#lease=lease;this.#original=original;this.#live=live;this.#targets=Object.freeze([...targets]);this.#context=context;this.#locks=locks;this.#authority=authority;this.#decoder=new IndependentDeliveryCompanion(input.factory);
  db.onversionchange=()=>{this.#changed=true;db.close();};Object.freeze(this);
 }
 static begin<P extends SharedSelectionPolicy>(file:Blob,options:RestoredOperationInputOptions<P>):Promise<RestoredOperationJournal>{return RestoredOperationJournal.#open(options,file);}
 /** Cold reopen reads the actual retained input; factories and authority are fresh host inputs. */
 static resume<P extends SharedSelectionPolicy>(options:RestoredOperationInputOptions<P>):Promise<RestoredOperationJournal>{return RestoredOperationJournal.#open(options);}
 static async #open<P extends SharedSelectionPolicy>(options:RestoredOperationInputOptions<P>,file?:Blob):Promise<RestoredOperationJournal>{
  const policy=restoredOperationPolicy(options),database=operationDatabaseName(policy.options.database),context=globalThis.indexedDB,locks=globalThis.navigator?.locks,authority=policy.guard;
  const lifetime=()=>{if(!context||!locks||globalThis.indexedDB!==context||globalThis.navigator?.locks!==locks)throw fail('restored_operation_storage_changed');};
  const check=()=>{lifetime();authority();lifetime();};check();let admitted=false;
  // Read-only native origins outlive a writer grant. Initialization still requires
  // that grant; after admission their checks prove only exact native data/lifetime.
  const readOrigin=()=>{lifetime();if(!admitted)check();};
  let lease:RecoveryLease|undefined,db:IDBDatabase|undefined,input:RestoredOperationInput|undefined,original:Replay|undefined,live:Replay|undefined;
  try{
   lease=await RecoveryLease.acquire(JSON.stringify(database));check();
   if(file===undefined){db=await existingRestoredOperationDatabase(database);check();file=await readRestoredOperationInputFile(db);check();}
   const exactInput=exactOperationRecoveryInput(options);if(exactInput)await exactInput(file);check();
   input=await readRestoredOperationInput(file,policy.options) as unknown as RestoredOperationInput;check();
   original=await replayPortableRecovery(input.factory,input.originalData,readOrigin);check();live=await replayPortableRecovery(input.factory,input.live,readOrigin);check();
   const targets=[];for(const cut of input.targets){targets.push(await operationCutDigest(cut));check();}
   db??=await createRestoredOperationDatabase(database,initialRestoredOperationStage(input.identity),input.original,input.file,check);check();
   const result=new RestoredOperationJournal(key,input,db,lease,original,live,targets,context!,locks!,check);const saved=await result.#read();check();
   if(exactInput&&saved.record.completed===targets.length&&
      (saved.record.intent.current!==targets.at(-1)||saved.record.intent.pending!==null))throw fail('restored_operation_source_diverged');
   admitted=true;return result;
  }catch(e){db?.close();try{await lease?.close();}finally{original?.dispose();live?.dispose();input?.dispose();}throw e;}
 }
 #storage():void{if(this.#closed||this.#closing||this.#retiring)throw fail('restored_operation_closed');if(this.#changed||globalThis.indexedDB!==this.#context||globalThis.navigator?.locks!==this.#locks)throw fail('restored_operation_storage_changed');}
 // These anchors are private held readonly replicas. Routine lifetime guards
 // use real facade epochs; full native byte checks fence reads/capture below.
 #readable():void{this.#storage();this.#original.checkCurrent();this.#live.checkCurrent();this.#storage();}
 #check=():void=>{this.#storage();this.#authority();this.#readable();};
 #unwrap=(head:string)=>{const inner=unwrapOperationHead(head,this.#input.identity);this.#decoder.readHead(inner);return inner;};
 #readHead=(head:string)=>this.#decoder.readHead(this.#unwrap(head));
 #captureWith=(core:SharedRichEditor<SharedSelectionPolicy>,versions:readonly string[],check:()=>void)=>{
  this.#original.check();this.#live.check();check();const verify=this.#input.originalData.source.identity.documentHistory==='original'?verifyOriginal:verifySegmented;verify.call(core,this.#original.core);
  for(const packet of this.#input.originalData.source.versions)if(!versions.includes(packet))throw fail('restored_operation_origin');
  if(this.#active){verify.call(core,this.#live.core);for(const packet of this.#input.live.source.versions)if(!versions.includes(packet))throw fail('restored_operation_origin');}check();this.#original.check();this.#live.check();
 };
 #capture=(core:SharedRichEditor<SharedSelectionPolicy>,versions:readonly string[])=>this.#captureWith(core,versions,this.#check);
 async #read(readCheck?:()=>void,options?:{signal?:AbortSignal}):Promise<RestoredOperationChecked>{
  const check=readCheck??this.#check,signal=readCheck?options?.signal:this.#input.options.signal;
  this.#original.check();this.#live.check();check();const raw=await readRestoredOperationDatabase(this.#db,this.#input.identity,this.#targets);check();
  if(await digest(raw.original,signal)!==this.#input.identity.origin||await digest(raw.input,signal)!==this.#input.fileSha256)throw fail('restored_operation_integrity');check();
  const rows=new Map<string,IndependentHistoryCut>();for(const[k,v]of raw.rows){const cut=await readOperationCut(v,this.#readHead);check();if(await operationCutDigest(cut)!==k)throw fail('restored_operation_integrity');if(raw.record.completed===this.#targets.length){const decoder=new IndependentDeliveryCompanion(this.#input.factory);decoder.load(this.#unwrap(cut.head));forwardProgress(this.#input.live.relay,decoder.current());}rows.set(k,copyOperationCut(cut));}check();this.#original.check();this.#live.check();this.#storage();this.#active=raw.record.completed===this.#targets.length;return{...raw,rows};
 }
 async #exclusive<T>(run:()=>Promise<T>):Promise<T>{this.#check();if(this.#working)throw fail('restored_operation_busy');this.#readEpoch=Object.freeze({});this.#working=true;try{return await run();}finally{this.#working=false;}}
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
  // Retirement fences reads immediately, but CLOSED means every actual cleanup
  // obligation completed. A failed lease release keeps this same owner retryable.
  this.#retiring=true;return this.#closing=Promise.resolve().then(async()=>{
   await Promise.allSettled([...this.#readers]);const failures:unknown[]=[];
   for(const release of[()=>this.#db.close(),()=>this.#lease.close(),()=>this.#original.dispose(),()=>this.#live.dispose(),()=>this.#input.dispose()])try{await release();}catch(error){failures.push(error);}
   if(failures.length)throw failures[0];this.#closed=true;
  }).finally(()=>{this.#closing=undefined;});
 }
 private bindingType(){return{
  identity:structuredClone(this.#decoder.identity),operationIdentity:structuredClone(this.#input.identity),sourceDatabase:this.#input.sourceDatabase,
  readHead:this.#readHead,unwrap:this.#unwrap,wrap:(head:string)=>{this.#decoder.readHead(head);return wrapOperationHead(head,this.#input.identity);},nativeCaptureGuard:Object.freeze({check:this.#check,capture:this.#capture}),
  persistence:Object.freeze({select:(actual:IndependentHistoryStoredCut|null)=>this.#select(actual),prepare:(expected:string|null,cut:IndependentHistoryCut)=>this.#prepare(expected,cut),acknowledge:(cut:IndependentHistoryCut)=>this.#acknowledge(cut),release:async()=>{this.#owner=undefined;if(!this.#held)await closeJournal.call(this);}}),
  reserve:()=>{this.#check();if(this.#owner||this.#opening||this.#working)throw fail('restored_operation_in_use');this.#opening=true;let settled=false;return{claim:(owner:object)=>{if(settled||!this.#opening||this.#owner)throw fail();this.#check();const port=independentDeliverySource(owner);if(port.operation!==this||JSON.stringify(port.identity)!==JSON.stringify(this.#decoder.identity))throw fail('restored_operation_source');this.#owner=owner;this.#opening=false;settled=true;},abandon:()=>{if(!settled){settled=true;this.#opening=false;}}};},
  /** The actual source, not a phase DTO, must finish the last replay. No await between
   * this fresh native/host check and consuming the genuine journal hold. */
  consume:(owner:object)=>{this.#check();if(this.#owner!==owner||!this.#active||!this.#held)throw fail('restored_operation_handoff');const port=independentDeliverySource(owner);if(port.operation!==this)throw fail('restored_operation_source');const before=port.stamp(),data=port.read();this.#capture(port.core,data.source.versions);const after=port.stamp();if(before[0]!==after[0]||before[1]!==after[1])throw fail('restored_operation_handoff_changed');this.#held=false;},
  progress:async()=>{const s=await this.#exclusive(()=>this.#read());return{completed:s.record.completed,total:this.#targets.length,ready:s.record.completed===this.#targets.length,pending:s.record.intent.pending!==null};},
  readSource:(owner:object)=>{this.#readable();if(this.#owner!==owner)throw fail('restored_operation_source');const port=independentDeliverySource(owner);if(port.operation!==this)throw fail('restored_operation_source');return port.read();},
  inputFile:()=>{this.#readable();return this.#input.file;},originalFile:()=>{this.#readable();return this.#input.original;},
  /** Independent read authorization holds actual native origins and input lifetime.
   * A bootstrap hold, serialized identity or caller facade cannot issue this scope. */
  borrowRead:(owner:object,readAuthority:()=>void,signal?:AbortSignal)=>{
   this.#readable();if(!this.#active||this.#held||this.#readers.size>=8)throw fail('restored_operation_busy');
   let released=false,finish!:()=>void,observation:ReturnType<typeof observeIndependentRecoveryAbort>|undefined;const held=new Promise<void>(resolve=>{finish=resolve;}),port=independentDeliverySource(owner),authorize=participantAuthority(readAuthority),release=()=>{if(!released){released=true;observation?.release();this.#readers.delete(held);finish();}};this.#readers.add(held);
   const checkCurrent=()=>{if(released)throw fail('restored_operation_read_closed');this.#readable();if(this.#owner!==owner||port.operation!==this)throw fail('restored_operation_source');if(observation!.aborted())throw new SharedAssetBytesError('asset_bytes_aborted','Asset byte work was cancelled');port.check();};
   const check=()=>{checkCurrent();authorize();checkCurrent();};try{observation=observeIndependentRecoveryAbort(signal,held);check();}catch(error){release();throw error;}
   const track=<T>(run:()=>Promise<T>):Promise<T>=>{check();if(this.#readers.size>=8)throw fail('restored_operation_busy');const work=Promise.resolve().then(run);this.#readers.add(work);void work.finally(()=>this.#readers.delete(work)).catch(()=>{});return work;};
   return Object.freeze({identity:structuredClone(this.#input.identity),expected:structuredClone(this.#input.selection.original),inputSelection:structuredClone(this.#input.selection),inputKind:this.#input.kind,inputFileSha256:this.#input.fileSha256,sourceIdentity:structuredClone(this.#decoder.identity),check,checkCurrent,
    readSource:()=>{check();const data=port.read();this.#captureWith(port.core,data.source.versions,check);check();return data;},
    verifyCore:(core:SharedRichEditor<SharedSelectionPolicy>,versions:readonly string[])=>this.#captureWith(core,versions,check),
    pinRetained:()=>{checkCurrent();if(this.#working)throw fail('restored_operation_busy');const epoch=this.#readEpoch;return()=>{checkCurrent();if(this.#working||epoch!==this.#readEpoch)throw fail('restored_graph_reference_changed');};},
    readSnapshot:(mode?:OperationalRecordReadMode)=>track(async()=>{recordReadMode(mode);const a=await this.#read(check,signal?{signal}:{});check();const id=this.#decoder.identity.history.native,stored=await readDedicatedOperationSourceDatabase(this.#input.sourceDatabase,[id.room,id.writer],this.#readHead,check,'restored-operation-v1'),observed=stored&&copyOperationCut(stored);check();const b=await this.#read(check,signal?{signal}:{});if(JSON.stringify(a.record)!==JSON.stringify(b.record))throw fail('restored_operation_capture_changed');const r=a.record.intent,current=r.current===null?null:a.rows.get(r.current)!,pending=r.pending===null?null:a.rows.get(r.pending)!;if(observed===null?current!==null:!(current&&sameOperationCut(observed,current)||pending&&sameOperationCut(observed,pending)))throw fail('restored_operation_source_diverged');check();if(mode&&!sameRetainedOperationCuts(a.rows,b.rows))throw fail('restored_operation_capture_changed');return{record:{...r},original:a.original,input:a.input,current:current&&copyOperationCut(current),pending:pending&&copyOperationCut(pending),observed:observed===null?null:observed.head===current?.head?r.current:r.pending,...(mode?{retained:retainedOperationCuts(a.rows),journal:structuredClone(a.record)}:{})};}),
    recovery:(cut:IndependentHistoryCut)=>track(async()=>{check();const data=await portableCutRecovery(this.#input.factory,this.#input.identity,cut);check();return data;}),
    inputBlob:(asset:string,generation:string)=>track(async()=>{check();const blob=await this.#input.blob(asset,generation);check();return blob;}),
    release,
   });
  },
 };}
 static{binding=owner=>{owner.#readable();return owner.bindingType();};}
}
const closeJournal=RestoredOperationJournal.prototype.close;
export const restoredOperationJournalBinding=(owner:RestoredOperationJournal)=>binding(owner);
