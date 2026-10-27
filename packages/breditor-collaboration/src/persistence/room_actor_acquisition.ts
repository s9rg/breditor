/** An already-reachable owner for fresh origin-wide actor locks. Construction
 * is synchronous and pure. A refused or cancelled request cannot strand earlier
 * acquired handles in a rejected factory result. This never retires a source,
 * admits stored history, acknowledges work or activates a server room. */
import {SharedWriterLease,checkSharedWriterLeaseForEscrow} from './writer_lease.js';
import {ReviewWriterLease,checkReviewWriterLeaseForEscrow} from './review_writer_lease.js';
import {roomActorAcquisitionInput,roomActorAcquisitionFailure as fail} from './room_actor_acquisition_input.js';
import type {RoomActorAcquisitionOptions,RoomActorAcquisitionMember} from './room_actor_acquisition_contract.js';
const acquireDocument=SharedWriterLease.acquire,acquireReview=ReviewWriterLease.acquire,closeDocument=SharedWriterLease.prototype.close,closeReview=ReviewWriterLease.prototype.close;
const aborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!,key=Object.freeze({});
interface Held{readonly selected:RoomActorAcquisitionMember;document?:SharedWriterLease;review?:ReviewWriterLease}
export interface AcquiredActorLeaseMember{readonly id:string;readonly factory:RoomActorAcquisitionMember['factory'];readonly room:string;readonly writer:string;readonly actor:string|null;readonly document:SharedWriterLease;readonly review:ReviewWriterLease|undefined}
export interface AcquiredActorTransfer{readonly members:readonly AcquiredActorLeaseMember[];consume():void;release():void}
let prepareTransfer:(owner:RoomActorAcquisition)=>AcquiredActorTransfer;
/** Canonical private-brand checked transient reservation. Only the SDK cohort
 * constructor consumes it; no incoming report/lease-shaped DTO is admitted. */
export const prepareAcquiredRoomActors=(owner:RoomActorAcquisition)=>prepareTransfer(owner);
export class RoomActorAcquisition{
 readonly #input;readonly #locks;readonly #held:Held[];#ready=false;#taking=false;#moved=false;#closing=false;#closed=false;
 #running:Promise<void>|undefined;#cleanup:Promise<void>|undefined;
 private constructor(token:object,input:RoomActorAcquisitionOptions){if(token!==key)throw fail();this.#input=roomActorAcquisitionInput(input);this.#locks=globalThis.navigator?.locks;this.#held=this.#input.members.map(selected=>({selected}));Object.freeze(this);}
 /** The caller owns this object BEFORE acquire can obtain even one lock. */
 static begin(input:RoomActorAcquisitionOptions):RoomActorAcquisition{return new RoomActorAcquisition(key,input);}
 #local=()=>{if(this.#closing||this.#closed||this.#moved)throw fail('closed');if(!this.#locks||globalThis.navigator?.locks!==this.#locks)throw fail();if(this.#input.signal){try{if(aborted.call(this.#input.signal))throw fail('aborted');}catch(error){if(error instanceof Error&&'code'in error)throw error;throw fail();}}if(this.#closing||this.#closed||this.#moved)throw fail('closed');};
 #check=()=>{this.#local();this.#input.checkAuthority();this.#local();};
 #leases():void{for(const row of this.#held){if(!row.document)throw fail('incomplete');checkSharedWriterLeaseForEscrow(row.document,this.#input.room,row.selected.writer);if(row.selected.actor!==null){if(!row.review)throw fail('incomplete');checkReviewWriterLeaseForEscrow(row.review,this.#input.room,row.selected.actor);}else if(row.review)throw fail();}}
 acquire():Promise<void>{
  try{if(this.#running||this.#taking)throw fail('busy');if(this.#closing||this.#closed||this.#moved)throw fail('closed');}catch(error){return Promise.reject(error);}
  const task=Promise.resolve().then(async()=>{this.#check();for(const row of this.#held){
   if(!row.document){row.document=await acquireDocument.call(SharedWriterLease,this.#input.room,row.selected.writer);this.#check();}else checkSharedWriterLeaseForEscrow(row.document,this.#input.room,row.selected.writer);
   if(row.selected.actor!==null){if(!row.review){row.review=await acquireReview.call(ReviewWriterLease,this.#input.room,row.selected.actor);this.#check();}else checkReviewWriterLeaseForEscrow(row.review,this.#input.room,row.selected.actor);}
  }this.#check();this.#leases();this.#ready=true;});this.#running=task;return task.finally(()=>{this.#running=undefined;});
 }
 /** Descriptions only. Ready means actual acquired handles, not a stored flag. */
 bindings():readonly Readonly<{id:string;factory:RoomActorAcquisitionMember['factory'];room:string;writer:string;actor:string|null}>[]{this.#local();if(!this.#ready||this.#running||this.#taking)throw fail('incomplete');this.#leases();return Object.freeze(this.#held.map(row=>Object.freeze({...row.selected,room:this.#input.room})));}
 static{prepareTransfer=owner=>{
  if(!owner||typeof owner!=='object'||!(#held in owner))throw fail();if(owner.#running||owner.#taking)throw fail('busy');if(!owner.#ready)throw fail('incomplete');owner.#taking=true;
  try{owner.#check();owner.#leases();const members=Object.freeze(owner.#held.map(row=>Object.freeze({...row.selected,room:owner.#input.room,document:row.document!,review:row.review})));
   return Object.freeze({members,consume(){owner.#moved=true;owner.#ready=false;owner.#taking=false;owner.#held.length=0;},release(){owner.#taking=false;}});
  }catch(error){owner.#taking=false;throw error;}
 };}
 /** Cleanup needs neither a surviving grant nor the current global lock host.
  * A real pending acquisition must settle before its eventual handle can close;
  * cancelled labels cannot release a lock that has not been returned yet. */
 close():Promise<void>{if(this.#closed||this.#moved)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;this.#ready=false;
  this.#cleanup=(async()=>{await this.#running?.catch(()=>{});const results=await Promise.allSettled(this.#held.flatMap(row=>[...(row.review?[closeReview.call(row.review)]:[]),...(row.document?[closeDocument.call(row.document)]:[])]));for(const result of results)if(result.status==='rejected')throw result.reason;this.#held.length=0;this.#closed=true;})().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;
 }
}
