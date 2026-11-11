/** Cold composition rereads the original journals under a genuine promoted
 * target witness. Shutdown may advance a canonical revision once; every history,
 * packet, receipt, initial row and binding must still match the retained files.
 * This finite read supplies no writer or serving authority. Inspection proof
 * expires before either original journal lease is released. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {roomMetadataTargetIdentity,type RoomMetadataTargetWitness} from '../native_room_execution_run/attempt.js';
import type {LocalMetadataRoomBundle} from '../selected_local_metadata_delivery/contract.js';
import {LocalReviewDeliveryStore} from '../selected_local_review_delivery/store.js';
import {LocalMetadataDeliveryStore} from '../selected_local_metadata_delivery/store.js';
import {inspectOriginalMetadata} from './native_origin.js';
import {equal,fail} from './policy.js';
const reviewApi={open:LocalReviewDeliveryStore.prototype.open,read:LocalReviewDeliveryStore.prototype.readFresh,close:LocalReviewDeliveryStore.prototype.close},metadataApi={open:LocalMetadataDeliveryStore.prototype.open,read:LocalMetadataDeliveryStore.prototype.readFresh,close:LocalMetadataDeliveryStore.prototype.close};
type Inspection=Awaited<ReturnType<typeof inspectOriginalMetadata>>;
const heldInspections=new WeakMap<object,{readonly scope:SelectedNativeRecoveryScope;check():void}>();
/** Admission before reading new inputs. Only this actual finite visitor holds
 * both original journal leases and its privately owned target together. */
export function checkHeldOriginalMetadataJournals(scope:SelectedNativeRecoveryScope,inspection:Inspection):void{
 const held=heldInspections.get(inspection);if(!held||held.scope!==scope)throw fail('metadata_continuation_closed');held.check();
}
export interface OriginalMetadataJournalObservation {
 readonly review:Readonly<{database:string;retainedRevision:number;actualRevision:number}>;
 readonly metadata:Readonly<{database:string;retainedRevision:number;actualRevision:number}>;
}
/** Exact facts after zero or one revision-only shutdown checkpoint. An advanced
 * journal requires explicit reconciliation; it is never replaced by older DATA. */
function sameFacts<T extends {readonly before:unknown;readonly current:{readonly revision:number}}>(retained:T,actual:T):void{
 if(!equal(retained.before,actual.before)||![retained.current.revision,retained.current.revision+1].includes(actual.current.revision)||!equal({...actual.current,revision:retained.current.revision},retained.current))throw fail('metadata_continuation_original_journal_changed');
}
/** Trusted SDK-only callback. The actual inspection and old journal leases
 * remain live together; caller DATA cannot issue or extend this proof. */
export async function withOriginalMetadataJournals<T>(scope:SelectedNativeRecoveryScope,witness:RoomMetadataTargetWitness,input:LocalMetadataRoomBundle,visit:(inspection:Inspection,observation:OriginalMetadataJournalObservation,revocations:readonly AbortSignal[])=>Promise<T>):Promise<T>{
 roomMetadataTargetIdentity(witness,scope);if(typeof visit!=='function')throw fail();let active=true,review:LocalReviewDeliveryStore|undefined,metadata:LocalMetadataDeliveryStore|undefined,primary:unknown,failed=false;
 const check=()=>{if(!active)throw fail('metadata_continuation_closed');roomMetadataTargetIdentity(witness,scope);scope.check();review?.checkCurrent();metadata?.checkCurrent();};
 try{
  const original=await inspectOriginalMetadata(scope,witness,input,check);check();
  review=new LocalReviewDeliveryStore(original.choice.parent,check);metadata=new LocalMetadataDeliveryStore(original.choice,check);
  const parent=await reviewApi.open.call(review);check();sameFacts(original.review,parent);
  const saved=await metadataApi.open.call(metadata);check();sameFacts(original.snapshot,saved);
  const observation=Object.freeze({review:Object.freeze({database:original.choice.parent.database,retainedRevision:original.review.current.revision,actualRevision:parent.current.revision}),metadata:Object.freeze({database:original.choice.database,retainedRevision:original.snapshot.current.revision,actualRevision:saved.current.revision})});
  heldInspections.set(original,{scope,check});
  const result=await visit(original,observation,Object.freeze([review.revoked,metadata.revoked]));check();
  if(!equal(await reviewApi.read.call(review),parent)||!equal(await metadataApi.read.call(metadata),saved))throw fail('metadata_continuation_original_journal_changed');check();return result;
 }catch(error){primary=error;failed=true;throw error;}finally{
  active=false;const errors:unknown[]=[];for(const close of[()=>metadata&&metadataApi.close.call(metadata),()=>review&&reviewApi.close.call(review)])try{await close();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(failed?[primary,...errors]:errors,'Original metadata journal reads did not drain');
 }
}
