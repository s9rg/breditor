import {ContinuedDeliveryCompanion} from '../continued_delivery/companion.js';
import {continuedDeliveryCompanion,registerContinuedDelivery,withContinuedDelivery} from '../continued_delivery/binding.js';
import type {ContinuedDeliveryRecordRead,ContinuedDeliveryRecords,SharedContinuedDeliveryOptions,SharedContinuedDeliveryRecovery} from '../continued_delivery/contract.js';
import type {DurableRelaySourcePort} from '../relay/durable_source_port.js';
import {registerSessionDeliveryIO} from '../delivery_source/io.js';
import {registerRetainedStoreOwner,withIndependentRetainedPort,type RetainedStorePort} from '../delivery_ports/retained.js';
import {SharedSuggestionQueue} from '../suggestions/queue.js';
import {SharedSuggestionRevisions} from '../suggestion_revisions/outbox.js';
import {SharedDocumentVersions} from '../versions/catalog.js';
import type {SharedIndependentRevisionsOpenOptions,SharedIndependentVersionsOpenOptions} from '../independent_delivery/session.js';
import {waitRetiredRelayWork} from '../relay/work_custody.js';
import {closed} from '../segmented_relay/validation.js';
import type {SegmentedRetainedKind,SegmentedRetainedRecords} from '../segmented_relay/retained_contract.js';
import {coreReadStamp} from '../core_read_stamp.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {forwardIndependentBootstrapPolicy,independentBootstrapDestination,independentBootstrapPolicy,independentBootstrapSignal} from '../independent_history/bootstrap_policy.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {OperationalReadCancellation} from '../operation_read/cancellation.js';
import {readContinuedPairAssetReferences,replayContinuedDeliveryAssetReferences,type SharedContinuedPairAssetReferences} from './asset_references.js';
import {admitContinuedPair,captureContinuedPair as capture,withContinuedPairReplay} from './replay.js';
import {continuedPairReadFailure as readFailure,createContinuedPairRecordRead,ContinuedPairRecordRead,type ContinuedPairRecords} from './read_records.js';
import {SharedEditorError,type SharedRichEditor} from '../core.js';
import {inheritActorLeaseInput,takeActorDocumentLease,takeActorReviewLease} from '../persistence/actor_lease_input.js';
import {registerNativeActorSource} from '../persistence/native_actor_source.js';
import {requireLiveActorCore,requireStoppedActorCore,type StoppedActorBinding,type StoppedActorCustody} from '../persistence/stopped_actor_source.js';
import {ActorLeaseEscrow} from '../persistence/actor_lease_escrow.js';
import {checkManagedCore,registerManagedSource} from '../managed_custody.js';
import {registerCapturedNativeHistory} from '../native_history_read/registry.js';
import {registerNativePendingWork} from '../native_pending_work.js';
import {disposeOwnedCore,retireOwnedCore} from '../owned_core_lifetime.js';
import {freeUnclaimedSharedRustOwner} from '../raw_owner_lifetime.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {requireBackupRecovery} from '../backups/identity.js';
import {object} from '../persistence/segmented_checkpoint.js';
import {fenceOpeningDatabase} from '../persistence/opening_database.js';
import {SharedWriterLease,checkSharedWriterLeaseForEscrow} from '../persistence/writer_lease.js';
import {ReviewWriterLease,checkReviewWriterLeaseForEscrow} from '../persistence/review_writer_lease.js';
import {readExactHistoryDestination} from '../independent_history/exact_destination.js';
import {openPairedHistoryDatabase,readPairedHistoryCut,writePairedHistoryCut} from '../independent_history/database.js';
import {markIndependentHistoryStorage} from '../independent_history/native_port.js';
import type {IndependentHistoryCut} from '../independent_history/contract.js';
import type {SharedEditorOptions,SharedRustOwner,SharedSelectionPolicy} from '../types.js';
import type {SharedDocumentVersionInfo} from '../version_types.js';
import {canonicalContinuedPairIdentity,continuedPairStore,makeContinuedPairCut} from './cut.js';
import type {ContinuedPairIdentity,SharedContinuedPairOptions,SharedContinuedPairRecovery} from './contract.js';

const construction=Symbol();
const fail=(code:string,message:string)=>new SharedEditorError(code,message);
let readPairAssets:<P extends SharedSelectionPolicy>(session:SharedContinuedPairSession<P>,read:ContinuedPairRecordRead,signal?:AbortSignal)=>Promise<SharedContinuedPairAssetReferences>;
/** Obtain both inputs under the same genuine session read. Only internal callers can borrow this scope. */
export async function withContinuedPairAssetRead<P extends SharedSelectionPolicy,T>(
 session:SharedContinuedPairSession<P>,check:()=>void,signal:AbortSignal|undefined,
 use:(read:ContinuedPairRecordRead,assets:SharedContinuedPairAssetReferences)=>Promise<T>,
):Promise<T>{
 const read=await readPairRecords.call(session,check,signal);
 try{return await use(read,await readPairAssets(session,read,signal));}
 finally{disposePairRecords.call(read);}
}

