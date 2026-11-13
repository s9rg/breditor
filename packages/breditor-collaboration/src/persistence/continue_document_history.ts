/** Same-writer migration of an exact, acknowledged local generation cut. */
import {SharedEditorError,SharedRichEditor,createSharedDocumentEditor} from "../core.js";
import {initializeSharedReadOnly} from "../initialize_read_only.js";
import {disposeOwnedCore} from "../owned_core_lifetime.js";
import {freeUnclaimedSharedRustOwner,initializeUnclaimedSharedRustOwner} from "../raw_owner_lifetime.js";
import type {SharedRustProfile} from "../profile.js";
import type {SharedRustOwner,SharedSelectionPolicy} from "../types.js";
import {createContinuedDatabase} from "./create_continued_database.js";
import {requireBackupRecovery} from "../backups/identity.js";
import {existingDatabase} from "../participant_recovery/journal.js";
import {SharedWriterLease} from "./writer_lease.js";
import {ReviewWriterLease} from "./review_writer_lease.js";
import {fenceOpeningDatabase} from "./opening_database.js";
import {readGenerationCut,writeSegmentedCut} from "./segmented_database.js";
import {canonicalSegmentedIdentity,makeGenerationCut,readContinuedHead,readSegmentedHead} from "./segmented_head.js";
import {checkSegmentedCheckpoint,object} from "./segmented_checkpoint.js";
import {MAX_SEGMENTED_HEAD_BYTES,type GenerationHead,type SegmentedReview,type SegmentedSessionIdentity,type SegmentedStoredCut} from "./segmented_contract.js";
import type {SharedContinuedHistoryRecovery,SharedSegmentedRecovery,SharedSegmentedSessionOptions} from "./segmented_session.js";
import {admitPairedVersions} from "./review_record_admission.js";

export type SharedContinuedHistoryOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=
 Omit<SharedSegmentedSessionOptions<P>,"create"|"restoreSegmented"|"initialGenerations"|"initialReviewCheckpoint">&{
  profile:SharedRustProfile;
 };
export type SharedContinueHistoryOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=
 SharedContinuedHistoryOptions<P>&{expected:SharedSegmentedRecovery;nextGeneration:string};

/** Both exact native cuts are required to reconstruct the migrated store. */
export interface SharedContinuedHistoryBackup {
 readonly format:"breditor/shared-continued-history-backup";
 readonly formatVersion:1;
 readonly current:SharedContinuedHistoryRecovery;
 readonly predecessor:SharedSegmentedRecovery;
}
export type SharedRestoreContinuedHistoryOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=
 SharedContinuedHistoryOptions<P>&{backup:SharedContinuedHistoryBackup;writerRecovery:"host-reacquired"};

const recoveryGuards=new WeakMap<object,()=>void>();
/** Private catalog boundary. No serialized value or public extra option selects it. */
export function guardContinuedRecovery<T extends object>(input:T,check:()=>void):T{
 recoveryGuards.set(input,check);
 return input;
}

