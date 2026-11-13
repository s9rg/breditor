import {SharedEditorError,SharedRichEditor,createSharedDocumentEditor} from '../core.js';
import {initializeSharedReadOnly} from '../initialize_read_only.js';
import {checkManagedCore} from '../managed_custody.js';
import {registerNativePendingWork} from '../native_pending_work.js';
import {disposeOwnedCore,retireOwnedCore} from '../owned_core_lifetime.js';
import {freeUnclaimedSharedRustOwner} from '../raw_owner_lifetime.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {requireBackupRecovery} from '../backups/identity.js';
import {object} from '../persistence/segmented_checkpoint.js';
import {fenceOpeningDatabase} from '../persistence/opening_database.js';
import {admitPairedVersions} from '../persistence/review_record_admission.js';
import {SharedWriterLease} from '../persistence/writer_lease.js';
import {ReviewWriterLease} from '../persistence/review_writer_lease.js';
import {openPairedHistoryDatabase,readPairedHistoryCut,writePairedHistoryCut} from '../independent_history/database.js';
import {markIndependentHistoryStorage} from '../independent_history/native_port.js';
import type {IndependentHistoryCut} from '../independent_history/contract.js';
import type {SharedEditorOptions,SharedRustOwner,SharedSelectionPolicy} from '../types.js';
import type {SharedDocumentVersionInfo} from '../version_types.js';
import {canonicalContinuedPairIdentity,continuedPairStore,makeContinuedPairCut} from './cut.js';
import type {ContinuedPairIdentity,SharedContinuedPairOptions,SharedContinuedPairRecovery} from './contract.js';

const construction=Symbol();
const fail=(code:string,message:string)=>new SharedEditorError(code,message);
const same=(a:SharedContinuedPairRecovery|undefined,b:SharedContinuedPairRecovery)=>
 a?.documentCheckpoint===b.documentCheckpoint&&a.reviewCheckpoint===b.reviewCheckpoint&&
 a.versions.length===b.versions.length&&a.versions.every((packet,index)=>packet===b.versions[index]);
