/** Explicit generation-aware durable relay source. It never activates an entire room or stores credentials. */
import {SharedSegmentedPersistentSession} from "../persistence/segmented_session.js";
import {withSegmentedCompanion} from "../persistence/segmented_driver.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedRichEditor} from "../core.js";
import type {SharedReviewRelayProgress} from "../relay/review_types.js";
import {SharedRelayError} from "../relay/validation.js";
import type {SharedSegmentedRelaySessionOptions,SharedSegmentedRelayRecovery,SharedSegmentedRelayRecoveryOptions,SharedSegmentedDocumentProgress,SharedSegmentedReviewReceipt} from "./contract.js";
import {SegmentedRelayCompanion} from "./companion.js";
import {closed} from "./validation.js";
import {registerSegmentedRelaySession} from "./admission.js";

export class SharedSegmentedRelaySession<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 readonly #session:SharedSegmentedPersistentSession<P>;readonly #companion:SegmentedRelayCompanion;
 readonly #core:SharedRichEditor<P>;#retiring=false;#adapters=new Set<WeakRef<{dispose():void}>>();
 private constructor(session:SharedSegmentedPersistentSession<P>,companion:SegmentedRelayCompanion){
  this.#session=session;this.#companion=companion;this.#core=session.core;companion.confirm(session.savedCompanion());
  companion.setRetireHook(()=>this.#stop());
  registerSegmentedRelaySession(this,{core:this.#core as unknown as SharedRichEditor<SharedSelectionPolicy>,binding:structuredClone(companion.binding),check:()=>this.#check(),flush:()=>this.flush(),durable:()=>companion.durable(),persistDocument:p=>this.#persistDocument(p),persistReview:(p,r)=>this.#persistReview(p,r),track:a=>{this.#check();for(const ref of this.#adapters)if(!ref.deref())this.#adapters.delete(ref);this.#adapters.add(new WeakRef(a));}});
 }
 static async open<Q extends SharedSelectionPolicy>(input:SharedSegmentedRelaySessionOptions<Q>):Promise<SharedSegmentedRelaySession<Q>>{
  if(this!==SharedSegmentedRelaySession)throw new SharedRelayError("segmented_relay_factory_receiver");
  const {binding,...options}=input,companion=new SegmentedRelayCompanion(input as SharedSegmentedRelaySessionOptions),session=await SharedSegmentedPersistentSession.open(withSegmentedCompanion(options,companion));
  try{return new SharedSegmentedRelaySession(session,companion);}catch(error){await session.discardAndClose();throw error;}
 }
 static async restoreRecovery<Q extends SharedSelectionPolicy>(input:SharedSegmentedRelayRecoveryOptions<Q>):Promise<SharedSegmentedRelaySession<Q>>{
  if(this!==SharedSegmentedRelaySession)throw new SharedRelayError("segmented_relay_factory_receiver");
  closed(input.recovery,"format,formatVersion,relay,source");const r=input.recovery;if(r.format!=="breditor/shared-relay-generation-recovery"||r.formatVersion!==1)throw new SharedRelayError("segmented_relay_recovery");
  const {binding,recovery,...options}=input,companion=new SegmentedRelayCompanion({...options,binding,initialGenerations:{root:"recovery",active:"restore"},create:()=>{throw new SharedRelayError("segmented_relay_recovery");}} as SharedSegmentedRelaySessionOptions,r.relay);
  const session=await SharedSegmentedPersistentSession.restoreRecovery(withSegmentedCompanion({...options,recovery:r.source},companion));try{return new SharedSegmentedRelaySession(session,companion);}catch(error){await session.discardAndClose();throw error;}
 }
 get core():SharedRichEditor<P>{return this.#core;}
 get recovered():boolean{return this.#session.recovered;}
 #check():void{if(this.#retiring||this.core!==this.#core)throw new SharedRelayError("segmented_relay_source_retired");this.#session.checkBorrowedSource(this.#core);}
 state(){return this.#session.state();}
 relayProgress(){return this.#companion.durable();}
 /** Paired transport progress readers return detached metadata, not live server grants. */
 reviewRelayIdentity(){return structuredClone(this.#companion.binding.review);}
 reviewRelayProgress():SharedReviewRelayProgress{const p=this.#companion.durable().review;if(!p)throw new SharedRelayError("segmented_review_binding_required");return p;}
 async persistReviewRelayProgress(progress:SharedReviewRelayProgress):Promise<void>{await this.#persistReview(progress);}
 async #persistReview(progress:SharedReviewRelayProgress,receipt?:SharedSegmentedReviewReceipt):Promise<void>{this.#check();const current=this.#companion.current();if(!current.binding.review)throw new SharedRelayError("segmented_review_binding_required");this.#companion.propose({...current,review:progress,reviewReceipt:receipt??current.reviewReceipt});await this.flush();}
 async #persistDocument(document:SharedSegmentedDocumentProgress):Promise<void>{this.#check();this.#companion.propose({...this.#companion.current(),document});await this.flush();}
 save():void{this.#session.save();}
 async flush():Promise<void>{this.#session.save();await this.#session.flush();}
 async retry():Promise<void>{await this.#session.retry();}
 async sealGeneration(next:string):Promise<void>{this.#check();await this.#session.sealGeneration(next);}
 exportRecovery():SharedSegmentedRelayRecovery{return {format:"breditor/shared-relay-generation-recovery",formatVersion:1,source:this.#session.exportRecovery(),relay:this.#companion.current()};}
 saveVersion(name:string,createdAtMs:string){return this.#session.saveVersion(name,createdAtMs);}
 retainVersion(packet:string){return this.#session.retainVersion(packet);}
 versions(){return this.#session.versions();}
 versionPacket(id:string){return this.#session.versionPacket(id);}
 #stop():void{this.#retiring=true;for(const ref of this.#adapters)try{ref.deref()?.dispose();}catch{/* Source retirement still fences transport and releases no writer early. */}this.#adapters.clear();}
 close():Promise<void>{try{this.#stop();return this.#session.close();}catch(error){return Promise.reject(error);}}
 discardAndClose():Promise<void>{try{this.#stop();return this.#session.discardAndClose();}catch(error){return Promise.reject(error);}}
}