const fail=(message:string)=>new SharedEditorError("continued_history_storage",message);
function readMigrationHead(input:string):GenerationHead{
 if(input.length>MAX_SEGMENTED_HEAD_BYTES)throw fail("The generation head exceeds its byte budget");
 const version=(JSON.parse(input) as {formatVersion?:number}|null)?.formatVersion;
 return version===2?readContinuedHead(input):readSegmentedHead(input);
}
function checkIdentity<P extends SharedSelectionPolicy>(cut:SegmentedStoredCut<GenerationHead>,identity:SegmentedSessionIdentity,options:SharedContinuedHistoryOptions<P>){
 const review=cut.record.review;
 if(JSON.stringify(cut.record.identity)!==JSON.stringify(identity)||!!review!==!!options.review||
    review&&(review.actor!==options.review?.actor||review.principal!==options.review.principal)){
  throw fail("The document or review identity differs from the selected session");
 }
}
function checkPredecessor(current:SegmentedStoredCut<GenerationHead>,prior:SegmentedStoredCut){
 const identity=current.record.identity;
 const a=checkSegmentedCheckpoint(current.checkpoint,identity,2);
 const b=checkSegmentedCheckpoint(prior.checkpoint,identity);
 const prefix=current.files.slice(0,prior.files.length);
 if(a.continuedAfter!==b.sealed.length+1||JSON.stringify(prefix)!==JSON.stringify(prior.files)||
    a.sealed[b.sealed.length]!==b.active){
  throw fail("The continued files do not contain the exact V1 cut");
 }
}
/** A cut's review identity is authenticated by host options at open. */
function reviewRecord(checkpoint:string|null,policy:SharedContinuedHistoryOptions["review"]):SegmentedReview|null{
 if((checkpoint!==null)!==!!policy)throw fail("The review checkpoint differs from the selected account");
 return policy?{actor:policy.actor,principal:policy.principal,checkpoint:checkpoint!}:null;
}
function snapshotRecovery<V extends 1|2>(input:SharedSegmentedRecovery|SharedContinuedHistoryRecovery,version:V){
 object(input,"checkpoint,format,formatVersion,reviewCheckpoint,versions");
 const {checkpoint,reviewCheckpoint,versions}=input;
 if(input.format!=="breditor/shared-generation-recovery"||input.formatVersion!==version||
    typeof checkpoint!=="string"||reviewCheckpoint!==null&&typeof reviewCheckpoint!=="string"||
    !Array.isArray(versions)||versions.length>32)throw fail("Select the complete native recovery cut");
 const packets=[...versions];
 if(packets.some(packet=>typeof packet!=="string"))throw fail("Choose exact retained version packets");
 return Object.freeze({format:"breditor/shared-generation-recovery" as const,formatVersion:version,checkpoint,reviewCheckpoint,versions:Object.freeze(packets)});
}
function makeBackup(current:SharedContinuedHistoryRecovery,predecessor:SharedSegmentedRecovery):SharedContinuedHistoryBackup{
 return Object.freeze({format:"breditor/shared-continued-history-backup",formatVersion:1,current,predecessor});
}
function recoveryRecord<V extends 1|2>(cut:SegmentedStoredCut<GenerationHead>,version:V){
 return Object.freeze({format:"breditor/shared-generation-recovery" as const,formatVersion:version,
  checkpoint:cut.checkpoint,reviewCheckpoint:cut.record.review?.checkpoint??null,versions:Object.freeze([...cut.record.versions])});
}
export async function readContinuedBackup(
 db:IDBDatabase,key:readonly [string,string],head:string,predecessor:string,check:()=>void,
):Promise<SharedContinuedHistoryBackup>{
 check();
 const current=await readGenerationCut(db,key,readContinuedHead);
 check();
 const prior=await readGenerationCut(db,key,readSegmentedHead,true);
 check();
 if(!current||current.head!==head||!prior||prior.head!==predecessor)throw fail("The saved history changed while capturing the backup");
 checkPredecessor(current,prior);
 return makeBackup(recoveryRecord(current,2),recoveryRecord(prior,1));
}
function restoreCore<P extends SharedSelectionPolicy>(
 raw:SharedRustOwner,options:SharedContinuedHistoryOptions<P>,identity:SegmentedSessionIdentity,
 checkpoint:string,review:SegmentedReview|null,versions:readonly string[],continued:boolean,readOnly:boolean,
):SharedRichEditor<P>{
 let core:SharedRichEditor<P>|undefined;
 try{
  initializeSharedReadOnly(raw,readOnly);
  const editor={...options.editor,...(identity.searchHistory?{searchHistory:identity.searchHistory}:{}),
   ...(identity.reviewedHistory?{reviewedHistory:identity.reviewedHistory}:{}),
   segmentedHistory:continued?"continued-v2" as const:"segmented-v1" as const};
  core=(identity.selectionEditing==="document-v1"?createSharedDocumentEditor(raw,editor):
   new SharedRichEditor(raw,editor)) as unknown as SharedRichEditor<P>;
  if(options.review)core.enableReview({...options.review,...(!continued?{access:"read_only" as const}:{})},review!.checkpoint);
  if(continued)core.sealContinuedHistoryPolicies(identity.history,identity.rangeEditing);
  else core.sealSegmentedPolicies(identity.history,identity.rangeEditing);
  admitPairedVersions(core,versions);
  if(core.richLanguageVersion()!==identity.richLanguage||core.checkpointJson()!==checkpoint||
     review&&core.reviewCheckpoint()!==review.checkpoint){
   throw fail("Native restore differs from the complete selected cut");
  }
  return core;
 }catch(error){
  try{if(core)disposeOwnedCore(core);}finally{freeUnclaimedSharedRustOwner(raw);}
  throw error;
 }
}
function convert(profile:SharedRustProfile,room:string,checkpoint:string,next:string):string{
 const raw=profile.restore_segmented!(room,checkpoint);
 try{
  return initializeUnclaimedSharedRustOwner(raw,()=>{
   if(raw.segmented_checkpoint?.()!==checkpoint||typeof raw.continue_history!=="function"||
      typeof raw.continued_history_checkpoint!=="function")throw fail("Use the matching native V1 migration factory");
   const observation=raw.observe();
   try{raw.continue_history(observation,next);}finally{observation.free();}
   return raw.continued_history_checkpoint();
  });
 }finally{freeUnclaimedSharedRustOwner(raw);}
}
interface Opened<P extends SharedSelectionPolicy> {
 db:IDBDatabase;lease:SharedWriterLease;reviewLease:ReviewWriterLease|undefined;core:SharedRichEditor<P>;
 options:SharedContinuedHistoryOptions<P>;identity:SegmentedSessionIdentity;head:string;checkpoint:string;versions:readonly string[];predecessor:string;priorRecovery:SharedSegmentedRecovery;
}

