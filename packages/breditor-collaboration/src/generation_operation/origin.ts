/** Readonly actual native replay; documents/review retain native prefix and generation ancestry. */
import {SharedRichEditor,createSharedDocumentEditor} from "../core.js";
import {initializeSharedReadOnly} from "../initialize_read_only.js";
import {freeUnclaimedSharedRustOwner} from '../raw_owner_lifetime.js';
import {nativeRestoreBinding} from "../native_restore_factory.js";
import type {SharedRustOwner,SharedSelectionPolicy} from "../types.js";
import type {SegmentedSessionCompanion} from "../persistence/segmented_driver.js";
import {checkGenerationRecords} from "../generation_source/validate_records.js";
import {SharedGenerationParticipantBackup} from "../generation_participant/backup.js";
import type {PreparedGenerationRecovery} from "../generation_participant/prepare_recovery.js";
import {forwardProgress,relayProgress} from "../segmented_relay/validation.js";
import type {SharedSegmentedRecovery} from "../persistence/segmented_session.js";
import {samePredecessor} from "../generation_source/continued_records.js";
import {generationSource} from "../generation_source/admission.js";
import type {SharedGenerationSourceSelection} from "../generation_source/contract.js";
import type {SharedSegmentedRelayProgress} from "../segmented_relay/contract.js";
import type {GenerationOperationOrigin} from "./admission.js";
import {restoreReadOnlyContinuedCore} from "../persistence/continue_document_history.js";
import {generationOperationFailure as fail} from "./policy.js";
const key=Object.freeze({});
export class NativeGenerationOperationOrigin implements GenerationOperationOrigin {
 readonly #p:PreparedGenerationRecovery<SharedSelectionPolicy>;readonly #core:SharedRichEditor<SharedSelectionPolicy>;readonly #document:string;readonly #review:string|null;readonly #versions:readonly string[];readonly #relay:SharedSegmentedRelayProgress|undefined;
 readonly #predecessor:SharedSegmentedRecovery|undefined;
 #closed=false;
 private constructor(token:object,p:PreparedGenerationRecovery<SharedSelectionPolicy>,core:SharedRichEditor<SharedSelectionPolicy>,admitted:ReturnType<typeof checkGenerationRecords>){
  if(token!==key)throw fail("generation_operation_origin");
  this.#p=p;this.#core=core;this.#document=admitted.source.checkpoint;this.#review=admitted.source.reviewCheckpoint;
  this.#versions=admitted.source.versions;this.#relay=admitted.companion?.current();
  this.#predecessor=admitted.recovery.format==="breditor/shared-continued-history-backup"?admitted.recovery.predecessor:undefined;
  Object.freeze(this);
 }
 static async read<P extends SharedSelectionPolicy>(prepared:PreparedGenerationRecovery<P>):Promise<NativeGenerationOperationOrigin>{
  const p=prepared as unknown as PreparedGenerationRecovery<SharedSelectionPolicy>,id=p.options.expected.identity.source,session=p.session;
  const admitted=checkGenerationRecords(id,SharedGenerationParticipantBackup.prototype.records.call(p.backup)),r=admitted.source;
  p.guard();
  if(session.kind==="continued-local"){
   if(admitted.recovery.format!=="breditor/shared-continued-history-backup"||!p.predecessor)throw fail("generation_operation_origin");
   const profile=session.options.profile;
   const core=restoreReadOnlyContinuedCore(checkpoint=>profile.restore_continued_history!(id.native.room,checkpoint),
    id.native,admitted.recovery.current,id.review,session.options.editor);
   try{p.guard();return new NativeGenerationOperationOrigin(key,p,core,admitted);}
   catch(error){core.dispose();throw error;}
  }
  const o=session.options;let raw:SharedRustOwner|undefined,core:SharedRichEditor<SharedSelectionPolicy>|undefined;
  try{const binding=nativeRestoreBinding(o.restoreSegmented,o);raw=await binding.factory.call(binding.receiver,r.checkpoint);p.guard();initializeSharedReadOnly(raw,true);const owned=raw;
   const editor={...o.editor,segmentedHistory:"segmented-v1" as const,...(id.native.searchHistory?{searchHistory:id.native.searchHistory}:{}),...(id.native.reviewedHistory?{reviewedHistory:id.native.reviewedHistory}:{})};core=(id.native.selectionEditing==="document-v1"?createSharedDocumentEditor(owned,editor):new SharedRichEditor(owned,editor)) as SharedRichEditor<SharedSelectionPolicy>;
   if(core.richLanguageVersion()!==id.native.richLanguage)throw fail("generation_operation_origin");if(id.native.history==="typing-v1"&&core.view().historyGrouping!=="typing-v1")core.enableTypingHistory();if(id.native.rangeEditing==="general-v1"&&core.view().rangeEditing!=="general-v1")core.enableGeneralRanges();
   if(id.review)core.enableReview({...id.review,access:"read_only"},r.reviewCheckpoint!);core.sealSegmentedPolicies(id.native.history,id.native.rangeEditing);if(core.view().readOnly!==true||core.checkpointJson()!==r.checkpoint||id.review&&core.reviewCheckpoint()!==r.reviewCheckpoint)throw fail("generation_operation_origin");p.guard();return new NativeGenerationOperationOrigin(key,p,core,admitted);
  }catch(error){core?.dispose();if(raw)freeUnclaimedSharedRustOwner(raw);throw error;}
 }
 check():void{if(this.#closed)throw fail("generation_operation_closed");this.#p.guard();if(this.#closed||this.#core.view().readOnly!==true||this.#core.checkpointJson()!==this.#document||this.#review!==null&&this.#core.reviewCheckpoint()!==this.#review)throw fail("generation_operation_origin");}
 /** A valid but different V1 review or packet catalog must never replace this origin's predecessor. */
 verifyPredecessor(head:string):void{
  if(!this.#p.predecessor||this.#p.predecessor.head!==head)throw fail("generation_operation_diverged");
 }
 verifyCore(core:SharedRichEditor<SharedSelectionPolicy>,versions:readonly string[],companion:SegmentedSessionCompanion|undefined):void{
  this.check();SharedRichEditor.prototype.verifySegmentedRecoveryOrigin.call(core,this.#core);const id=this.#p.options.expected.identity.source;
  const preserved=id.kind==="continued-local"
   ?this.#versions.every((packet,index)=>packet===versions[index])
   :this.#versions.every(packet=>versions.includes(packet));
  if(!preserved)throw fail("generation_operation_diverged");
  if(id.kind==="local"||id.kind==="continued-local"){if(companion)throw fail("generation_operation_diverged");}else{if(!companion||!this.#relay)throw fail("generation_operation_diverged");const current=JSON.parse(companion.capture());forwardProgress(this.#relay,relayProgress(id.kind==="retained"?current.relay:current,id.relay!));}
  this.check();SharedRichEditor.prototype.verifySegmentedRecoveryOrigin.call(core,this.#core);
 }
 verifySource<P extends SharedSelectionPolicy>(source:SharedGenerationSourceSelection<P>):void{const port=generationSource(source.session),id=this.#p.options.expected.identity.source;port.checkManaged();if(source.kind!==id.kind||JSON.stringify(port.identity)!==JSON.stringify(id))throw fail("generation_operation_diverged");const current=checkGenerationRecords(id,port.read());
  if(id.kind==="continued-local"){
   if(current.recovery.format!=="breditor/shared-continued-history-backup")throw fail("generation_operation_diverged");
   this.verifyRetainedPredecessor(current.recovery.predecessor);
  }
  this.verifyCore(port.core,current.source.versions,current.companion);port.checkManaged();}
 verifyRetainedPredecessor(current:SharedSegmentedRecovery):void{
  if(!this.#predecessor||!samePredecessor(current,this.#predecessor))throw fail("generation_operation_diverged");
 }
 dispose():void{if(this.#closed)return;this.#closed=true;this.#core.dispose();}
}
