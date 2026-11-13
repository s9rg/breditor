/** Same-writer migration of an exact, acknowledged local generation cut. */
import {SharedEditorError,SharedRichEditor,createSharedDocumentEditor} from "../core.js";
import {initializeSharedReadOnly} from "../initialize_read_only.js";
import {disposeOwnedCore} from "../owned_core_lifetime.js";
import {freeUnclaimedSharedRustOwner,initializeUnclaimedSharedRustOwner} from "../raw_owner_lifetime.js";
import type {SharedRustProfile} from "../profile.js";
import type {SharedRustOwner,SharedSelectionPolicy} from "../types.js";
import {existingDatabase} from "../participant_recovery/journal.js";
import {SharedWriterLease} from "./writer_lease.js";
import {ReviewWriterLease} from "./review_writer_lease.js";
import {fenceOpeningDatabase} from "./opening_database.js";
import {readGenerationCut,writeSegmentedCut} from "./segmented_database.js";
import {canonicalSegmentedIdentity,makeGenerationCut,readContinuedHead,readSegmentedHead} from "./segmented_head.js";
import {checkSegmentedCheckpoint,object} from "./segmented_checkpoint.js";
import {MAX_SEGMENTED_HEAD_BYTES,type GenerationHead,type SegmentedSessionIdentity,type SegmentedStoredCut} from "./segmented_contract.js";
import type {SharedSegmentedRecovery,SharedSegmentedSessionOptions} from "./segmented_session.js";
import {admitPairedVersions} from "./review_record_admission.js";

export type SharedContinuedHistoryOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=
 Omit<SharedSegmentedSessionOptions<P>,"create"|"restoreSegmented"|"initialGenerations"|"initialReviewCheckpoint">&{
  profile:SharedRustProfile;
 };
export type SharedContinueHistoryOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=
 SharedContinuedHistoryOptions<P>&{expected:SharedSegmentedRecovery;nextGeneration:string};

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
 options:SharedContinuedHistoryOptions<P>;identity:SegmentedSessionIdentity;head:string;checkpoint:string;versions:readonly string[];predecessor:string;
}

export async function openContinuedHistory<P extends SharedSelectionPolicy,T>(
 input:SharedContinuedHistoryOptions<P>,migration:SharedContinueHistoryOptions<P>|undefined,take:(work:Opened<P>)=>T,
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
  const recovery=migration.expected;
  object(recovery,"checkpoint,format,formatVersion,reviewCheckpoint,versions");
  if(recovery.format!=="breditor/shared-generation-recovery"||recovery.formatVersion!==1||
     typeof next!=="string"||!next||options.readOnly||typeof profile.restore_segmented!=="function"||
     recovery.reviewCheckpoint!==null&&typeof recovery.reviewCheckpoint!=="string"||
     !Array.isArray(recovery.versions)||recovery.versions.length>32){
   throw fail("Choose the complete V1 recovery cut and next generation");
  }
  expected={...recovery,versions:[...recovery.versions]};
  if(expected.versions.some(packet=>typeof packet!=="string"))throw fail("Choose exact retained version packets");
  checkSegmentedCheckpoint(expected.checkpoint,identity);
 }
 const factory=globalThis.indexedDB,locks=globalThis.navigator?.locks;
 const lease=await SharedWriterLease.acquire(identity.room,identity.writer);
 let reviewLease:ReviewWriterLease|undefined,db:IDBDatabase|undefined,core:SharedRichEditor<P>|undefined,raw:SharedRustOwner|undefined;
 try{
  if(options.review)reviewLease=await ReviewWriterLease.acquire(identity.room,options.review.actor);
  const context=()=>{if(globalThis.indexedDB!==factory||globalThis.navigator?.locks!==locks)throw fail("The storage context changed");};
  context();
  db=await existingDatabase(database);
  if(!db||db.version!==1||[...db.objectStoreNames].sort().join(",")!=="generation_files,generation_heads"){
   throw fail("Open an existing generation store");
  }
  const opening=fenceOpeningDatabase(db,"session_open_versionchange"),key=[identity.room,identity.writer] as const;
  const check=()=>{context();opening.assertCurrent();lease.assertLive();reviewLease?.assertLive();};
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
  raw=opening.admit(profile.restore_continued_history(identity.room,checkpoint));
  initializeSharedReadOnly(raw,options.readOnly);
  const editor={...options.editor,...(identity.searchHistory?{searchHistory:identity.searchHistory}:{}),
   ...(identity.reviewedHistory?{reviewedHistory:identity.reviewedHistory}:{}),segmentedHistory:"continued-v2" as const};
  core=(identity.selectionEditing==="document-v1"?createSharedDocumentEditor(raw,editor):
   new SharedRichEditor(raw,editor)) as unknown as SharedRichEditor<P>;
  if(options.review)core.enableReview(options.review,saved.record.review!.checkpoint);
  core.sealContinuedHistoryPolicies(identity.history,identity.rangeEditing);
  admitPairedVersions(core,saved.record.versions);
  if(core.richLanguageVersion()!==identity.richLanguage||core.checkpointJson()!==checkpoint||
     options.review&&core.reviewCheckpoint()!==saved.record.review!.checkpoint){
   throw fail("Native restore differs from the complete selected cut");
  }
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
  return take({db,lease,reviewLease,core,options,identity,head,checkpoint,versions:saved.record.versions,predecessor});
 }catch(error){
  try{if(core)disposeOwnedCore(core);}finally{
   try{if(raw)freeUnclaimedSharedRustOwner(raw);}finally{
    db?.close();
    try{await reviewLease?.close();}finally{await lease.close();}
   }
  }
  throw error;
 }
}