export async function openContinuedHistory<P extends SharedSelectionPolicy,T>(
 input:SharedContinuedHistoryOptions<P>,migration:SharedContinueHistoryOptions<P>|undefined,take:(work:Opened<P>)=>T,
 recovery?:SharedRestoreContinuedHistoryOptions<P>,
):Promise<T>{
 const options={...input,...(input.review?{review:{...input.review}}:{}),...(input.editor?{editor:{...input.editor}}:{})};
 const {database,profile}=options,next=migration?.nextGeneration;
 const identity=canonicalSegmentedIdentity({
  room:options.room,writer:options.writer,richLanguage:options.richLanguage,history:options.history,
  rangeEditing:options.rangeEditing,selectionEditing:options.selectionEditing,searchHistory:options.searchHistory,reviewedHistory:options.reviewedHistory,
 });
 if(typeof database!=="string"||!database||database.length>200||typeof options.readOnly!=="boolean"||
    typeof profile?.restore_continued_history!=="function"||
    identity.reviewedHistory&&identity.reviewedHistory.principal!==options.review?.principal){
  throw fail("Select the current policy and matching continued history factory");
 }
 let expected:SharedSegmentedRecovery|undefined;
 if(migration){
  if(typeof next!=="string"||!next||options.readOnly||typeof profile.restore_segmented!=="function"){
   throw fail("Choose the complete V1 recovery cut and next generation");
  }
  expected=snapshotRecovery(migration.expected,1);
  checkSegmentedCheckpoint(expected.checkpoint,identity);
 }
 let backup:SharedContinuedHistoryBackup|undefined;
 if(recovery){
  requireBackupRecovery(recovery.writerRecovery);
  const selected=recovery.backup;
  object(selected,"current,format,formatVersion,predecessor");
  if(selected.format!=="breditor/shared-continued-history-backup"||selected.formatVersion!==1||
     typeof profile.restore_segmented!=="function")throw fail("Choose both exact native recovery cuts");
  backup=makeBackup(snapshotRecovery(selected.current,2),snapshotRecovery(selected.predecessor,1));
  checkSegmentedCheckpoint(backup.current.checkpoint,identity,2);
  checkSegmentedCheckpoint(backup.predecessor.checkpoint,identity);
 }
 const factory=globalThis.indexedDB,locks=globalThis.navigator?.locks,guard=recoveryGuards.get(input);
 guard?.();
 const lease=await SharedWriterLease.acquire(identity.room,identity.writer);
 let reviewLease:ReviewWriterLease|undefined,db:IDBDatabase|undefined,core:SharedRichEditor<P>|undefined;
 try{
  if(options.review)reviewLease=await ReviewWriterLease.acquire(identity.room,options.review.actor);
  const context=()=>{if(globalThis.indexedDB!==factory||globalThis.navigator?.locks!==locks)throw fail("The storage context changed");};
  context();
  const key=[identity.room,identity.writer] as const;
  const checkCustody=()=>{
   context();lease.assertLive();reviewLease?.assertLive();
   guard?.();
   context();lease.assertLive();reviewLease?.assertLive();
  };
  if(backup){
   const check=checkCustody;
   const {current,predecessor}=backup;
   const review=reviewRecord(current.reviewCheckpoint,options.review);
   const previousReview=reviewRecord(predecessor.reviewCheckpoint,options.review);
   if(predecessor.versions.some((packet,index)=>packet!==current.versions[index])){
    throw fail("The continued version catalog does not contain the exact V1 packets");
   }
   const previous=await makeGenerationCut(predecessor.checkpoint,identity,previousReview,predecessor.versions,1);
   check();
   const cut=await makeGenerationCut(current.checkpoint,identity,review,current.versions,2);
   check();
   checkPredecessor(
    {...cut,checkpoint:current.checkpoint,record:readContinuedHead(cut.head)},
    {...previous,checkpoint:predecessor.checkpoint,record:readSegmentedHead(previous.head)},
   );
   const origin=restoreCore(profile.restore_segmented!(identity.room,predecessor.checkpoint),options,
    identity,predecessor.checkpoint,previousReview,predecessor.versions,false,true);
   try{
    check();
    core=restoreCore(profile.restore_continued_history(identity.room,current.checkpoint),options,
     identity,current.checkpoint,review,current.versions,true,options.readOnly);
    core.verifySegmentedRecoveryOrigin(origin);
   }finally{disposeOwnedCore(origin);}
   check();
   db=await createContinuedDatabase(factory,database,key,cut,previous.head,check);
   check();
   return take({db,lease,reviewLease,core,options,identity,head:cut.head,checkpoint:current.checkpoint,
    versions:current.versions,predecessor:previous.head,priorRecovery:predecessor});
  }
  checkCustody();
  db=await existingDatabase(database);
  if(!db||db.version!==1||[...db.objectStoreNames].sort().join(",")!=="generation_files,generation_heads"){
   throw fail("Open an existing generation store");
  }
  const opening=fenceOpeningDatabase(db,"session_open_versionchange");
  const check=()=>{opening.assertCurrent();checkCustody();opening.assertCurrent();};
  check();
  const saved=await readGenerationCut(db,key,expected?readMigrationHead:readContinuedHead);
  check();
  if(!saved)throw fail("The selected generation head is missing");
  checkIdentity(saved,identity,options);
  const prior=await readGenerationCut(db,key,readSegmentedHead,true);
  check();
  if(prior)checkIdentity(prior,identity,options);
  if(saved.record.formatVersion===2){
   if(!prior)throw fail("The retained V1 predecessor is missing");
   checkPredecessor(saved,prior);
  }else if(prior)throw fail("The V1 head already has a continuation record");

  let checkpoint=saved.checkpoint,head=saved.head;
  let newCut:Awaited<ReturnType<typeof makeGenerationCut>>|undefined;
  if(expected){
   const source=prior??saved;
   if(source.checkpoint!==expected.checkpoint||(source.record.review?.checkpoint??null)!==expected.reviewCheckpoint||
      JSON.stringify(source.record.versions)!==JSON.stringify(expected.versions)){
    throw fail("The selected V1 cut is stale");
   }
   checkpoint=convert(profile,identity.room,source.checkpoint,next!);
   check();
   newCut=await makeGenerationCut(checkpoint,identity,source.record.review,source.record.versions,2);
   check();
   head=newCut.head;
   if(prior&&head!==saved.head)throw fail("The continued head has already advanced or differs from this request");
  }
  const raw=opening.admit(profile.restore_continued_history(identity.room,checkpoint));
  core=restoreCore(raw,options,identity,checkpoint,saved.record.review,saved.record.versions,true,options.readOnly);
  check();
  const predecessor=prior?.head??saved.head;
  if(newCut&&!prior){
   await writeSegmentedCut(db,key,saved.head,newCut,readContinuedHead,{predecessor,migrating:saved.files});
  }else{
   const current=await readGenerationCut(db,key,readContinuedHead);
   const retained=await readGenerationCut(db,key,readSegmentedHead,true);
   if(current?.head!==head||retained?.head!==predecessor)throw fail("The selected history changed during native admission");
  }
  check();
  return take({db,lease,reviewLease,core,options,identity,head,checkpoint,versions:saved.record.versions,predecessor,priorRecovery:recoveryRecord(prior??saved,1)});
 }catch(error){
  try{if(core)disposeOwnedCore(core);}finally{
   db?.close();
   try{await reviewLease?.close();}finally{await lease.close();}
  }
  throw error;
 }
}
