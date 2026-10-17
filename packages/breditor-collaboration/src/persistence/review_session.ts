import {SharedRichEditor,SharedEditorError,createSharedDocumentEditor} from "../core.js";
import type {SharedRustOwner,SharedSelectionPolicy,SharedRangePolicy,SharedHistoryPolicy,SharedEditorOptions} from "../types.js";
import type {SharedReviewPolicy} from "../review_types.js";
import type {SharedDocumentVersionInfo} from "../version_types.js";
import {SharedWriterLease} from "./writer_lease.js";
import {ReviewWriterLease} from "./review_writer_lease.js";
import {openSessionDatabase} from "./session_database.js";
import {checkReviewRecord,readReviewRecord,writeReviewRecord,type ReviewCheckpointRecord} from "./review_database.js";
import {checkReviewRelayRecord,readReviewRelayRecord,writeReviewRelayRecord,type ReviewRelayCheckpointRecord} from "./review_relay_database.js";
import {reviewProgress,reviewStorageIdentity} from "../relay/review_validation.js";
import type {SharedReviewRelayStorageIdentity,SharedReviewRelayProgress} from "../relay/review_types.js";
type PairedRecord=ReviewCheckpointRecord|ReviewRelayCheckpointRecord;
export interface SharedReviewSessionPolicy<P extends SharedSelectionPolicy=SharedSelectionPolicy> {history:SharedHistoryPolicy;rangeEditing:SharedRangePolicy;selectionEditing:P;richLanguage:1|2|3}
/** Explicit paired recovery. Factories run only after both document and review writers are leased. */
export interface SharedReviewSessionOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends SharedReviewSessionPolicy<P> {
 database:string;room:string;writer:string;review:SharedReviewPolicy;
 create:()=>SharedRustOwner|Promise<SharedRustOwner>;
 restore:(documentCheckpoint:string,policy:Readonly<SharedReviewSessionPolicy<P>>)=>SharedRustOwner|Promise<SharedRustOwner>;
 onError?:(error:unknown)=>void;editor?:Omit<SharedEditorOptions<"document-v1">,"selectionEditing">;
 /** Explicit new storage family; never infer/upgrade a local-only paired record. Contains no secrets. */
 relay?:SharedReviewRelayStorageIdentity;
}
export interface SharedReviewSaveState {status:"saved"|"pending"|"failed"|"closed";documentRevision:string|null;reviewRevision:string|null;error:string|null}
/** Native document/review owners plus a local immutable packet catalog, saved as one atomic record. */
export class SharedReviewPersistentSession<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 readonly core:SharedRichEditor<P>;readonly recovered:boolean;
 readonly #db:IDBDatabase;readonly #documentLease:SharedWriterLease;readonly #reviewLease:ReviewWriterLease;readonly #options:SharedReviewSessionOptions<P>;
 #versions=new Map<string,string>();#unsubscribe:(()=>void)[]=[];#pending:PairedRecord|undefined;#running:Promise<void>|undefined;
 #relayProgress:SharedReviewRelayProgress={cursor:null,accepted:null,sequence:null};#durableRelayProgress:SharedReviewRelayProgress={cursor:null,accepted:null,sequence:null};
 #saved:string|undefined;#failure:unknown;#closed=false;#retiring=false;#closedRevisions:{documentRevision:string;reviewRevision:string}|undefined;#closing:Promise<void>|undefined;#released:Promise<void>|undefined;
 private constructor(db:IDBDatabase,documentLease:SharedWriterLease,reviewLease:ReviewWriterLease,core:SharedRichEditor<P>,options:SharedReviewSessionOptions<P>,recovered:boolean,versions:readonly string[],progress?:SharedReviewRelayProgress){
  this.#db=db;this.#documentLease=documentLease;this.#reviewLease=reviewLease;this.core=core;this.#options=options;this.recovered=recovered;
  if(progress){this.#relayProgress=structuredClone(progress);this.#durableRelayProgress=structuredClone(progress);this.#validateNativeProgress(progress);}
  for(const packet of versions){const info=core.readVersion(packet);if(this.#versions.has(info.id))throw new SharedEditorError("version_catalog","Duplicate immutable version in recovery");this.#versions.set(info.id,packet);}
  const autosave=()=>{try{this.save();}catch(error){this.#failed(error);}};
  this.#unsubscribe=[core.subscribe(autosave),core.subscribeReview(autosave)];
  db.onversionchange=()=>{core.retire();db.close();this.#failed(new SharedEditorError("review_versionchange","Paired storage changed; export both readable histories before explicitly discarding this writer"));};
 }
 static async open<Q extends SharedSelectionPolicy>(input:SharedReviewSessionOptions<Q>):Promise<SharedReviewPersistentSession<Q>>{
  if(input.relay!==undefined&&(!input.relay||typeof input.relay!=="object"||Array.isArray(input.relay)))throw new SharedEditorError("review_relay_identity","Expected an explicit nonsecret relay storage identity");
  const options={...input,review:{...input.review},...(input.relay?{relay:reviewStorageIdentity(input.relay)}:{})};
  if(![1,2,3].includes(options.richLanguage)||(options.history!=="explicit"&&options.history!=="typing-v1")||(options.rangeEditing!=="original"&&options.rangeEditing!=="general-v1")||(options.selectionEditing!=="original"&&options.selectionEditing!=="document-v1")||(options.selectionEditing==="document-v1"&&options.rangeEditing!=="general-v1"))throw new SharedEditorError("review_session_policy","Explicit compatible review session policies are required");
  const documentLease=await SharedWriterLease.acquire(options.room,options.writer);let reviewLease:ReviewWriterLease|undefined,db:IDBDatabase|undefined,core:SharedRichEditor<Q>|undefined;
  try{
   reviewLease=await ReviewWriterLease.acquire(options.room,options.review.actor);db=await openSessionDatabase(options.database);
   const saved=await(options.relay?readReviewRelayRecord(db,[options.room,options.writer]):readReviewRecord(db,[options.room,options.writer]));
   if(options.relay&&(options.relay.room!==options.room||options.relay.documentWriter!==options.writer||options.relay.actor!==options.review.actor||options.relay.principal!==options.review.principal||saved&&("relay" in saved?JSON.stringify(reviewStorageIdentity(saved.relay))!==JSON.stringify(options.relay):true)))throw new SharedEditorError("review_relay_identity","Stored relay binding does not match this explicitly paired session");
   if(saved&&(saved.reviewActor!==options.review.actor||saved.principal!==options.review.principal||saved.history!==options.history||saved.rangeEditing!==options.rangeEditing||saved.selectionEditing!==options.selectionEditing||saved.richLanguage!==options.richLanguage))throw new SharedEditorError("review_session_identity","Stored review identity/policies do not match the explicitly leased session");
   const selected:SharedReviewSessionPolicy<Q>={history:options.history,rangeEditing:options.rangeEditing,selectionEditing:options.selectionEditing,richLanguage:options.richLanguage};
   const raw=await(saved?options.restore(saved.documentCheckpointJson,Object.freeze(selected)):options.create());
   const editor={...options.editor,...(options.onError&&!options.editor?.onError?{onError:options.onError}:{})};
   // The immutable constructor branch and stored policy check above establish the generic family.
   core=(options.selectionEditing==="document-v1"?createSharedDocumentEditor(raw,editor):new SharedRichEditor<"original">(raw,editor)) as unknown as SharedRichEditor<Q>;
   if(core.richLanguageVersion()!==options.richLanguage)throw new SharedEditorError("review_session_identity","Native language differs from the declared paired session");
   if(options.history==="typing-v1")core.enableTypingHistory();else if(core.view().historyGrouping!==undefined)throw new SharedEditorError("review_session_policy","Cannot flatten a natural-history review owner");
   if(options.rangeEditing==="general-v1")core.enableGeneralRanges();
   core.enableReview(options.review,saved?.reviewCheckpointJson);core.sealReviewPolicies(options.history,options.rangeEditing);
   if(options.relay&&!core.supportsReviewTransport())throw new SharedEditorError("review_transport_unavailable","Paired relay storage needs matching native lineage proofs");
   const session=new SharedReviewPersistentSession(db,documentLease,reviewLease,core,options,saved!==null,saved?.versions??[],saved&&"progress" in saved?saved.progress:undefined);
   session.save();try{await session.flush();}catch(error){await session.discardAndClose();throw error;}return session;
  }catch(error){core?.dispose();db?.close();try{await reviewLease?.close();}finally{await documentLease.close();}throw error;}
 }
 #live():void{if(this.#closed)throw new SharedEditorError("review_session_closed","The paired review session is closed");this.#documentLease.assertLive();this.#reviewLease.assertLive();}
 #failed(error:unknown):void{this.#failure=error;try{this.#options.onError?.(error);}catch{/* Reporting cannot replace either native history. */}}
 #record(versions=this.#versions):PairedRecord{
  const base={formatVersion:1 as const,history:this.#options.history,rangeEditing:this.#options.rangeEditing,selectionEditing:this.#options.selectionEditing,richLanguage:this.#options.richLanguage,reviewActor:this.#options.review.actor,principal:this.#options.review.principal,documentCheckpointJson:this.core.checkpointJson(),reviewCheckpointJson:this.core.reviewCheckpoint(),versions:[...versions.values()]};
  return this.#options.relay?{format:"breditor/shared-review-relay-checkpoint-record",...base,relay:{...this.#options.relay},progress:structuredClone(this.#relayProgress)}:{format:"breditor/shared-review-checkpoint-record",...base};
 }
 #checkRecord(record:PairedRecord):void{if(record.format==="breditor/shared-review-relay-checkpoint-record")checkReviewRelayRecord(record,[this.#options.room,this.#options.writer]);else checkReviewRecord(record,[this.#options.room,this.#options.writer]);}
 #validateNativeProgress(progress:SharedReviewRelayProgress):void{if(progress.accepted){const own=this.core.localReviewClock();if(own.actor!==progress.accepted.actor)throw new SharedEditorError("review_relay_identity","Native review writer differs from saved progress");const local=this.core.reviewWriterClock(own.actor,this.#options.review.principal,progress.accepted.through);if(local.prefixDigest!==progress.accepted.prefixDigest)throw new SharedEditorError("review_relay_fork","Saved acceptance does not match native retained history");}}
 /** Exact readable paired export, including after a failed save/close; it grants no live permissions. */
 exportRecovery():PairedRecord{this.#live();return this.#record();}
 /** Nonsecret fixed binding; a local-only session cannot silently become relay-aware. */
 reviewRelayIdentity():SharedReviewRelayStorageIdentity|null{this.#live();return this.#options.relay?{...this.#options.relay}:null;}
 /** Only successfully committed progress, never an attempted/aborted IndexedDB cursor. */
 reviewRelayProgress():SharedReviewRelayProgress{this.#live();return structuredClone(this.#durableRelayProgress);}
 /** Capture both native journals and progress in one transaction; failed saves retain all inputs. */
 async persistReviewRelayProgress(input:SharedReviewRelayProgress):Promise<void>{
  this.#live();const identity=this.#options.relay;if(!identity)throw new SharedEditorError("review_relay_storage","Explicit paired relay storage is required");
  const next=reviewProgress(input,identity),previous=this.#relayProgress;
  if(previous.cursor&&(!next.cursor||BigInt(next.cursor.after)<BigInt(previous.cursor.after))||previous.accepted&&(!next.accepted||BigInt(next.accepted.through)<BigInt(previous.accepted.through)||next.accepted.through===previous.accepted.through&&next.accepted.prefixDigest!==previous.accepted.prefixDigest))throw new SharedEditorError("review_relay_rollback","Paired relay progress cannot move backwards");
  this.#validateNativeProgress(next);this.#relayProgress=next;this.save();await this.flush();
 }
 state():SharedReviewSaveState{const snapshot=this.#closedRevisions??this.core.reviewSnapshot();return {status:this.#closed?"closed":this.#failure?"failed":this.#pending||this.#running?"pending":"saved",documentRevision:snapshot.documentRevision,reviewRevision:snapshot.reviewRevision,error:this.#failure?String(this.#failure):null};}
 /** Synchronously capture both exact native lanes; coalesce only complete superseded pairs. */
 save():void{this.#live();const record=this.#record();this.#checkRecord(record);const encoded=JSON.stringify(record);if(encoded===this.#saved&&!this.#pending&&!this.#running&&!this.#failure)return;this.#pending=record;this.#failure=undefined;this.#start();}
 #start():void{if(this.#running||this.#closed||!this.#pending)return;this.#running=this.#drain().catch(error=>this.#failed(error)).finally(()=>{this.#running=undefined;if(!this.#failure)this.#start();});}
 async #drain():Promise<void>{while(this.#pending&&!this.#closed){this.#documentLease.assertLive();this.#reviewLease.assertLive();const next=this.#pending;this.#pending=undefined;try{if(next.format==="breditor/shared-review-relay-checkpoint-record")await writeReviewRelayRecord(this.#db,[this.#options.room,this.#options.writer],next);else await writeReviewRecord(this.#db,[this.#options.room,this.#options.writer],next);}catch(error){this.#pending??=next;throw error;}this.#saved=JSON.stringify(next);if(next.format==="breditor/shared-review-relay-checkpoint-record")this.#durableRelayProgress=structuredClone(next.progress);}}
 async flush():Promise<void>{this.#live();while(this.#running){await this.#running;if(this.#failure)throw this.#failure;}if(this.#failure)throw this.#failure;}
 async retry():Promise<void>{this.#live();if(this.#running)await this.#running;this.save();await this.flush();}
 /** Capture and retain one immutable named snapshot; publication and packet persistence are host-local. */
 saveVersion(name:string,createdAtMs:string):SharedDocumentVersionInfo{this.#live();const packet=this.core.captureVersion(name,this.#options.review.principal,createdAtMs);return this.retainVersion(packet);}
 /** The host must authenticate imported provenance separately; native digest/binding/content still admit. */
 retainVersion(packet:string):SharedDocumentVersionInfo{this.#live();if(this.#retiring)throw new SharedEditorError("review_session_closing","Cannot retain versions after retirement");const info=this.core.readVersion(packet),candidate=new Map(this.#versions),known=candidate.get(info.id);if(known!==undefined){if(known!==packet)throw new SharedEditorError("version_catalog","Different packet bytes under a retained immutable version");return info;}candidate.set(info.id,packet);this.#checkRecord(this.#record(candidate));this.#versions=candidate;this.save();return info;}
 versions():readonly SharedDocumentVersionInfo[]{this.#live();return [...this.#versions.values()].map(packet=>this.core.readVersion(packet));}
 versionPacket(id:string):string{this.#live();const packet=this.#versions.get(id);if(packet===undefined)throw new SharedEditorError("version_unknown","Unknown retained version");return packet;}
 /** Retire synchronously; a failed final write retains both readable histories and both leases for retry. */
 close():Promise<void>{if(this.#closed)return this.#released??Promise.resolve();if(this.#closing)return this.#closing;this.#retiring=true;this.core.retire();this.#closing=Promise.resolve().then(async()=>{if(this.#closed){await this.#released;return;}this.save();await this.flush();await this.discardAndClose();}).finally(()=>{this.#closing=undefined;});return this.#closing;}
 /** Explicitly abandon unsaved in-memory pairs; the previous committed record is not deleted. */
 discardAndClose():Promise<void>{if(this.#closed)return this.#released??Promise.resolve();const snapshot=this.core.reviewSnapshot();this.#closedRevisions={documentRevision:snapshot.documentRevision,reviewRevision:snapshot.reviewRevision};this.#closed=true;this.core.retire();for(const off of this.#unsubscribe)off();this.#unsubscribe=[];this.core.dispose();this.#pending=undefined;this.#db.close();this.#released=(this.#running??Promise.resolve()).then(async()=>{try{await this.#reviewLease.close();}finally{await this.#documentLease.close();}});return this.#released;}
}