/** Borrow the delivery slots and native replay under one held source observation. */
export async function withContinuedDeliveryAssetRead<P extends SharedSelectionPolicy,T>(
 session:SharedContinuedPairSession<P>,check:()=>void,signal:AbortSignal|undefined,
 use:(read:ContinuedDeliveryRecordRead,assets:Awaited<ReturnType<typeof replayContinuedDeliveryAssetReferences<P>>>)=>Promise<T>,
):Promise<T>{
 const read=await readDeliveryRecords.call(session,check,signal);
 try{return await use(read,await readDeliveryAssets(session,read,signal));}
 finally{disposePairRecords.call(read);}
}
let readDeliveryAssets:<P extends SharedSelectionPolicy>(session:SharedContinuedPairSession<P>,read:ContinuedDeliveryRecordRead,signal?:AbortSignal)=>
 ReturnType<typeof replayContinuedDeliveryAssetReferences<P>>;

type Capture=SharedContinuedPairRecovery&{delivery?:ReturnType<ContinuedDeliveryCompanion['capture']>};
const same=(a:Capture|undefined,b:Capture)=>
 a?.documentCheckpoint===b.documentCheckpoint&&a.reviewCheckpoint===b.reviewCheckpoint&&
 a.delivery===b.delivery&&a.versions.length===b.versions.length&&a.versions.every((packet,index)=>packet===b.versions[index]);
interface SaveAttempt {capture:Capture;cut?:IndependentHistoryCut}
interface HeldPairSlots {
 readonly committed:Readonly<{head:string;recovery:SharedContinuedPairRecovery}>;
 readonly attempt:SaveAttempt|undefined;
 readonly pending:Capture|undefined;
 readonly live:Capture;
}

let inspectActors:(owner:object,stopped:boolean)=>StoppedActorBinding;
let moveActors:(owner:object)=>StoppedActorCustody;
const createActorEscrow=ActorLeaseEscrow.create;
export const checkReadyContinuedDeliveryActors=(owner:object)=>inspectActors(owner,false);
export const checkStoppedContinuedDeliveryActors=(owner:object)=>inspectActors(owner,true);
export const takeStoppedContinuedDeliveryActors=(owner:object)=>moveActors(owner);

