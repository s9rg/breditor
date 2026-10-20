/** Generation-aware native sessions. No old database, checkpoint or writer identity is migrated. */
import {SharedEditorError,SharedRichEditor,createSharedDocumentEditor} from "../core.js";
import {initializeSharedReadOnly} from "../initialize_read_only.js";
import type {SharedRustOwner,SharedSelectionPolicy,SharedEditorOptions} from "../types.js";
import type {SharedReviewPolicy} from "../review_types.js";
import type {SharedDocumentVersionInfo} from "../version_types.js";
import {SharedWriterLease} from "./writer_lease.js";
import {ReviewWriterLease} from "./review_writer_lease.js";
import {fenceOpeningDatabase} from "./opening_database.js";
import {openSegmentedDatabase,readSegmentedCut,writeSegmentedCut} from "./segmented_database.js";
import {canonicalSegmentedIdentity,checkSegmentedCapture,makeSegmentedCut,previewSegmentedHead} from "./segmented_head.js";
import {segmentedCompanion,withSegmentedCompanion,type SegmentedSessionCompanion} from "./segmented_driver.js";
import {checkSegmentedCheckpoint,object} from "./segmented_checkpoint.js";
import {requireBackupRecovery} from "../backups/identity.js";
import {admitPairedVersions} from "./review_record_admission.js";
import type {SegmentedSessionIdentity,SegmentedReview,SegmentedCut} from "./segmented_contract.js";

export interface SharedSegmentedSessionOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends Omit<SegmentedSessionIdentity,"selectionEditing"> {
 database:string;selectionEditing:P;readOnly:boolean;
 /** Initial IDs apply only to an absent dedicated store. Existing native generations never reset. */
 initialGenerations:{root:string;active:string};
 create:()=>SharedRustOwner|Promise<SharedRustOwner>;
 restoreSegmented:(checkpoint:string)=>SharedRustOwner|Promise<SharedRustOwner>;
 /** Current authenticated policy, not a role restored from a stored journal. */
 review?:SharedReviewPolicy;initialReviewCheckpoint?:string;
 editor?:Omit<SharedEditorOptions<"document-v1">,"selectionEditing"|"reviewedHistory"|"searchHistory"|"segmentedHistory">;
 onError?:(error:unknown)=>void;onState?:(state:SharedSegmentedSaveState)=>void;
}
export interface SharedSegmentedSaveState {status:"saved"|"pending"|"failed"|"closed";documentRevision:string|null;reviewRevision:string|null;error:string|null}
/** Exact native recovery inputs, not saved permissions, credentials, assets or provider receipts. */
export interface SharedSegmentedRecovery {readonly format:"breditor/shared-generation-recovery";readonly formatVersion:1;readonly checkpoint:string;readonly reviewCheckpoint:string|null;readonly versions:readonly string[]}
export type SharedSegmentedRecoveryOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Omit<SharedSegmentedSessionOptions<P>,"create"|"initialGenerations"|"initialReviewCheckpoint">&{recovery:SharedSegmentedRecovery;writerRecovery:"host-reacquired"};
interface Capture {checkpoint:string;review:SegmentedReview|null;versions:string[];documentRevision:string;reviewRevision:string|null;companion:string|null}
interface Attempt {capture:Capture;cut:SegmentedCut|undefined}
const same=(a:Capture|undefined,b:Capture)=>!!a&&a.checkpoint===b.checkpoint&&a.review?.checkpoint===b.review?.checkpoint&&JSON.stringify(a.versions)===JSON.stringify(b.versions)&&a.companion===b.companion;

