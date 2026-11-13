/** Private per-input native factory resource selection. No public field, DTO,
 * persisted phase or borrowed storage-shaped object can select an actor loan.
 * This is NOT a target executor, authorization decision or native replay proof. */
import {inheritDeferredActorLeaseInput,deferredActorDocumentLease}from'./deferred_actor_input.js';
import {checkNativeActorSourceLeases}from'./native_actor_source.js';
import {SharedEditorError}from'../core.js';
import {SharedWriterLease,SharedWriterLeaseEscrow,borrowSharedWriterLeaseEscrow,checkSharedWriterLeaseEscrow,checkSharedWriterLeaseForEscrow}from'./writer_lease.js';
import {ReviewWriterLease,checkReviewWriterLeaseForEscrow}from'./review_writer_lease.js';
import {ActorLeaseEscrow}from'./actor_lease_escrow.js';
export type ActorLeaseFactoryFamily='shared'|'review'|'segmented'|'independent'|'continued-delivery';
type Family=ActorLeaseFactoryFamily;
interface Entry{family:Family;database:string;room:string;writer:string;actor:string|null;scope:ActorLeaseEscrow|SharedWriterLeaseEscrow;document:SharedWriterLease;review:ReviewWriterLease|undefined;documentTaken:boolean;reviewTaken:boolean;closed:boolean;released:boolean}
const selected=new WeakMap<object,Entry>(),borrowPair=ActorLeaseEscrow.prototype.borrow,idlePair=ActorLeaseEscrow.prototype.checkIdle,closeDocument=SharedWriterLease.prototype.close,closeReview=ReviewWriterLease.prototype.close,assertDocument=SharedWriterLease.prototype.assertLive,assertReview=ReviewWriterLease.prototype.assertLive;
const fail=()=>new SharedEditorError('actor_lease_input','Use one actual recovery-owned actor loan for the selected native source factory and namespace');
export interface ActorLeaseFactoryInput<T extends object>{readonly input:T;rollbackAfterFailure():Promise<void>}
/** The coordinator retains the escrow separately until complete-room native
 * admission. An unsettled factory that has taken a loan cannot be rolled back
 * through this handle. Preserve legacy mutable-factory wait contracts. */
export function bindActorLeaseInput<T extends object>(input:T,family:Family,database:string,room:string,writer:string,actor:string|null,scope:ActorLeaseEscrow|SharedWriterLeaseEscrow):ActorLeaseFactoryInput<T>{
 if(!['shared','review','segmented','independent','continued-delivery'].includes(family)||family==='continued-delivery'&&actor===null||typeof database!=='string'||!database||typeof room!=='string'||typeof writer!=='string'||actor!==null&&typeof actor!=='string')throw fail();
 const copy={...input},pair=actor===null?{document:borrowSharedWriterLeaseEscrow(scope as SharedWriterLeaseEscrow,room,writer),review:undefined}:borrowPair.call(scope as ActorLeaseEscrow,room,writer,actor);
 const entry:Entry={family,database,room,writer,actor,scope,document:pair.document,review:pair.review,documentTaken:false,reviewTaken:false,closed:false,released:false};selected.set(copy,entry);
 return{input:copy,async rollbackAfterFailure(){
  if(entry.released)return;
  // Observe the actual loan handles, never a saved "failed/opened" phase.
  // A rejected native cleanup can still have returned both real actor slots;
  // conversely an unsettled constructor remains live even if a caller labels it
  // cancelled. Untaken slots belong only to this input and may then be returned.
  if(entry.documentTaken)requireReturned(()=>assertDocument.call(entry.document),'writer_lease_closed');
  if(entry.reviewTaken)requireReturned(()=>assertReview.call(entry.review!),'review_lease_closed');
  entry.closed=true;const results=await Promise.allSettled([closeDocument.call(entry.document),...(entry.review?[closeReview.call(entry.review)]:[])]);for(const result of results)if(result.status==='rejected')throw result.reason;
  if(entry.actor===null)checkSharedWriterLeaseEscrow(entry.scope as SharedWriterLeaseEscrow,entry.room,entry.writer,'idle');else idlePair.call(entry.scope as ActorLeaseEscrow,entry.room,entry.writer,entry.actor);
  entry.released=true;
 }};
}
/** Forward ONLY an existing private selection through a known SDK normalization.
 * No data field is read and no ordinary input is upgraded into recovery custody. */
export function inheritActorLeaseInput<T extends object>(from:object,to:T):T{inheritDeferredActorLeaseInput(from,to);const entry=selected.get(from);if(entry){const known=selected.get(to);if(known&&known!==entry)throw fail();selected.set(to,entry);}return to;}
function requireReturned(assert:()=>void,closedCode:string):void{try{assert();}catch(error){if(error instanceof SharedEditorError&&error.code===closedCode)return;throw error;}throw new SharedEditorError('actor_lease_input_in_use','Wait for the actual mutable factory and its cleanup; data or a cancelled phase cannot release a live opening');}
function matching(input:object,family:Family|'continued-local',database:string,room:string,writer:string,actor:string|null):Entry|undefined{const entry=selected.get(input);if(entry&&(entry.closed||entry.family!==family||entry.database!==database||entry.room!==room||entry.writer!==writer||entry.actor!==actor))throw fail();return entry;}
export function takeActorDocumentLease(input:object,family:Family|'continued-local',database:string,room:string,writer:string,actor:string|null):SharedWriterLease|Promise<SharedWriterLease>|undefined{const deferred=deferredActorDocumentLease(input,family,database,room,writer,actor);if(deferred)return deferred;const entry=matching(input,family,database,room,writer,actor);if(!entry)return undefined;if(entry.documentTaken)throw fail();assertDocument.call(entry.document);entry.documentTaken=true;return entry.document;}
export function takeActorReviewLease(input:object,family:Family|'continued-local',database:string,room:string,writer:string,actor:string):ReviewWriterLease|undefined{const entry=matching(input,family,database,room,writer,actor);if(!entry)return undefined;if(!entry.documentTaken||entry.reviewTaken||!entry.review)throw fail();assertReview.call(entry.review);entry.reviewTaken=true;return entry.review;}

/** A deferred route can reuse a normalized factory object only after its exact
 * previous loan was canonically returned. Ordinary inheritance stays one-shot. */
export function replaceReturnedActorLeaseInput(from:object,to:object):void{const entry=selected.get(from),old=selected.get(to);if(!entry||old&&old!==entry&&(!old.closed||!old.released))throw fail();selected.set(to,entry);}
/** Current whole-root admission must supply the genuine native core whose
 * constructor owns BOTH exact loan handles, not just a matching actor string. */
export function checkActorLeaseInputBorrower(input:object,core:object):void{const entry=selected.get(input);if(!entry||entry.closed||entry.released||!entry.documentTaken||entry.actor!==null&&!entry.reviewTaken)throw fail();checkNativeActorSourceLeases(core,entry.family,entry.document,entry.review);}

/** A caller phase cannot mark a loan promoted: both exact handles must already
 * be genuine ordinary release owners after the canonical escrow transfer. */
export function checkActorLeaseInputPromoted(input:object):void{const entry=selected.get(input);if(!entry||entry.closed||entry.released||!entry.documentTaken||entry.actor!==null&&!entry.reviewTaken)throw fail();checkSharedWriterLeaseForEscrow(entry.document,entry.room,entry.writer);if(entry.actor!==null)checkReviewWriterLeaseForEscrow(entry.review!,entry.room,entry.actor);}