/** Own one exact two-lane native replay and one atomic version-two paired head. */
export class SharedContinuedPairSession<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly #core:SharedRichEditor<P>;
 readonly #db:IDBDatabase;
 readonly #documentLease:SharedWriterLease;
 readonly #reviewLease:ReviewWriterLease;
 readonly #identity:ContinuedPairIdentity;
 readonly #key:readonly [string,string];
 readonly #versions:Map<string,string>;
 readonly #onError:SharedContinuedPairOptions<P>['onError'];
 readonly #unsubscribe:(()=>void)[];
 readonly #releasePendingWork:()=>void;
 readonly #restoreDocument:SharedContinuedPairOptions<P>['restoreDocument'];
 #head:string|null;
 #saved:Capture|undefined;
 #pending:Capture|undefined;
 #attempt:SaveAttempt|undefined;
 #running:Promise<void>|undefined;
 #recordReader:object|undefined;
 #recordEpoch=Object.freeze({});
 #failed=false;
 #failure:unknown;
 #storageChanged=false;
 #retired=false;
 #closed=false;
 #closing:Promise<void>|undefined;
 #released:Promise<void>|undefined;
 readonly #delivery:ContinuedDeliveryCompanion|undefined;
 readonly #adapters=new Set<WeakRef<{dispose():void}>>();
 readonly #openings=new Set<Promise<unknown>>();
 #queue:SharedSuggestionQueue<P>|undefined;
 #revisions:SharedSuggestionRevisions<P>|undefined;
 #catalog:SharedDocumentVersions<P>|undefined;
 #discarding:Promise<void>|undefined;

 private constructor(token:symbol,core:SharedRichEditor<P>,db:IDBDatabase,documentLease:SharedWriterLease,reviewLease:ReviewWriterLease,
   identity:ContinuedPairIdentity,head:string|null,versions:Map<string,string>,onError:SharedContinuedPairOptions<P>['onError'],restoreDocument:SharedContinuedPairOptions<P>['restoreDocument'],
   delivery:ContinuedDeliveryCompanion|undefined,reviewAccess:SharedContinuedPairOptions<P>['review']['access']){
  if(token!==construction)throw fail('continued_pair_construction','Use the paired open or recovery factory');
  this.#core=core;
  this.#db=db;
  this.#documentLease=documentLease;
  this.#reviewLease=reviewLease;
  this.#identity=identity;
  this.#key=[identity.native.room,identity.native.writer];
  this.#head=head;
  this.#versions=versions;
  this.#onError=onError;
  this.#restoreDocument=restoreDocument;
  this.#delivery=delivery;
  this.#releasePendingWork=registerNativePendingWork(core,()=>this.#running);
  markIndependentHistoryStorage(core);
  const schedule=()=>{try{this.save();}catch(error){this.#recordFailure(error);}};
  this.#unsubscribe=[native.subscribe.call(core,schedule),native.subscribeReview.call(core,schedule)];
  db.onversionchange=()=>{
   this.#storageChanged=true;
   this.#retire();
   db.close();
   this.#recordFailure(fail('continued_pair_versionchange','Paired storage changed while in use'));
  };
  if(delivery){
   const check=()=>this.#checkDelivery(),save=()=>savePair.call(this),flush=()=>this.#flushDelivery();
   const persistReview:DurableRelaySourcePort['persistReview']=async (progress,receipt)=>{
    check();
    const before=delivery.capture().relay;
    delivery.propose(core,{...before,review:progress,reviewReceipt:receipt??before.reviewReceipt});
    await flush();
   };
   registerSessionDeliveryIO(this,{core,check,save,flush,review:{
    identity:()=>structuredClone(delivery.binding.review),
    progress:()=>structuredClone(delivery.durable().relay.review!),
    persist:persistReview,
   }});
   registerManagedSource(this,core,check);
   registerNativeActorSource(this,'continued-delivery',{document:documentLease,review:reviewLease});
   registerContinuedDelivery(this,{
    core:core as SharedRichEditor<SharedSelectionPolicy>,binding:structuredClone(delivery.binding),
    check,save,flush,durable:()=>structuredClone(delivery.durable().relay),
    reviewAccess:access=>reviewAccess==='read_only'||access==='read_only'?'read_only':reviewAccess==='comment'?'comment':access,
    async persistDocument(progress){
     check();delivery.propose(core,{...delivery.capture().relay,document:progress});await flush();
    },
    persistReview,track:adapter=>{
     check();
     for(const ref of this.#adapters)if(!ref.deref())this.#adapters.delete(ref);
     this.#adapters.add(new WeakRef(adapter));
    },
   });
  }
 }
 get core():SharedRichEditor<P>{return this.#core;}

 /** Reopen an existing paired cut. An absent store requires explicit recovery. */
 static open<P extends SharedSelectionPolicy>(options:SharedContinuedPairOptions<P>):Promise<SharedContinuedPairSession<P>>{
  return this.#open(options);
 }

 /** Open a separately bound delivery database. A local pair requires explicit import. */
 static async openDelivery<P extends SharedSelectionPolicy>(options:SharedContinuedDeliveryOptions<P>):Promise<SharedContinuedPairSession<P>>{
  return this.#open(withContinuedDelivery(forwardIndependentBootstrapPolicy(options,inheritActorLeaseInput(options,{...options})),new ContinuedDeliveryCompanion(options)));
 }

 /** Recover the complete pair, accepted receipts and original pending packets. */
 static async restoreDelivery<P extends SharedSelectionPolicy>(options:SharedContinuedDeliveryOptions<P>,
  recovery:SharedContinuedDeliveryRecovery,writerRecovery:'host-reacquired'):Promise<SharedContinuedPairSession<P>>{
  requireBackupRecovery(writerRecovery);
  const selected=structuredClone(recovery),companion=new ContinuedDeliveryCompanion(options,selected);
  return this.restoreRecovery(withContinuedDelivery(forwardIndependentBootstrapPolicy(options,inheritActorLeaseInput(options,{...options})),companion),selected.source,writerRecovery);
 }

 /** Replay both exact lanes into an empty destination after the host reacquires the writers. */
 static async restoreRecovery<P extends SharedSelectionPolicy>(options:SharedContinuedPairOptions<P>,recovery:SharedContinuedPairRecovery,
   writerRecovery:'host-reacquired'):Promise<SharedContinuedPairSession<P>>{
  requireBackupRecovery(writerRecovery);
  object(recovery,'documentCheckpoint,format,formatVersion,identity,reviewCheckpoint,versions');
  if(recovery.format!=='breditor/shared-independent-history-recovery'||recovery.formatVersion!==2||
     typeof recovery.documentCheckpoint!=='string'||typeof recovery.reviewCheckpoint!=='string'||!Array.isArray(recovery.versions))
   throw fail('continued_pair_recovery','Use an explicit version-two paired recovery cut');
  return this.#open(options,{
   ...recovery,identity:canonicalContinuedPairIdentity(recovery.identity),versions:[...recovery.versions],
  });
 }

 static async #open<P extends SharedSelectionPolicy>(input:SharedContinuedPairOptions<P>,recovery?:SharedContinuedPairRecovery):Promise<SharedContinuedPairSession<P>>{
  const {database,restoreDocument,readOnly,onError}=input,review={...input.review},editor={...input.editor};
  const delivery=continuedDeliveryCompanion(input),store=delivery?.store??continuedPairStore;
  const missing=()=>fail('continued_pair_missing','No saved cut exists for the selected pair');
  const bootstrap=independentBootstrapPolicy(input),signal=independentBootstrapSignal(input),destination=independentBootstrapDestination(input);
  bootstrap?.();
  const identity=canonicalContinuedPairIdentity({
   native:input.native,documentHistory:input.documentHistory,reviewHistory:input.reviewHistory,
   review:{actor:review.actor,principal:review.principal},
  });
  if(typeof readOnly!=='boolean'||typeof restoreDocument!=='function'||!['read_only','comment','moderate'].includes(review.access)||
     ['selectionEditing','reviewedHistory','searchHistory','segmentedHistory'].some(key=>key in editor))
   throw fail('continued_pair_policy','Supply current host policy and a matching native document restore factory');
  if(recovery&&JSON.stringify(recovery.identity)!==JSON.stringify(identity))
   throw fail('continued_pair_identity','Recovery must match the selected room, actors and history families');
  const {room,writer}=identity.native;
  const key=[room,writer] as const;
  const documentLease=await(takeActorDocumentLease(input,delivery?'continued-delivery':'continued-local',database,room,writer,review.actor)??
   SharedWriterLease.acquire(room,writer));
  let reviewLease:ReviewWriterLease|undefined,db:IDBDatabase|undefined,raw:SharedRustOwner|undefined,core:SharedRichEditor<P>|undefined;
  let session:SharedContinuedPairSession<P>|undefined;
  try{
   bootstrap?.();
   reviewLease=await(takeActorReviewLease(input,delivery?'continued-delivery':'continued-local',database,room,writer,review.actor)??
    ReviewWriterLease.acquire(room,review.actor));
   bootstrap?.();
   db=await openPairedHistoryDatabase(database,store.names,bootstrap,recovery?undefined:destination?.fail??(delivery?missing:undefined));
   const opening=fenceOpeningDatabase(db,'session_open_versionchange');
   const check=()=>{bootstrap?.();opening.assertCurrent();};
   const stored=await readPairedHistoryCut(db,key,store);
   check();
   if(destination){
    const status=await readExactHistoryDestination(db,store.names,key,destination,check);
    if(recovery?status!=='empty'||stored!==null:status!=='exact'||stored?.head!==destination.cut.head)
     throw destination.fail();
   }
   if(stored&&recovery)throw fail('continued_pair_destination_exists','Recovery never overwrites a committed paired destination');
   if(stored&&JSON.stringify(stored.record.identity)!==JSON.stringify(identity))
    throw fail('continued_pair_identity','Stored room, actors or history families differ');
   const selected=stored??recovery;
   if(!selected)throw fail('continued_pair_missing','No saved cut exists for the selected pair');
   const versions=stored?.record.versions??recovery!.versions;
   if(stored)delivery?.load(stored.head);
   const state=delivery?.capture();
   const cut=recovery?await makeContinuedPairCut(selected.documentCheckpoint,selected.reviewCheckpoint,identity,versions):undefined;
   const wrapped=cut&&state?delivery!.wrap(cut,state):cut;
   const destinationCut=destination??(delivery&&wrapped?{cut:wrapped,fail:()=>fail('continued_delivery_destination_exists',
    'Restore continued delivery into an empty dedicated database')}:undefined);
   check();
   if(bootstrap){
    const waits=new NativeReconstructionWaits(check,[signal]);
    try{raw=opening.admit(await waits.call(()=>restoreDocument(selected.documentCheckpoint),freeUnclaimedSharedRustOwner));}
    finally{waits.close();}
   }else raw=opening.admit(await restoreDocument(selected.documentCheckpoint));
   const replay=admitContinuedPair<P>(raw,identity,review,readOnly,editor,selected,versions);
   core=replay.core;
   const admittedVersions=replay.versions,captured=replay.capture;
   delivery?.admit(core);
   check();
   if(wrapped&&(bootstrap||delivery)){
    await writePairedHistoryCut(db,key,null,wrapped,store.names,store.readHead,check,signal,undefined,destinationCut);
    check();
   }
   session=new SharedContinuedPairSession(construction,core,db,documentLease,reviewLease,identity,stored?.head??(bootstrap||delivery?wrapped!.head:null),admittedVersions,onError,restoreDocument,delivery,review.access);
   if(stored||bootstrap||delivery)session.#saved=state?{...captured,delivery:state}:captured;
   else{session.save();await session.flush();}
   return session;
  }catch(error){
   if(session)await session.discardAndClose();
   else{
    try{if(core)disposeOwnedCore(core);else if(raw)freeUnclaimedSharedRustOwner(raw);}
    finally{db?.close();try{await reviewLease?.close();}finally{await documentLease.close();}}
   }
   throw error;
  }
 }

 #live():void{
  if(this.#closed)throw fail('continued_pair_closed','The paired session is closed');
  this.#documentLease.assertLive();
  this.#reviewLease.assertLive();
 }
 #checkWrite=():void=>{
  this.#live();
  if(this.#storageChanged)throw fail('continued_pair_versionchange','Paired storage changed while in use');
 };
 #capture():Capture{
  this.#live();
  const pair=capture(this.#core,this.#identity,this.#versions),state=this.#delivery?.capture();
  return state?{...pair,delivery:state}:pair;
 }
 async #makeCut(cut:Capture):Promise<IndependentHistoryCut>{
  const pair=await makeContinuedPairCut(cut.documentCheckpoint,cut.reviewCheckpoint,this.#identity,cut.versions);
  return cut.delivery?this.#delivery!.wrap(pair,cut.delivery):pair;
 }
 #recordFailure(error:unknown):void{
  this.#recordEpoch=Object.freeze({});
  this.#failed=true;
  this.#failure=error;
  try{this.#onError?.(error);}catch{/* Reporting cannot change the save outcome. */}
 }
 exportRecovery():SharedContinuedPairRecovery{
  if(this.#delivery)throw fail('continued_delivery_export_required','Export the complete continued delivery recovery');
  return this.#capture();
 }
 exportDeliveryRecovery():SharedContinuedDeliveryRecovery{
  this.#live();
  const companion=this.#requireDelivery(),{delivery,...source}=this.#capture();
  return companion.recovery(source,delivery);
 }
 #requireDelivery():ContinuedDeliveryCompanion{
  if(!this.#delivery)throw fail('continued_delivery_required','Open the explicit continued delivery family');
  return this.#delivery;
 }
 #checkDelivery():void{
  this.#checkWrite();checkManagedCore(this.#core);
  if(this.#recordReader)throw readFailure('busy');
  if(this.#retired||Object.hasOwn(this,'core'))throw fail('continued_delivery_retired','The continued delivery owner is retired');
 }
 async #flushDelivery():Promise<void>{this.#checkDelivery();savePair.call(this);await flushPair.call(this);this.#checkDelivery();}
 #retainedPort<K extends SegmentedRetainedKind>(kind:K):RetainedStorePort<K>{
  const delivery=this.#requireDelivery();
  if(!delivery.retainedBinding[kind])throw fail('continued_retained_unselected','Choose this retained store in the delivery binding');
  const port:RetainedStorePort<K>={
   kind,check:()=>this.#checkWrite(),writable:()=>this.#checkDelivery(),
   read:()=>structuredClone(delivery.capture().retained[kind]) as NonNullable<SegmentedRetainedRecords[K]>,
   stage:record=>{this.#checkDelivery();delivery.proposeRecord(this.#core,kind,record);},
   write:async()=>{this.#checkWrite();savePair.call(this);await flushPair.call(this);},
  };
  registerRetainedStoreOwner(port,this,this.#core,()=>structuredClone(delivery.durable().retained[kind]));
  return port;
 }
 #opening<T extends {discardAndClose():Promise<void>}>(open:()=>Promise<T>,keep:(value:T)=>void):Promise<T>{
  this.#checkDelivery();
  const pending=(async()=>{
   const value=await open();
   try{this.#checkDelivery();keep(value);return value;}
   catch(error){await value.discardAndClose();throw error;}
  })();
  this.#openings.add(pending);
  void pending.finally(()=>this.#openings.delete(pending)).catch(()=>{});
  return pending;
 }
 #metadataStorage(){
  return Object.freeze({core:this.#core,save:()=>savePair.call(this),flush:()=>this.#flushDelivery()});
 }
 openSuggestionQueue():Promise<SharedSuggestionQueue<P>>{
  const binding=this.#requireDelivery().retainedBinding.suggestions;
  if(!binding)throw fail('continued_retained_unselected','Choose the suggestion queue in the delivery binding');
  return this.#opening(()=>SharedSuggestionQueue.open(withIndependentRetainedPort({
   database:'atomic-continued-delivery',identity:binding.identity,storage:this.#metadataStorage(),
   ...(binding.ownedHistory?{ownedHistory:binding.ownedHistory}:{}),
  },this.#retainedPort('suggestions'))),value=>{this.#queue=value;});
 }
 openSuggestionRevisions(input:SharedIndependentRevisionsOpenOptions<P>):Promise<SharedSuggestionRevisions<P>>{
  if(['storage','database','binding','queue'].some(key=>key in input)||input.autoStart!==undefined&&input.autoStart!==false)
   throw fail('continued_delivery_policy','Select the transport separately and start it explicitly');
  const binding=this.#requireDelivery().retainedBinding.revisions,queue=this.#queue;
  if(!binding||!queue)throw fail('continued_retained_queue_required','Open the selected suggestion queue first');
  return this.#opening(()=>SharedSuggestionRevisions.open(withIndependentRetainedPort({
   ...input,database:'atomic-continued-delivery',binding:binding.binding,queue,storage:this.#metadataStorage(),autoStart:false,
  },this.#retainedPort('revisions'))),value=>{this.#revisions=value;});
 }
 openVersionCatalog(input:SharedIndependentVersionsOpenOptions<P>):Promise<SharedDocumentVersions<P>>{
  if(['storage','database','identity'].some(key=>key in input)||input.autoConnect!==undefined&&input.autoConnect!==false)
   throw fail('continued_delivery_policy','Select the version token separately and connect explicitly');
  const binding=this.#requireDelivery().retainedBinding.versions;
  if(!binding)throw fail('continued_retained_unselected','Choose the version catalog in the delivery binding');
  return this.#opening(()=>SharedDocumentVersions.open(withIndependentRetainedPort({
   ...input,database:'atomic-continued-delivery',identity:binding,storage:this.#metadataStorage(),autoConnect:false,
  },this.#retainedPort('versions'))),value=>{this.#catalog=value;});
 }

 /** Hold the paired save queue while reading its exact durable and in-memory cuts. */
 async readRecords(checkAuthority:()=>void,signal?:AbortSignal):Promise<ContinuedPairRecordRead>{
  if(this.#delivery)throw fail('continued_delivery_export_required','Use the complete delivery recovery record');
  return this.#readRecords<ContinuedPairRecords>(checkAuthority,signal,({committed,attempt,pending,live})=>({
   format:'breditor/persistent-continued-pair-record-read',formatVersion:1,
   scope:'atomic-continued-pair-committed-attempt-pending-live',committed,
   attempt:attempt?{capture:attempt.capture,cut:attempt.cut??null}:null,pending:pending??null,live,
  }));
 }

 /** Hold both native lanes and all relay progress and outboxes in one exact read. */
 async readDeliveryRecords(checkAuthority:()=>void,signal?:AbortSignal):Promise<ContinuedDeliveryRecordRead>{
  const delivery=this.#requireDelivery();
  const wrap=({delivery:state,...source}:Capture)=>{
   if(!state)throw readFailure('changed');
   return delivery.recovery(source,state);
  };
  const read=await this.#readRecords<ContinuedDeliveryRecords>(checkAuthority,signal,({committed,attempt,pending,live})=>({
   format:'breditor/persistent-continued-delivery-record-read',formatVersion:1,
   scope:'atomic-continued-delivery-committed-attempt-pending-live',
   committed:{head:committed.head,recovery:delivery.readRecovery(committed.recovery,committed.head)},
   attempt:attempt?{capture:wrap(attempt.capture),preparedHead:attempt.cut?.head??null}:null,
   pending:pending?wrap(pending):null,live:wrap(live),
  }));
  try{
   const {identity,documentCheckpoint,reviewCheckpoint}=(readPairMetadata.call(read) as ContinuedDeliveryRecords).live.source;
   registerCapturedNativeHistory(read,this.#core,{
    document:{kind:identity.documentHistory,checkpoint:documentCheckpoint},
    review:{kind:identity.reviewHistory,checkpoint:reviewCheckpoint},
   },()=>checkPairRecords.call(read));
   return read;
  }catch(error){disposePairRecords.call(read);throw error;}
 }

 async #readRecords<T>(checkAuthority:()=>void,signal:AbortSignal|undefined,
  metadata:(slots:HeldPairSlots)=>T):Promise<ContinuedPairRecordRead<T>>{
  this.#checkWrite();
  checkManagedCore(this.#core);
  if(this.#recordReader||this.#running)throw readFailure('busy');
  const token=Object.freeze({});
  this.#recordReader=token;
  let observation:OperationalReadCancellation|undefined,complete=false;
  const release=()=>{
   if(this.#recordReader!==token)return;
   this.#recordReader=undefined;
   observation?.close();
   this.#start();
  };
  try{
   observation=new OperationalReadCancellation(signal);
   const authority=participantAuthority(checkAuthority),stamp=coreReadStamp(this.#core);
   const epoch=this.#recordEpoch,head=this.#head,attempt=this.#attempt,pending=this.#pending;
   const current=()=>{
    if(this.#recordReader!==token)throw readFailure('closed');
    observation!.check(()=>readFailure('aborted'));
    this.#checkWrite();
    checkManagedCore(this.#core);
    const now=coreReadStamp(this.#core);
    if(this.#recordEpoch!==epoch||now.document!==stamp.document||now.review!==stamp.review||this.#running)
     throw readFailure('changed');
   };
   const check=()=>{current();authority();current();};
   const readStored=async()=>{
    const stored=await readPairedHistoryCut(this.#db,this.#key,this.#delivery?.store??continuedPairStore);
    current();
    if(!stored||stored.head!==head&&stored.head!==attempt?.cut?.head||
       JSON.stringify(stored.record.identity)!==JSON.stringify(this.#identity))throw readFailure('changed');
    return stored;
   };
   check();
   const live=this.#capture(),stored=await readStored();
   check();
   const committed={format:live.format,formatVersion:live.formatVersion,identity:stored.record.identity,
    documentCheckpoint:stored.documentCheckpoint,reviewCheckpoint:stored.reviewCheckpoint,versions:stored.record.versions};
   const result=createContinuedPairRecordRead(metadata({
    committed:{head:stored.head,recovery:committed},attempt,pending,live,
   }),{check,release,verify:async()=>{
    check();
    const actual=await readStored();
    check();
    // The paired store revalidates all referenced immutable file digests.
    if(actual.head!==stored.head)throw readFailure('changed');
   }});
   complete=true;
   return result;
  }finally{if(!complete)release();}
 }

 /** Replay every selected slot to retain the union of native and version asset references. */
 async readAssetReferences(checkAuthority:()=>void,signal?:AbortSignal):Promise<SharedContinuedPairAssetReferences>{
  return withContinuedPairAssetRead(this,checkAuthority,signal,async(_read,assets)=>assets);
 }

 /** Internal binding of native replay to the same read held by participant capture. */
 async #readAssets(read:ContinuedPairRecordRead,signal?:AbortSignal):Promise<SharedContinuedPairAssetReferences>{
  return withContinuedPairReplay(this.#identity,this.#restoreDocument,()=>checkPairRecords.call(read),signal,
   replay=>readContinuedPairAssetReferences(read,replay));
 }

 static{
  inspectActors=(owner,stopped)=>{
   if(!owner||typeof owner!=='object'||!(#core in owner)||!owner.#delivery||Object.hasOwn(owner,'core'))
    throw fail('actor_source_unavailable','Use the actual continued delivery persistence owner');
   if(owner.#closed||owner.#running||owner.#closing||owner.#discarding||owner.#recordReader||
      owner.#attempt||owner.#pending||owner.#failed||owner.#storageChanged||owner.#openings.size)
    throw fail('actor_source_in_use','Settle the complete continued save and close any held reads before moving actors');
   if(stopped)requireStoppedActorCore(owner.#core);
   else{owner.#checkDelivery();requireLiveActorCore(owner.#core);}
   const {room,writer}=owner.#identity.native,actor=owner.#identity.review.actor;
   checkSharedWriterLeaseForEscrow(owner.#documentLease,room,writer);
   checkReviewWriterLeaseForEscrow(owner.#reviewLease,room,actor);
   return Object.freeze({room,writer,actor});
  };
  moveActors=owner=>{
   const {room,writer,actor}=inspectActors(owner,true),source=owner as SharedContinuedPairSession;
   return createActorEscrow.call(ActorLeaseEscrow,source.#documentLease,source.#reviewLease,room,writer,actor!);
  };
  readPairAssets=(session,read,signal)=>session.#readAssets(read,signal);
  readDeliveryAssets=(session,read,signal)=>withContinuedPairReplay(session.#identity,session.#restoreDocument,
   ()=>checkPairRecords.call(read),signal,replay=>replayContinuedDeliveryAssetReferences(readPairMetadata.call(read) as ContinuedDeliveryRecords,replay,()=>checkPairRecords.call(read)));
 }

 save():void{
  this.#checkWrite();
  const next=this.#capture();
  this.#recordEpoch=Object.freeze({});
  if(!this.#attempt&&!this.#running&&same(this.#saved,next)){this.#pending=undefined;return;}
  this.#pending=next;
  this.#start();
 }
 #start():void{
  if(this.#closed||this.#failed||this.#running||this.#recordReader||!this.#pending&&!this.#attempt)return;
  this.#running=this.#drain().catch(error=>this.#recordFailure(error)).finally(()=>{
   this.#running=undefined;
   this.#start();
  });
 }
 async #drain():Promise<void>{
  while(!this.#closed&&(this.#attempt||this.#pending)){
   this.#checkWrite();
   if(!this.#attempt){
    const next=this.#pending!;
    this.#pending=undefined;
    if(same(this.#saved,next))continue;
    this.#attempt={capture:next};
   }
   const attempt=this.#attempt;
   attempt.cut??=await this.#makeCut(attempt.capture);
   this.#checkWrite();
   const store=this.#delivery?.store??continuedPairStore;
   await writePairedHistoryCut(this.#db,this.#key,this.#head,attempt.cut,store.names,store.readHead,this.#checkWrite);
   if(this.#closed)return;
   this.#checkWrite();
   this.#head=attempt.cut.head;
   this.#saved=attempt.capture;
   if(attempt.capture.delivery)this.#delivery!.acknowledge(attempt.capture.delivery);
   this.#attempt=undefined;
  }
 }
 async flush():Promise<void>{
  this.#live();
  if(this.#recordReader&&(this.#pending||this.#attempt))throw readFailure('busy');
  while(this.#running)await this.#running;
  if(this.#failed)throw this.#failure;
 }
 async retry():Promise<void>{
  this.#checkWrite();
  if(this.#recordReader)throw readFailure('busy');
  if(this.#running)await this.#running;
  this.#failed=false;
  this.#failure=undefined;
  this.save();
  await this.flush();
  if(this.#queue&&!this.#queue.state().closed)await this.#queue.retry();
  if(this.#revisions&&this.#revisions.state().status!=='closed')await this.#revisions.retry();
  if(this.#catalog&&this.#catalog.state().status!=='closed')await this.#catalog.retry();
 }
 versions():readonly SharedDocumentVersionInfo[]{
  this.#live();
  return [...this.#versions.values()].map(packet=>native.readVersion.call(this.#core,packet));
 }
 versionPacket(id:string):string{
  this.#live();
  const packet=this.#versions.get(id);
  if(packet===undefined)throw fail('version_unknown','Unknown retained version');
  return packet;
 }
 async retainVersion(packet:string):Promise<SharedDocumentVersionInfo>{
  this.#checkWrite();
  if(this.#recordReader)throw readFailure('busy');
  checkManagedCore(this.#core);
  const info=native.readVersion.call(this.#core,packet),known=this.#versions.get(info.id);
  if(known!==undefined){
   if(known!==packet)throw fail('version_catalog','Immutable version already has different bytes');
   await this.flush();
   return info;
  }
  const before=this.#capture();
  await this.#makeCut({...before,versions:[...before.versions,packet]});
  this.#checkWrite();
  if(this.#recordReader)throw readFailure('busy');
  checkManagedCore(this.#core);
  if(!same(before,this.#capture()))throw fail('continued_pair_stale','The paired source changed during version admission');
  this.#versions.set(info.id,packet);
  this.save();
  await this.flush();
  return info;
 }
 close():Promise<void>{
  if(this.#closed)return this.discardAndClose();
  if(this.#discarding)return this.#discarding;
  if(this.#closing)return this.#closing;
  if(this.#recordReader)return Promise.reject(readFailure('busy'));
  this.#retire();
  this.#closing=Promise.resolve().then(async()=>{
   if(!this.#closed){this.save();await this.flush();}
   if(this.#delivery)await this.#closeAdapters(false);
   await this.#releasePair();
  }).finally(()=>{this.#closing=undefined;});
  return this.#closing;
 }
 #retire():void{
  this.#retired=true;
  retireOwnedCore(this.#core);
  this.#revisions?.disconnect();
  this.#catalog?.disconnect();
  for(const ref of this.#adapters){
   ref.deref()?.dispose();
   this.#adapters.delete(ref);
  }
 }
 async #closeAdapters(discard:boolean):Promise<void>{
  await Promise.allSettled([...this.#openings]);
  const metadata=[this.#revisions,this.#queue,this.#catalog].filter(owner=>owner!==undefined);
  await waitRetiredRelayWork(this.#core,metadata);
  for(const owner of metadata)await (discard?owner.discardAndClose():owner.close());
  this.#revisions=undefined;this.#queue=undefined;this.#catalog=undefined;
  await waitRetiredRelayWork(this.#core);
 }

 /** Release the exact owners. Any transaction already committed remains readable on reopen. */
 discardAndClose():Promise<void>{
  if(this.#delivery&&!this.#closed){
   if(this.#discarding)return this.#discarding;
   this.#retire();
   const pending=this.#closing;
   this.#discarding=Promise.resolve().then(async()=>{
    // A graceful close calls the underlying release directly.
    await pending?.catch(()=>{});
    await this.#closeAdapters(true);
    await this.#releasePair();
   }).finally(()=>{this.#discarding=undefined;});
   return this.#discarding;
  }
  return this.#releasePair();
 }
 #releasePair():Promise<void>{
  if(!this.#closed){
   if(this.#recordReader)return Promise.reject(readFailure('busy'));
   this.#retire();
   this.#closed=true;
   this.#releasePendingWork();
   for(const unsubscribe of this.#unsubscribe)unsubscribe();
   disposeOwnedCore(this.#core);
   this.#db.close();
   this.#pending=undefined;
  }
  if(!this.#released){
   const release=(this.#running??Promise.resolve()).then(async()=>{
    this.#attempt=undefined;
    this.#saved=undefined;
    this.#versions.clear();
    try{await this.#reviewLease.close();}finally{await this.#documentLease.close();}
   });
   this.#released=release;
   void release.catch(()=>{if(this.#released===release)this.#released=undefined;});
  }
  return this.#released;
 }
}

const savePair=SharedContinuedPairSession.prototype.save,flushPair=SharedContinuedPairSession.prototype.flush;
const readPairRecords=SharedContinuedPairSession.prototype.readRecords;
const checkPairRecords=ContinuedPairRecordRead.prototype.check;
const readPairMetadata=ContinuedPairRecordRead.prototype.metadata;
const disposePairRecords=ContinuedPairRecordRead.prototype.dispose;

const readDeliveryRecords=SharedContinuedPairSession.prototype.readDeliveryRecords;
