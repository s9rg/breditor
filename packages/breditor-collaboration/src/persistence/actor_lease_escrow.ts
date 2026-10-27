/** Paired recovery-owned actor custody. Every check uses actual private fields;
 * serialized IDs/phases and caller-provided hooks cannot grant or return a loan. */
import {SharedWriterLease,SharedWriterLeaseEscrow,createSharedWriterLeaseEscrow,checkSharedWriterLeaseForEscrow,checkSharedWriterLeaseEscrow,borrowSharedWriterLeaseEscrow,commitSharedWriterLeaseEscrow,checkSharedWriterLeaseEscrowClose,closeSharedWriterLeaseEscrow}from'./writer_lease.js';
import {ReviewWriterLease,ReviewWriterLeaseEscrow,createReviewWriterLeaseEscrow,checkReviewWriterLeaseForEscrow,checkReviewWriterLeaseEscrow,borrowReviewWriterLeaseEscrow,commitReviewWriterLeaseEscrow,checkReviewWriterLeaseEscrowClose,closeReviewWriterLeaseEscrow}from'./review_writer_lease.js';
import {SharedEditorError}from'../core.js';
const actorPairConstructionKey=Object.freeze({});
export interface StagedActorLeases{readonly document:SharedWriterLease;readonly review:ReviewWriterLease}
export class ActorLeaseEscrow{
 readonly #document:SharedWriterLeaseEscrow;readonly #review:ReviewWriterLeaseEscrow;
 readonly #room:string;readonly #writer:string;readonly #actor:string;
 private constructor(document:SharedWriterLeaseEscrow,review:ReviewWriterLeaseEscrow,room:string,writer:string,actor:string,key:object){if(key!==actorPairConstructionKey)throw new SharedEditorError('actor_escrow_source','Use actual paired actor custody');this.#document=document;this.#review=review;this.#room=room;this.#writer=writer;this.#actor=actor;}
 static create(document:SharedWriterLease,review:ReviewWriterLease,room:string,writer:string,actor:string):ActorLeaseEscrow{
  checkSharedWriterLeaseForEscrow(document,room,writer);checkReviewWriterLeaseForEscrow(review,room,actor);
  return new ActorLeaseEscrow(createSharedWriterLeaseEscrow(document,room,writer),createReviewWriterLeaseEscrow(review,room,actor),room,writer,actor,actorPairConstructionKey);
 }
 checkIdle(room:string,writer:string,actor:string):void{
  if(room!==this.#room||writer!==this.#writer||actor!==this.#actor)throw new SharedEditorError('actor_escrow_identity','The actual paired actor bindings differ');
  checkSharedWriterLeaseEscrow(this.#document,room,writer,'idle');checkReviewWriterLeaseEscrow(this.#review,room,actor,'idle');
 }
 borrow(room:string,writer:string,actor:string):StagedActorLeases{
  if(room!==this.#room||writer!==this.#writer||actor!==this.#actor)throw new SharedEditorError('actor_escrow_identity','The actual paired actor bindings differ');
  checkSharedWriterLeaseEscrow(this.#document,room,writer,'idle');checkReviewWriterLeaseEscrow(this.#review,room,actor,'idle');
  return{document:borrowSharedWriterLeaseEscrow(this.#document,room,writer),review:borrowReviewWriterLeaseEscrow(this.#review,room,actor)};
 }
 /** Caller must independently admit the complete replacement root BEFORE this
  * no-await/no-host-callback commit. Local locks are not authenticated activation. */
 #checkCommit():void{
  checkSharedWriterLeaseEscrow(this.#document,this.#room,this.#writer,'commit');checkReviewWriterLeaseEscrow(this.#review,this.#room,this.#actor,'commit');
 }
 checkCommit():void{this.#checkCommit();}
 #checkClose():void{checkSharedWriterLeaseEscrowClose(this.#document);checkReviewWriterLeaseEscrowClose(this.#review);}
 checkClose():void{this.#checkClose();}
 commit():void{
  this.#checkCommit();
  commitSharedWriterLeaseEscrow(this.#document,this.#room,this.#writer);commitReviewWriterLeaseEscrow(this.#review,this.#room,this.#actor);
 }
 async close():Promise<void>{
  this.#checkClose();
  const results=await Promise.allSettled([closeSharedWriterLeaseEscrow(this.#document),closeReviewWriterLeaseEscrow(this.#review)]);
  for(const result of results)if(result.status==='rejected')throw result.reason;
 }
}
