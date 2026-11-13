import {completedSourceOpen} from '../persistence/completed_source_open.js';
import {withCompletedOperationalComponent} from '../participant_operation/component_admission.js';
import {inheritActorLeaseInput} from '../persistence/actor_lease_input.js';
import {RichAssetStore} from "@breditor/experimental-rich-content";
import {SharedPersistentSession} from "../persistence/shared_session.js";
import {SharedReviewPersistentSession} from "../persistence/review_session.js";
import {SharedSuggestionQueue} from "../suggestions/queue.js";
import {SharedSuggestionRevisions} from "../suggestion_revisions/outbox.js";
import {SharedDocumentVersions} from "../versions/catalog.js";
import {sessionBackupRecord} from "../backups/database.js";
import {queueKey} from "../suggestions/database.js";
import {revisionKey} from "../suggestion_revisions/database.js";
import {cacheKey} from "../versions/database.js";
import {participantDigest} from "../participant_backup/format.js";
import {inspectRecord,inspectUploads} from "./inspect.js";
import {recoveryFailure} from "./errors.js";
import {checkManagedSource,checkManagedSourceBindings,managedSourceCore} from "../managed_custody.js";
import type {SharedRichEditor} from "../core.js";
import type {PreparedRecovery} from "./prepare.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedAssetReferenceCaptureOptions} from "../asset_references_capture.js";
import type {SharedParticipantRecoveryStep} from "./types.js";
export type RecoverySession<P extends SharedSelectionPolicy>=SharedPersistentSession<P>|SharedReviewPersistentSession<P>;
export interface RecoveryOwners<P extends SharedSelectionPolicy> {session?:RecoverySession<P>;suggestions?:SharedSuggestionQueue<P>;revisions?:SharedSuggestionRevisions<P>;versions?:SharedDocumentVersions<P>;uploads?:RichAssetStore}
/** Inspect readonly field bindings without advancing callbacks or checking
 * storage liveness ahead of the existing final handoff barrier. */
export function checkRecoveryOwnerBindings<P extends SharedSelectionPolicy>(owners:RecoveryOwners<P>):void{if(!owners.session)throw recoveryFailure("recovery_missing");for(const owner of [owners.session,owners.suggestions,owners.revisions,owners.versions])if(owner)checkManagedSourceBindings(owner);}
/** Readable records do not prove live custody of every selected owner. Recoverable
 * save errors remain retryable; changed storage custody never does. */