interface SaveAttempt {capture:SharedContinuedPairRecovery;cut?:IndependentHistoryCut}

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
 #head:string|null;
 #saved:SharedContinuedPairRecovery|undefined;
 #pending:SharedContinuedPairRecovery|undefined;
 #attempt:SaveAttempt|undefined;
 #running:Promise<void>|undefined;
 #failed=false;
 #failure:unknown;
 #storageChanged=false;
 #retired=false;
 #closed=false;
 #closing:Promise<void>|undefined;
 #released:Promise<void>|undefined;

 private constructor(token:symbol,core:SharedRichEditor<P>,db:IDBDatabase,documentLease:SharedWriterLease,reviewLease:ReviewWriterLease,
   identity:ContinuedPairIdentity,head:string|null,versions:Map<string,string>,onError:SharedContinuedPairOptions<P>['onError']){
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
  this.#releasePendingWork=registerNativePendingWork(core,()=>this.#running);
  markIndependentHistoryStorage(core);
  const schedule=()=>{try{this.save();}catch(error){this.#recordFailure(error);}};
  this.#unsubscribe=[native.subscribe.call(core,schedule),native.subscribeReview.call(core,schedule)];
  db.onversionchange=()=>{
   this.#storageChanged=true;
   this.#retired=true;
   retireOwnedCore(core);
   db.close();
   this.#recordFailure(fail('continued_pair_versionchange','Paired storage changed while in use'));
  };
 }
 get core():SharedRichEditor<P>{return this.#core;}

 /** Reopen an existing paired cut. An absent store requires explicit recovery. */
 static open<P extends SharedSelectionPolicy>(options:SharedContinuedPairOptions<P>):Promise<SharedContinuedPairSession<P>>{
  return this.#open(options);
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
  const identity=canonicalContinuedPairIdentity({
   native:input.native,documentHistory:input.documentHistory,reviewHistory:input.reviewHistory,
   review:{actor:review.actor,principal:review.principal},
  });
  if(typeof readOnly!=='boolean'||typeof restoreDocument!=='function'||!['read_only','comment','moderate'].includes(review.access)||
     ['selectionEditing','reviewedHistory','searchHistory','segmentedHistory'].some(key=>key in editor))
   throw fail('continued_pair_policy','Supply current host policy and a matching native document restore factory');
  if(recovery&&JSON.stringify(recovery.identity)!==JSON.stringify(identity))
   throw fail('continued_pair_identity','Recovery must match the selected room, actors and history families');
  const {room,writer,selectionEditing,richLanguage,history,rangeEditing,reviewedHistory,searchHistory}=identity.native;
  const key=[room,writer] as const;
  const documentLease=await SharedWriterLease.acquire(room,writer);
  let reviewLease:ReviewWriterLease|undefined,db:IDBDatabase|undefined,raw:SharedRustOwner|undefined,core:SharedRichEditor<P>|undefined;
  let session:SharedContinuedPairSession<P>|undefined;
  try{
   reviewLease=await ReviewWriterLease.acquire(room,review.actor);
   db=await openPairedHistoryDatabase(database,continuedPairStore.names);
   const opening=fenceOpeningDatabase(db,'session_open_versionchange');
   const stored=await readPairedHistoryCut(db,key,continuedPairStore);
   if(stored&&recovery)throw fail('continued_pair_destination_exists','Recovery never overwrites a committed paired destination');
   if(stored&&JSON.stringify(stored.record.identity)!==JSON.stringify(identity))
    throw fail('continued_pair_identity','Stored room, actors or history families differ');
   const selected=stored??recovery;
   if(!selected)throw fail('continued_pair_missing','No saved cut exists for the selected pair');
   const versions=stored?.record.versions??recovery!.versions;
   if(recovery)await makeContinuedPairCut(selected.documentCheckpoint,selected.reviewCheckpoint,identity,versions);
   opening.assertCurrent();
   raw=opening.admit(await restoreDocument(selected.documentCheckpoint));
   initializeSharedReadOnly(raw,readOnly);
   const options={
    ...editor,...(searchHistory?{searchHistory}:{}),...(reviewedHistory?{reviewedHistory}:{}),
    ...(identity.documentHistory==='original'?{}:{segmentedHistory:identity.documentHistory}),
   } as Omit<SharedEditorOptions<'document-v1'>,'selectionEditing'>;
   core=(selectionEditing==='document-v1'?createSharedDocumentEditor(raw,options):new SharedRichEditor(raw,options)) as unknown as SharedRichEditor<P>;
   if(core.richLanguageVersion()!==richLanguage)throw fail('continued_pair_identity','Restored native grammar differs');
   if(identity.reviewHistory==='continued-v2')core.enableContinuedReview(review,selected.reviewCheckpoint);
   else if(identity.reviewHistory==='segmented-v1')core.enableSegmentedReview(review,selected.reviewCheckpoint);
   else core.enableReview(review,selected.reviewCheckpoint);
   core.sealContinuedPairPolicies(identity.documentHistory,identity.reviewHistory,history,rangeEditing);
   const admittedVersions=admitPairedVersions(core,versions);
   const captured=capture(core,identity,admittedVersions);
   if(captured.documentCheckpoint!==selected.documentCheckpoint||captured.reviewCheckpoint!==selected.reviewCheckpoint)
    throw fail('continued_pair_replay','Cold native replay must preserve both exact histories');
   opening.assertCurrent();
   session=new SharedContinuedPairSession(construction,core,db,documentLease,reviewLease,identity,stored?.head??null,admittedVersions,onError);
   if(stored)session.#saved=captured;
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
 #capture():SharedContinuedPairRecovery{
  this.#live();
  return capture(this.#core,this.#identity,this.#versions);
 }
 #makeCut(cut:SharedContinuedPairRecovery):Promise<IndependentHistoryCut>{
  return makeContinuedPairCut(cut.documentCheckpoint,cut.reviewCheckpoint,this.#identity,cut.versions);
 }
 #recordFailure(error:unknown):void{
  this.#failed=true;
  this.#failure=error;
  try{this.#onError?.(error);}catch{/* Reporting cannot change the save outcome. */}
 }
 exportRecovery():SharedContinuedPairRecovery{return this.#capture();}
 save():void{
  this.#checkWrite();
  const next=this.#capture();
  if(!this.#attempt&&!this.#running&&same(this.#saved,next)){this.#pending=undefined;return;}
  this.#pending=next;
  this.#start();
 }
 #start():void{
  if(this.#closed||this.#failed||this.#running||!this.#pending&&!this.#attempt)return;
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
   await writePairedHistoryCut(this.#db,this.#key,this.#head,attempt.cut,continuedPairStore.names,continuedPairStore.readHead,this.#checkWrite);
   if(this.#closed)return;
   this.#checkWrite();
   this.#head=attempt.cut.head;
   this.#saved=attempt.capture;
   this.#attempt=undefined;
  }
 }
 async flush():Promise<void>{
  this.#live();
  while(this.#running)await this.#running;
  if(this.#failed)throw this.#failure;
 }
 async retry():Promise<void>{
  this.#checkWrite();
  if(this.#running)await this.#running;
  this.#failed=false;
  this.#failure=undefined;
  this.save();
  await this.flush();
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
  checkManagedCore(this.#core);
  if(!same(before,this.#capture()))throw fail('continued_pair_stale','The paired source changed during version admission');
  this.#versions.set(info.id,packet);
  this.save();
  await this.flush();
  return info;
 }
 close():Promise<void>{
  if(this.#closed)return this.discardAndClose();
  if(this.#closing)return this.#closing;
  this.#retire();
  this.#closing=Promise.resolve().then(async()=>{
   if(!this.#closed){this.save();await this.flush();}
   await this.discardAndClose();
  }).finally(()=>{this.#closing=undefined;});
  return this.#closing;
 }
 #retire():void{
  if(this.#retired)return;
  this.#retired=true;
  retireOwnedCore(this.#core);
 }
 /** Release the exact owners. Any transaction already committed remains readable on reopen. */
 discardAndClose():Promise<void>{
  if(!this.#closed){
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

function capture<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,identity:ContinuedPairIdentity,versions:Map<string,string>):SharedContinuedPairRecovery{
 const readReview=identity.reviewHistory==='continued-v2'?native.reviewContinuedCheckpoint:
  identity.reviewHistory==='segmented-v1'?native.reviewSegmentedCheckpoint:native.reviewCheckpoint;
 return {
  format:'breditor/shared-independent-history-recovery',formatVersion:2,identity:structuredClone(identity),
  documentCheckpoint:native.checkpointJson.call(core),reviewCheckpoint:readReview.call(core),
  versions:Object.freeze([...versions.values()]),
 };
}