/** Both leases precede cold native replay. Only complete superseded captures are coalesced. */
export class SharedSegmentedPersistentSession<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 readonly core:SharedRichEditor<P>;readonly recovered:boolean;
 readonly #db:IDBDatabase;readonly #documentLease:SharedWriterLease;readonly #reviewLease:ReviewWriterLease|undefined;
 readonly #identity:SegmentedSessionIdentity;readonly #options:Pick<SharedSegmentedSessionOptions<P>,"review"|"onError"|"onState">;
 readonly #companion:SegmentedSessionCompanion|undefined;
 #versions=new Map<string,string>();#off:(()=>void)[]=[];#pending:Capture|undefined;#attempt:Attempt|undefined;#running:Promise<void>|undefined;
 #savedHead:string|null;#saved:Capture|undefined;#closedSaved:{documentRevision:string|null;reviewRevision:string|null}|undefined;#failure:unknown;#closed=false;#retiring=false;#storageChanged=false;#closing:Promise<void>|undefined;#released:Promise<void>|undefined;
 private constructor(db:IDBDatabase,lease:SharedWriterLease,reviewLease:ReviewWriterLease|undefined,core:SharedRichEditor<P>,options:SharedSegmentedSessionOptions<P>,identity:SegmentedSessionIdentity,head:string|null,versions:readonly string[],recovered=head!==null,companion?:SegmentedSessionCompanion){
  this.#companion=companion;companion?.admit(core as unknown as SharedRichEditor<SharedSelectionPolicy>);
  this.#db=db;this.#documentLease=lease;this.#reviewLease=reviewLease;this.core=core;this.#options={...(options.review?{review:options.review}:{}),...(options.onError?{onError:options.onError}:{}),...(options.onState?{onState:options.onState}:{})};this.#identity=identity;this.#savedHead=head;this.recovered=recovered;this.#versions=admitPairedVersions(core,versions);
  const save=()=>{try{this.save();}catch(error){this.#failed(error);}};
  this.#off=[core.subscribe(save),...(options.review?[core.subscribeReview(save)]:[])];
  db.onversionchange=()=>{this.#storageChanged=true;try{this.#companion?.retire?.();}finally{core.retire();db.close();this.#failed(new SharedEditorError("segmented_versionchange","Generation storage changed; export the readable native histories before explicitly discarding"));}};
 }
 static async open<Q extends SharedSelectionPolicy>(input:SharedSegmentedSessionOptions<Q>):Promise<SharedSegmentedPersistentSession<Q>>{return this.#open(input);}
 /** Native admission into an absent dedicated destination, after host reacquisition/fencing. Never merge or overwrite. */
 static async restoreRecovery<Q extends SharedSelectionPolicy>(input:SharedSegmentedRecoveryOptions<Q>):Promise<SharedSegmentedPersistentSession<Q>>{
  requireBackupRecovery(input.writerRecovery);object(input.recovery,"checkpoint,format,formatVersion,reviewCheckpoint,versions");
  const r=input.recovery;if(r.format!=="breditor/shared-generation-recovery"||r.formatVersion!==1||typeof r.checkpoint!=="string"||r.reviewCheckpoint!==null&&typeof r.reviewCheckpoint!=="string"||!Array.isArray(r.versions)||r.versions.length>32||r.versions.some(v=>typeof v!=="string"))throw new SharedEditorError("segmented_recovery","Unknown native generation recovery input");
  const {recovery:_recovery,writerRecovery:_writerRecovery,...options}=input;
  const identity=canonicalSegmentedIdentity({room:options.room,writer:options.writer,richLanguage:options.richLanguage,history:options.history,rangeEditing:options.rangeEditing,selectionEditing:options.selectionEditing,searchHistory:options.searchHistory,reviewedHistory:options.reviewedHistory}),a=checkSegmentedCheckpoint(r.checkpoint,identity);
  const selected={...r,versions:[...r.versions]};
  const opening={...options,initialGenerations:{root:a.rootGeneration,active:(JSON.parse(a.active) as {generation:string}).generation},create:()=>{throw new SharedEditorError("segmented_recovery","Recovery cannot fall back to a fresh document");}},companion=segmentedCompanion(input);
  return this.#open(companion?withSegmentedCompanion(opening,companion):opening,selected);
 }
 static async #open<Q extends SharedSelectionPolicy>(input:SharedSegmentedSessionOptions<Q>,recovery?:SharedSegmentedRecovery):Promise<SharedSegmentedPersistentSession<Q>>{
  const companion=segmentedCompanion(input);
  const identity=canonicalSegmentedIdentity({room:input.room,writer:input.writer,richLanguage:input.richLanguage,history:input.history,rangeEditing:input.rangeEditing,selectionEditing:input.selectionEditing,searchHistory:input.searchHistory,reviewedHistory:input.reviewedHistory});
  if(typeof input.readOnly!=="boolean"||typeof input.create!=="function"||typeof input.restoreSegmented!=="function"||!input.initialGenerations||typeof input.initialGenerations.root!=="string"||typeof input.initialGenerations.active!=="string")throw new SharedEditorError("segmented_session_policy","Explicit generation recovery, IDs and current editing policy are required");
  if(input.reviewedHistory&&(!input.review||input.review.principal!==input.reviewedHistory.principal)||!input.review&&input.initialReviewCheckpoint!==undefined)throw new SharedEditorError("segmented_review_policy","Reviewed ownership and initial comments require the matching explicitly paired account");
  const options={...input,initialGenerations:{...input.initialGenerations},...(input.review?{review:{...input.review}}:{}),...(input.editor?{editor:{...input.editor}}:{})};
  if(options.editor&&["selectionEditing","reviewedHistory","searchHistory","segmentedHistory"].some(k=>k in options.editor!))throw new SharedEditorError("segmented_session_policy","Pin generation policies through the dedicated session, not nested editor options");
  const lease=await SharedWriterLease.acquire(identity.room,identity.writer);let reviewLease:ReviewWriterLease|undefined,db:IDBDatabase|undefined,core:SharedRichEditor<Q>|undefined;
  try{
   if(options.review)reviewLease=await ReviewWriterLease.acquire(identity.room,options.review.actor);
   db=await openSegmentedDatabase(options.database);const opening=fenceOpeningDatabase(db,"session_open_versionchange"),saved=await readSegmentedCut(db,[identity.room,identity.writer],companion?.readHead);
   if(recovery&&saved)throw new SharedEditorError("segmented_destination_exists","Recovery cannot overwrite an existing generation head");
   if(saved)companion?.load(saved.head);
   if(saved&&(JSON.stringify(saved.record.identity)!==JSON.stringify(identity)||!!saved.record.review!==!!options.review||saved.record.review&&(saved.record.review.actor!==options.review?.actor||saved.record.review.principal!==options.review.principal)))throw new SharedEditorError("segmented_session_identity","Stored generation/account policy differs from the selected session");
   const source=saved?.checkpoint??recovery?.checkpoint,sourceReview=saved?.record.review?.checkpoint??recovery?.reviewCheckpoint??null;
   if(recovery){if((sourceReview!==null)!==!!options.review)throw new SharedEditorError("segmented_recovery","Recovery comment lane differs from the selected account");checkSegmentedCapture(recovery.checkpoint,identity,options.review?{actor:options.review.actor,principal:options.review.principal,checkpoint:sourceReview!}:null,recovery.versions);}
   const raw=opening.admit(await(source!==undefined?options.restoreSegmented(source):options.create()));
   if(source!==undefined){
    // Initial policy runs before facade ownership transfer. A refused unpublished owner is
    // still ours to release; the outer cleanup has no core to dispose at this point.
    try{initializeSharedReadOnly(raw,options.readOnly);}catch(error){raw.free();throw error;}
   }
   const editor={...options.editor,...(identity.searchHistory?{searchHistory:identity.searchHistory}:{}),...(identity.reviewedHistory?{reviewedHistory:identity.reviewedHistory}:{}),...(source!==undefined?{segmentedHistory:"segmented-v1" as const}:{})};
   core=(identity.selectionEditing==="document-v1"?createSharedDocumentEditor(raw,editor):new SharedRichEditor<"original">(raw,editor)) as unknown as SharedRichEditor<Q>;
   if(core.richLanguageVersion()!==identity.richLanguage)throw new SharedEditorError("segmented_session_identity","Native grammar differs from the selected generation store");
   if(identity.history==="typing-v1"){if(core.view().historyGrouping!=="typing-v1")core.enableTypingHistory();}else if(core.view().historyGrouping!==undefined)throw new SharedEditorError("segmented_session_policy","Cannot flatten retained natural history");
   if(identity.rangeEditing==="general-v1"&&core.view().rangeEditing!=="general-v1")core.enableGeneralRanges();
   if(options.review)core.enableReview(options.review,sourceReview??options.initialReviewCheckpoint);
   if(source===undefined){core.enableSegmentedHistory(options.initialGenerations.root,options.initialGenerations.active);if(options.readOnly)core.setReadOnly(true);}
   core.sealSegmentedPolicies(identity.history,identity.rangeEditing);
   if(source!==undefined&&(core.checkpointJson()!==source||options.review&&core.reviewCheckpoint()!==sourceReview))throw new SharedEditorError("segmented_native_replay","Native replay must preserve the exact document and comment files");
   opening.assertCurrent();const session=new SharedSegmentedPersistentSession(db,lease,reviewLease,core,options,identity,saved?.head??null,saved?.record.versions??recovery?.versions??[],source!==undefined,companion);
   session.save();try{await session.flush();}catch(error){await session.discardAndClose();throw error;}return session;
  }catch(error){core?.dispose();db?.close();try{await reviewLease?.close();}finally{await lease.close();}throw error;}
 }
 #live():void{if(this.#closed)throw new SharedEditorError("segmented_session_closed","The generation session is closed");this.#documentLease.assertLive();this.#reviewLease?.assertLive();}
 /** Exact live borrowed owner check; a DTO or copied identity cannot manufacture source custody. */
 checkBorrowedSource(core:SharedRichEditor<P>):void{this.#live();if(core!==this.core||this.#retiring||this.#storageChanged)throw new SharedEditorError("segmented_source_unavailable","The original generation source is no longer available for transport");}
 /** Private-family companions can distinguish acknowledged storage from an uncertain attempt. */
 savedCompanion():string|null{this.#live();return this.#saved?.companion??null;}
 #report(error:unknown):void{try{this.#options.onError?.(error);}catch{/* Host reporting cannot change a durable cut. */}}
 #notify():void{try{this.#options.onState?.(this.state());}catch(error){this.#report(error);}}
 #failed(error:unknown):void{this.#failure=error;this.#report(error);this.#notify();}
 #capture():Capture{const review=this.#options.review,snapshot=review?this.core.reviewSnapshot():null;return {checkpoint:this.core.checkpointJson(),review:review?{actor:review.actor,principal:review.principal,checkpoint:this.core.reviewCheckpoint()}:null,versions:[...this.#versions.values()],documentRevision:this.core.view().revision,reviewRevision:snapshot?.reviewRevision??null,companion:this.#companion?.capture()??null};}
 #checkCapture(capture:Capture):void{checkSegmentedCapture(capture.checkpoint,this.#identity,capture.review,capture.versions);if(this.#companion)this.#companion.wrap(JSON.parse(previewSegmentedHead(capture.checkpoint,this.#identity,capture.review,capture.versions)),capture.companion!);}
 state():SharedSegmentedSaveState{return{status:this.#closed?"closed":this.#failure?"failed":this.#pending||this.#attempt||this.#running?"pending":"saved",documentRevision:this.#closedSaved?.documentRevision??this.#saved?.documentRevision??null,reviewRevision:this.#closedSaved?.reviewRevision??this.#saved?.reviewRevision??null,error:this.#failure?String(this.#failure):null};}
 /** Exact native files remain exportable after write/version-change failures; no role is exported. */
 exportRecovery():SharedSegmentedRecovery{this.#live();const c=this.#capture();return Object.freeze({format:"breditor/shared-generation-recovery",formatVersion:1,checkpoint:c.checkpoint,reviewCheckpoint:c.review?.checkpoint??null,versions:Object.freeze([...c.versions])});}
 save():void{this.#live();if(this.#storageChanged)throw new SharedEditorError("segmented_versionchange","The generation database changed");const capture=this.#capture();this.#checkCapture(capture);if(same(this.#saved,capture)&&!this.#attempt&&!this.#pending&&!this.#running&&!this.#failure)return;this.#pending=capture;this.#failure=undefined;this.#notify();this.#start();}
 #start():void{if(this.#running||this.#closed||this.#failure||!this.#attempt&&!this.#pending)return;this.#running=this.#drain().catch(error=>this.#failed(error)).finally(()=>{this.#running=undefined;if(!this.#failure)this.#start();});}
 async #drain():Promise<void>{while(!this.#closed&&(this.#attempt||this.#pending)){
  this.#documentLease.assertLive();this.#reviewLease?.assertLive();
  if(!this.#attempt){const capture=this.#pending!;this.#pending=undefined;if(same(this.#saved,capture))continue;this.#attempt={capture,cut:undefined};}
  const attempt=this.#attempt;if(!attempt.cut){const cut=await makeSegmentedCut(attempt.capture.checkpoint,this.#identity,attempt.capture.review,attempt.capture.versions);attempt.cut=this.#companion?{head:this.#companion.wrap(JSON.parse(cut.head),attempt.capture.companion!),files:cut.files}:cut;}
  await writeSegmentedCut(this.#db,[this.#identity.room,this.#identity.writer],this.#savedHead,attempt.cut,this.#companion?.readHead);
  if(this.#closed){this.#attempt=undefined;return;}
  this.#savedHead=attempt.cut.head;this.#saved=attempt.capture;this.#attempt=undefined;if(attempt.capture.companion!==null)this.#companion?.acknowledged?.(attempt.capture.companion);this.#notify();
 }}
 async flush():Promise<void>{this.#live();while(this.#running){await this.#running;if(this.#failure)throw this.#failure;}if(this.#failure)throw this.#failure;}
 /** Retry the exact uncertain attempt first. A newer pending capture cannot overwrite an unacknowledged cut. */
 async retry():Promise<void>{this.#live();if(this.#running)await this.#running;this.save();await this.flush();}
 /** Closes only the document generation. The paired comment journal and both Undo/Redo stacks remain. */
 async sealGeneration(next:string):Promise<void>{this.#live();this.core.sealHistoryGeneration(next);await this.flush();}
 /** Explicit observer archive operation; native read-only and zero-prefix checks remain live. */
 async sealObserverGeneration(next:string):Promise<void>{this.#live();this.core.sealObserverHistoryGeneration(next);await this.flush();}
 saveVersion(name:string,createdAtMs:string):SharedDocumentVersionInfo{this.#live();if(!this.#options.review)throw new SharedEditorError("segmented_review_policy","Named paired versions require an explicit review account");return this.retainVersion(this.core.captureVersion(name,this.#options.review.principal,createdAtMs));}
 retainVersion(packet:string):SharedDocumentVersionInfo{this.#live();if(this.#retiring||this.#storageChanged)throw new SharedEditorError("segmented_session_closing","Cannot change the version catalog after retirement or a storage change");const info=this.core.readVersion(packet),known=this.#versions.get(info.id);if(known!==undefined){if(known!==packet)throw new SharedEditorError("version_catalog","Immutable version has different bytes");return info;}if(this.#versions.size>=32||new TextEncoder().encode(packet).length>4*1024*1024)throw new SharedEditorError("version_catalog","The original named-version budget is full");const c=this.#capture();this.#checkCapture({...c,versions:[...c.versions,packet]});this.#versions.set(info.id,packet);this.save();return info;}
 versions():readonly SharedDocumentVersionInfo[]{this.#live();return [...this.#versions.values()].map(p=>this.core.readVersion(p));}
 versionPacket(id:string):string{this.#live();const packet=this.#versions.get(id);if(packet===undefined)throw new SharedEditorError("version_unknown","Unknown immutable version");return packet;}
 /** Retire first. Failed final persistence retains readable histories and both leases for retry. */
 close():Promise<void>{try{return this.#close();}catch(error){return Promise.reject(error);}}
 #close():Promise<void>{if(this.#closed)return this.#released??Promise.resolve();if(this.#closing)return this.#closing;this.#retiring=true;this.core.retire();this.#closing=Promise.resolve().then(async()=>{if(this.#closed){await this.#released;return;}this.save();await this.flush();await this.discardAndClose();}).finally(()=>{this.#closing=undefined;});return this.#closing;}
 /** Explicitly abandon unsaved memory; never delete an immutable file or committed head. */
 discardAndClose():Promise<void>{try{return this.#discardAndClose();}catch(error){return Promise.reject(error);}}
 #discardAndClose():Promise<void>{if(this.#closed)return this.#released??Promise.resolve();this.#closedSaved={documentRevision:this.#saved?.documentRevision??null,reviewRevision:this.#saved?.reviewRevision??null};this.#closed=true;this.core.retire();for(const off of this.#off)off();this.#off=[];this.core.dispose();this.#pending=undefined;this.#saved=undefined;this.#versions.clear();this.#db.close();this.#released=(this.#running??Promise.resolve()).then(async()=>{this.#attempt=undefined;this.#savedHead=null;try{await this.#reviewLease?.close();}finally{await this.#documentLease.close();}});this.#notify();return this.#released;}
}