export function checkManagedRecoveryOwners<P extends SharedSelectionPolicy>(owners:RecoveryOwners<P>):void{if(!owners.session||!owners.uploads)throw recoveryFailure("recovery_missing");const core=managedSourceCore(owners.session);checkManagedSource(owners.session,core);for(const owner of [owners.suggestions,owners.revisions,owners.versions])if(owner)checkManagedSource(owner,core);RichAssetStore.prototype.checkOpen.call(owners.uploads);}
/** No empty-document fallback, implicit history upgrade or file-selected factory. */
async function session<P extends SharedSelectionPolicy>(p:PreparedRecovery<P>,adopt:boolean,verifyExisting:boolean):Promise<RecoverySession<P>>{
 const selected=p.session,common={database:p.destinations.document},backup={...common,backupJson:p.backups.document,writerRecovery:"host-reacquired" as const},open={...common,create:()=>{throw recoveryFailure("recovery_missing");}};
 const existing=<T extends object>(options:T):T=>{
  const selectedInput=inheritActorLeaseInput(selected.options,options);
  return verifyExisting?completedSourceOpen(selectedInput):selectedInput;
 };
 // The runtime switch follows the explicit discriminant; its native generic is verified below.
 switch(selected.kind){
  case"document":return await(adopt?SharedPersistentSession.open(existing({...selected.options,...open})):SharedPersistentSession.restoreBackup(inheritActorLeaseInput(selected.options,{...selected.options,...backup}))) as unknown as RecoverySession<P>;
  case"document-selection":return await(adopt?SharedPersistentSession.openDocument(existing({...selected.options,...open,restore:selected.options.restoreDocument})):SharedPersistentSession.restoreDocumentBackup(inheritActorLeaseInput(selected.options,{...selected.options,...backup}))) as unknown as RecoverySession<P>;
  case"search-document":return await(adopt?SharedPersistentSession.openSearch(existing({...selected.options,...open})):SharedPersistentSession.restoreSearchBackup(inheritActorLeaseInput(selected.options,{...selected.options,...backup}))) as unknown as RecoverySession<P>;
  case"paired":return adopt?SharedReviewPersistentSession.open(existing({...selected.options,...open})):SharedReviewPersistentSession.restoreBackup(inheritActorLeaseInput(selected.options,{...selected.options,...backup}));
  case"reviewed-paired":return adopt?SharedReviewPersistentSession.openReviewed(existing({...selected.options,...open})):SharedReviewPersistentSession.restoreReviewedBackup(inheritActorLeaseInput(selected.options,{...selected.options,...backup}));
  case"search-paired":return adopt?SharedReviewPersistentSession.openSearch(existing({...selected.options,...open})):SharedReviewPersistentSession.restoreSearchBackup(inheritActorLeaseInput(selected.options,{...selected.options,...backup}));
 }
}
export function ownerSources<P extends SharedSelectionPolicy>(p:PreparedRecovery<P>,owners:RecoveryOwners<P>):SharedAssetReferenceCaptureOptions<P>{
 const source=owners.session;if(!source)throw recoveryFailure("recovery_missing");return {core:managedSourceCore(source) as SharedRichEditor<P>,...(p.expected.identity.stores.includes("paired-session")?{session:source as SharedReviewPersistentSession<P>}:{}),...(owners.suggestions?{suggestions:owners.suggestions}:{}),...(owners.revisions?{revisions:owners.revisions}:{}),...(owners.versions?{versions:owners.versions}:{})};
}
export function checkComponent<P extends SharedSelectionPolicy>(p:PreparedRecovery<P>,owners:RecoveryOwners<P>,step:SharedParticipantRecoveryStep):void{
 p.guard();let expected:string|undefined,actual:string|undefined;
 if(step==="document"){actual=owners.session?(managedSourceCore(owners.session) as SharedRichEditor<P>).checkpointJson():undefined;expected=p.records.get("document");if(actual===expected&&p.expected.identity.stores.includes("paired-session")){actual=JSON.stringify((owners.session as SharedReviewPersistentSession<P>).exportRecovery());expected=p.records.get("paired-session");}}
 else if(step!=="uploads"){const kind=step==="revisions"?"suggestion-revisions":step==="versions"?"version-catalog":"suggestions";expected=p.records.get(kind);actual=JSON.stringify(owners[step]?.exportRecovery());}
 if(step!=="uploads"&&(expected===undefined||actual!==expected))throw recoveryFailure("recovery_diverged");
}
/** Read all keys in a dedicated original store before adopting or returning it. */
export async function inspectOriginalRecoveryComponent<P extends SharedSelectionPolicy>(
 p:PreparedRecovery<P>,step:Exclude<SharedParticipantRecoveryStep,'uploads'>,
){
 const identity=p.expected.identity.source;
 let database:string,store:string,key:IDBValidKey,expected:unknown;
 if(step==="document"){database=p.destinations.document;store="journals";key=[identity.room,identity.writer];expected=p.expected.identity.stores.includes("paired-session")?JSON.parse(p.records.get("paired-session")!):sessionBackupRecord(p.records.get("document")!,identity);}
 else if(step==="suggestions"){database=p.destinations.suggestions!;store="suggestions";key=queueKey(p.suggestions!.identity);expected=JSON.parse(p.records.get("suggestions")!);}
 else if(step==="revisions"){database=p.destinations.revisions!;store="revisions";key=revisionKey(p.suggestions!.identity,p.revisions!.binding);expected=JSON.parse(p.records.get("suggestion-revisions")!);}
 else{database=p.destinations.versions!;store="catalogs";key=cacheKey(p.versions!.identity);expected=JSON.parse(p.records.get("version-catalog")!);}
 return inspectRecord(database,store,key,expected);
}
/** Read exact retained state before invoking any ordinary reopening factory that may save. */
export async function restoreComponent<P extends SharedSelectionPolicy>(p:PreparedRecovery<P>,owners:RecoveryOwners<P>,step:SharedParticipantRecoveryStep,complete:boolean,verifyExisting=false):Promise<void>{
 p.guard();const signal=p.signal?{signal:p.signal}:{};
 if(step==="uploads"){
  const status=await inspectUploads(p.destinations.uploads);p.guard();if(complete&&status==="missing")throw recoveryFailure("recovery_missing");
  owners.uploads=status==="retained"||complete?await RichAssetStore.open(p.destinations.uploads,{limits:p.limits}):await RichAssetStore.restoreBackup(p.destinations.uploads,p.backups.uploads,{uploadState:"preserve",limits:p.limits,...signal});
  const file=await owners.uploads.exportBackup(signal);if(await participantDigest(file,p.signal)!==await participantDigest(p.backups.uploads,p.signal))throw recoveryFailure("recovery_diverged");p.guard();return;
 }
 const status=await inspectOriginalRecoveryComponent(p,step);p.guard();if(complete&&status!=="exact")throw recoveryFailure("recovery_missing");const adopt=status==="exact",authority={writerRecovery:"host-reacquired" as const,...signal};
 const retain=verifyExisting?withCompletedOperationalComponent:<T extends object>(input:T)=>input;
 const database=p.destinations[step]!;
 if(step==="document")owners.session=await session(p,adopt,verifyExisting);
 else if(step==="suggestions"){const options={...p.suggestions!,database,storage:owners.session!};owners.suggestions=adopt?await SharedSuggestionQueue.open(retain(options)):await SharedSuggestionQueue.restoreBackup({...options,backupJson:p.backups.suggestions!,...authority});}
 else if(step==="revisions"){const options={...p.revisions!,database,storage:owners.session!,queue:owners.suggestions!,autoStart:false as const};owners.revisions=adopt?await SharedSuggestionRevisions.open(retain(options)):await SharedSuggestionRevisions.restoreBackup({...options,backupJson:p.backups.revisions!,...authority});}
 else{const options={...p.versions!,database,storage:owners.session!,autoConnect:false as const};owners.versions=adopt?await SharedDocumentVersions.open(retain(options)):await SharedDocumentVersions.restoreBackup({...options,backupJson:p.backups.versions!,...authority});}
 p.guard();checkComponent(p,owners,step);
}
/** Only failed private recovery owners are discarded; committed destinations are never deleted. */
export async function discardRecoveryOwners<P extends SharedSelectionPolicy>(owners:RecoveryOwners<P>):Promise<void>{
 try{await owners.revisions?.discardAndClose();}finally{try{await owners.suggestions?.discardAndClose();}finally{try{await owners.versions?.discardAndClose();}finally{try{await owners.session?.discardAndClose();}finally{owners.uploads?.close();}}}}
}
