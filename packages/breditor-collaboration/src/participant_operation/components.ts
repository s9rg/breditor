import {completedSourceOpen} from '../persistence/completed_source_open.js';
import {inheritActorLeaseInput} from '../persistence/actor_lease_input.js';
import {RichAssetStore} from "@breditor/experimental-rich-content";
import {SharedPersistentSession} from "../persistence/shared_session.js";
import {SharedReviewPersistentSession} from "../persistence/review_session.js";
import {SharedSuggestionQueue} from "../suggestions/queue.js";
import {SharedSuggestionRevisions} from "../suggestion_revisions/outbox.js";
import {SharedDocumentVersions} from "../versions/catalog.js";
import {initializeSharedReadOnly} from "../initialize_read_only.js";
import {freeUnclaimedSharedRustOwner} from '../raw_owner_lifetime.js';
import {nativeRestoreBinding} from "../native_restore_factory.js";
import {inspectUploads} from "../participant_recovery/inspect.js";
import type {PreparedRecovery} from "../participant_recovery/prepare.js";
import type {RecoveryOwners,RecoverySession} from "../participant_recovery/components.js";
import type {SharedRustOwner,SharedSelectionPolicy} from "../types.js";
import {withRecoveryOrigin} from "./admission.js";
import {withOperationalComponent,withCompletedOperationalComponent} from "./component_admission.js";
import {operationFailure} from "./errors.js";
import type {ParticipantOrigin} from "./origin.js";
import type {SharedParticipantOperationCurrentPolicy} from "./types.js";

function factory<T>(fn:T,receiver:object,readOnly:boolean):T{
 if(typeof fn!=="function")throw operationFailure("operation_policy");
 const binding=nativeRestoreBinding(fn,receiver);
 return (async(...args:unknown[])=>{const raw:SharedRustOwner=await Reflect.apply(binding.factory as (...args:unknown[])=>SharedRustOwner|Promise<SharedRustOwner>,binding.receiver,args);try{initializeSharedReadOnly(raw,readOnly);return raw;}catch(error){if(raw)freeUnclaimedSharedRustOwner(raw);throw error;}}) as unknown as T;
}
export function operationPolicy(input:SharedParticipantOperationCurrentPolicy,paired:boolean):SharedParticipantOperationCurrentPolicy{
 if(!input||Object.keys(input).sort().join(",")!=="documentReadOnly,reviewAccess"||typeof input.documentReadOnly!=="boolean"||(paired?!["read_only","comment","moderate"].includes(input.reviewAccess!):input.reviewAccess!==null))throw operationFailure("operation_policy");
 return Object.freeze({documentReadOnly:input.documentReadOnly,reviewAccess:input.reviewAccess});
}
/** The original declared family selects the factory; current host policy is initialized separately. */
async function session<P extends SharedSelectionPolicy>(p:PreparedRecovery<P>,origin:ParticipantOrigin,policy:SharedParticipantOperationCurrentPolicy,completeOnly:boolean):Promise<RecoverySession<P>>{
 const selected=p.session,forward=<T extends object>(input:T)=>inheritActorLeaseInput(selected.options,input),common={database:p.destinations.document,create:()=>{throw operationFailure("operation_missing");}},wrap=<T>(fn:T)=>factory(fn,selected.options,policy.documentReadOnly);
 const nativeInput=<T extends object>(input:T)=>{const copy=withRecoveryOrigin(forward(input),origin);return completeOnly?completedSourceOpen(copy):copy;};
 switch(selected.kind){
  case"document":return await SharedPersistentSession.open(nativeInput({...selected.options,...common,restore:wrap(selected.options.restore)})) as unknown as RecoverySession<P>;
  case"document-selection":return await SharedPersistentSession.openDocument(nativeInput({...selected.options,...common,restore:wrap(selected.options.restoreDocument),restoreDocument:wrap(selected.options.restoreDocument)})) as unknown as RecoverySession<P>;
  case"search-document":return await SharedPersistentSession.openSearch(nativeInput({...selected.options,...common,restoreSearch:wrap(selected.options.restoreSearch)})) as unknown as RecoverySession<P>;
  case"paired":return SharedReviewPersistentSession.open(nativeInput({...selected.options,...common,review:{...selected.options.review,access:policy.reviewAccess!},restore:wrap(selected.options.restore)}));
  case"reviewed-paired":return SharedReviewPersistentSession.openReviewed(nativeInput({...selected.options,...common,review:{...selected.options.review,access:policy.reviewAccess!},restoreReviewed:wrap(selected.options.restoreReviewed)}));
  case"search-paired":return SharedReviewPersistentSession.openSearch(nativeInput({...selected.options,...common,review:{...selected.options.review,access:policy.reviewAccess!},restoreSearch:wrap(selected.options.restoreSearch)}));
 }
}
/** Open actual existing native/retained/upload owners. No source restore or auto network work. */
export async function openOperationalComponents<P extends SharedSelectionPolicy>(p:PreparedRecovery<P>,origin:ParticipantOrigin,policy:SharedParticipantOperationCurrentPolicy,owners:RecoveryOwners<P>,completeOnly=false):Promise<void>{
 const component=completeOnly?withCompletedOperationalComponent:withOperationalComponent;
 p.guard();if(await inspectUploads(p.destinations.uploads)==="missing")throw operationFailure("operation_missing");p.guard();
 owners.session=await session(p,origin,policy,completeOnly);p.guard();
 if(p.suggestions){owners.suggestions=await SharedSuggestionQueue.open(component({...p.suggestions,database:p.destinations.suggestions!,storage:owners.session}));p.guard();}
 if(p.revisions){owners.revisions=await SharedSuggestionRevisions.open(component({...p.revisions,database:p.destinations.revisions!,storage:owners.session,queue:owners.suggestions!,autoStart:false}));p.guard();}
 if(p.versions){owners.versions=await SharedDocumentVersions.open(component({...p.versions,database:p.destinations.versions!,storage:owners.session,autoConnect:false}));p.guard();}
 owners.uploads=await RichAssetStore.openRetained(p.destinations.uploads,{limits:p.limits});p.guard();
}
