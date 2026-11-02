/** Durable source shutdown without an actor exclusion gap. Preparing installs
 * no-callback deferred transfers on actual leases. Each original source saves
 * and flushes normally; its final real Close transfers rather than releases the
 * lock. Partial failure retains every captured escrow for the same root retry. */
import {SharedEditorError} from '../core.js';
import {prepareNativeActorReadiness,type NativeActorClient,type NativeActorReadyClient} from './native_actor_readiness.js';
import {prepareNativeActorSourceClose} from './native_actor_source.js';
import {checkSharedWriterLeaseCloseRetention,takeSharedWriterLeaseCloseRetention,cancelSharedWriterLeaseCloseRetention,type SharedWriterLeaseCloseRetention} from './writer_lease.js';
import {checkReviewWriterLeaseCloseRetention,takeReviewWriterLeaseCloseRetention,cancelReviewWriterLeaseCloseRetention,type ReviewWriterLeaseCloseRetention} from './review_writer_lease.js';
import {pairHeldActorLeases} from './actor_lease_escrow.js';
import type {StoppedActorBinding,StoppedActorCustody} from './stopped_actor_source.js';
interface PlannedMember extends NativeActorReadyClient{readonly document:SharedWriterLeaseCloseRetention;readonly review:ReviewWriterLeaseCloseRetention|undefined}
interface ClosedMember{readonly id:string;readonly factory:NativeActorReadyClient['family'];readonly binding:StoppedActorBinding;readonly custody:StoppedActorCustody}
const key=Object.freeze({}),fail=()=>new SharedEditorError('native_actor_close','Use the actual complete durable-close retention and wait for all original source closes');
let take:(owner:NativeActorCloseRetention)=>readonly ClosedMember[];
/** Consumed only by the genuine stopped cohort factory after complete preflight. */
export const takeClosedNativeActors=(owner:NativeActorCloseRetention)=>take(owner);
export class NativeActorCloseRetention{
 readonly #members:readonly PlannedMember[];#taken=false;
 private constructor(token:object,members:readonly PlannedMember[]){if(token!==key)throw fail();this.#members=members;Object.freeze(this);}
 static prepare(clients:readonly NativeActorClient[]):NativeActorCloseRetention{
  const selected=prepareNativeActorReadiness(clients),members:PlannedMember[]=[];
  try{for(const row of selected)members.push(Object.freeze({...row,...prepareNativeActorSourceClose(row.core,row.family,row.binding)}));return new NativeActorCloseRetention(key,Object.freeze(members));}
  catch(error){for(const row of members){if(row.review)cancelReviewWriterLeaseCloseRetention(row.review);cancelSharedWriterLeaseCloseRetention(row.document);}throw error;}
 }
 static{take=owner=>{
  if(!owner||typeof owner!=='object'||!(#members in owner)||owner.#taken)throw fail();
  // Full-set actual escrow admission precedes the first one-shot consume. No
  // application callback or await can split this complete resource handoff.
  for(const row of owner.#members){checkSharedWriterLeaseCloseRetention(row.document);if(row.review)checkReviewWriterLeaseCloseRetention(row.review);}
  const held=owner.#members.map(row=>{const document=takeSharedWriterLeaseCloseRetention(row.document),custody=row.review?pairHeldActorLeases(document,takeReviewWriterLeaseCloseRetention(row.review),row.binding.room,row.binding.writer,row.binding.actor!):document;return Object.freeze({id:row.id,factory:row.family,binding:row.binding,custody});});
  owner.#taken=true;return Object.freeze(held);
 };}
}
