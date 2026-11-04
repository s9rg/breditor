/** Actual replacement-only metadata handoff. The existing executor owns the
 * successor throughout inspection, approval, retention and destination binding.
 * This action never publishes a room or interprets a saved phase as permission. */
import {roomMetadataTargetIdentity,withRoomExecutionMetadataTarget,type RoomExecutionAttempt,type RoomMetadataTargetWitness} from '../native_room_execution_run/attempt.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {generationDeliveryRecoveryHostPort,type SharedServerLogGenerationDeliveryRecoveryHost} from '../generation_delivery_control/host.js';
import type {SharedServerLogGenerationParticipantInventory} from '../server_generation_inventory/read.js';
import {selectedNativeDeliverySources,retainSelectedNativeDeliveryResource} from '../relay/native_delivery.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
import {previewMetadataContinuationPreparation,prepareMetadataContinuationDelivery,type PreparedSelectedNativeDelivery} from '../selected_delivery_preparation/coordinator.js';
import {SelectedLocalReviewDelivery as Review,continueVerifiedLocalReviewFacts} from '../selected_local_review_delivery/coordinator.js';
import {SelectedLocalMetadataDelivery as Metadata,continueVerifiedLocalMetadataFacts,previewSelectedLocalMetadataResume} from '../selected_local_metadata_delivery/coordinator.js';
import {localChoice} from '../selected_local_review_delivery/policy.js';
import {metadataChoice} from '../selected_local_metadata_delivery/policy.js';
import {detachLocalMetadataBundle} from '../selected_local_metadata_delivery/bundle.js';
import type {LocalMetadataRoomBundle} from '../selected_local_metadata_delivery/contract.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {decideFreshAssetChoice} from '../physical_room_asset_approval/decision.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {database} from '../physical_room_asset_adoption/policy.js';
import {executionNames} from '../native_room_execution/plan.js';
import {physicalOperationV3Present} from '../physical_room_operation_v3/child.js';
import {inspectOriginalMetadata,issueVerifiedMetadataContinuationFacts} from './native_origin.js';
import {MetadataContinuationIntent} from './intent.js';
import {readContinuedReview,readContinuedMetadata,continuedReviewBundle,continuedMetadataBundle} from './destination.js';
import {continuationChoice,equal,fail} from './policy.js';
import type {MetadataContinuationDestinations,MetadataContinuationChoice,MetadataContinuationResult} from './contract.js';
const reviewApi={open:Review.open,reopen:Review.reopen,capture:Review.prototype.capture,close:Review.prototype.close};
const metadataApi={open:Metadata.open,reopen:Metadata.reopen,capture:Metadata.prototype.capture,close:Metadata.prototype.close};
const intentApi={open:MetadataContinuationIntent.prototype.open,reopen:MetadataContinuationIntent.prototype.reopen,close:MetadataContinuationIntent.prototype.close};
const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
import {readMetadataContinuationInputs as inputs,type MetadataContinuationInspectionInput,type MetadataContinuationInput} from './inputs.js';
export type {MetadataContinuationInspectionInput,MetadataContinuationInput} from './inputs.js';
async function inspect(scope:SelectedNativeRecoveryScope,witness:RoomMetadataTargetWitness,input:ReturnType<typeof inputs>,check:()=>void){
 const original=await inspectOriginalMetadata(scope,witness,input.origin,check),sources=selectedNativeDeliverySources(scope),plan=original.execution.execution.plan;
 const occupied=new Set([...original.occupied,...executionNames(plan.layout),...plan.preparation.plan.participants.flatMap(row=>row.namespaces.map(ns=>ns.database)),original.choice.database,original.choice.parent.database,original.bundle.parent.prepared.choice.database]);if(Object.values({database:input.database,prepared:input.preparationDatabase,review:input.reviewDatabase,metadata:input.metadataDatabase}).some(name=>occupied.has(name)))throw fail('metadata_continuation_namespace_collision');
 const prepared=await previewMetadataContinuationPreparation(scope,input.host,input.inventory,input.preparationDatabase);if(!equal(prepared.choice.before,original.target))throw fail('metadata_continuation_target_changed');
 const lanes=sources.filter(row=>row.source.parent.kind==='independent-local').sort((a,b)=>a.id<b.id?-1:1).map(row=>{if(row.source.parent.kind!=='independent-local')throw fail();const old=original.choice.parent.lanes.find(old=>old.id===row.id),identity=independentHistoryNative(row.source.parent.session).identity;if(!old||!equal(identity,old.source))throw fail();return{id:row.id,family:row.family,source:identity,binding:old.binding};});
 const review=localChoice({format:'breditor/selected-local-review-delivery',formatVersion:1,database:input.reviewDatabase,before:original.target,lanes}),metadata=metadataChoice({format:'breditor/selected-local-metadata-delivery',formatVersion:1,database:input.metadataDatabase,parent:review,lanes:original.choice.lanes});
 const choice=continuationChoice({format:'breditor/selected-local-metadata-continuation',formatVersion:1,database:input.database,execution:original.execution,delivery:generationDeliveryRecoveryHostPort(input.host).selection,origin:{choice:original.choice,prepared:original.bundle.parent.prepared.choice,current:original.bundle.parent.current.selection,review:{bytes:original.bundle.parent.delivery.bytes,sha256:original.bundle.parent.delivery.sha256},metadata:{bytes:original.bundle.metadata.bytes,sha256:original.bundle.metadata.sha256}},prepared:prepared.choice,target:original.target,review,metadata});check();
 return{choice,original,facts:issueVerifiedMetadataContinuationFacts(original,review,metadata),initial:original.snapshot.before.lanes.map(row=>({id:row.id,binding:metadata.lanes.find(lane=>lane.id===row.id)!.binding,records:row.records}))};
}
/** Whole-room actual source inspection only. No destination is created. */
export function previewRoomMetadataContinuation(attempt:RoomExecutionAttempt,reads:PhysicalOperationV3HistoryReadOptions,provided:MetadataContinuationInspectionInput):Promise<MetadataContinuationChoice>{return withRoomExecutionMetadataTarget(attempt,reads,(scope,witness)=>previewHeldRoomMetadataContinuation(scope,witness,provided));}
/** Trusted composition under an already admitted actual target visitor. The
 * witness is checked by the same full original inspection as the ordinary API. */
export async function previewHeldRoomMetadataContinuation(scope:SelectedNativeRecoveryScope,witness:RoomMetadataTargetWitness,provided:MetadataContinuationInspectionInput):Promise<MetadataContinuationChoice>{roomMetadataTargetIdentity(witness,scope);const input=inputs(provided,false),check=()=>{scope.check();input.authority();scope.check();};return(await inspect(scope,witness,input,check)).choice;}
/** Original facts are applied only with a fresh complete same-visit proof. The
 * original pair is retained literally before fresh baselines are constructed. */
export async function continueHeldRoomMetadata(scope:SelectedNativeRecoveryScope,witness:RoomMetadataTargetWitness,provided:MetadataContinuationInput,resume:boolean):Promise<MetadataContinuationResult>{
 roomMetadataTargetIdentity(witness,scope);const input=inputs(provided,true),check=()=>{scope.check();input.authority();scope.check();};let gate:PreparedSelectedNativeDelivery|undefined,review:Review|undefined,metadata:Metadata|undefined,intent:MetadataContinuationIntent|undefined,primary:unknown,failed=false;
 try{const before=await inspect(scope,witness,input,check);if(!equal(before.choice,input.expected))throw fail('metadata_continuation_stale');for(const name of(resume?[]:[input.database,input.preparationDatabase,input.reviewDatabase,input.metadataDatabase]))if(await physicalOperationV3Present(name,check))throw fail('metadata_continuation_exists');
  await decideFreshAssetChoice(before.choice,input.approve,{check,signal:scope.signal,watchClosing:cancel=>{add.call(scope.signal,'abort',cancel,{once:true});return()=>remove.call(scope.signal,'abort',cancel);}});check();const selected=await inspect(scope,witness,input,check);if(!equal(selected.choice,before.choice))throw fail('metadata_continuation_stale');
  const current=await scope.retainCurrent();intent=new MetadataContinuationIntent(selected.choice,{wasm:current.integrity.wasm,checkAuthority:check,signal:scope.signal});const held=intent;retainSelectedNativeDeliveryResource(scope,{check,close:()=>intentApi.close.call(held)});await(resume?intentApi.reopen.call(intent,selected.original.bundle):intentApi.open.call(intent,selected.original.bundle));check();
  gate=await(resume&&await physicalOperationV3Present(input.preparationDatabase,check)?prepareMetadataContinuationDelivery(scope,input.host,input.inventory,selected.choice.prepared,true):prepareMetadataContinuationDelivery(scope,input.host,input.inventory,selected.choice.prepared));
  let reviewSnapshot:Awaited<ReturnType<typeof readContinuedReview>>|undefined;
  if(resume&&await physicalOperationV3Present(input.reviewDatabase,check)){reviewSnapshot=await readContinuedReview(scope,selected.choice,selected.original.snapshot,check);const saved=await continuedReviewBundle(scope,gate.prepared,reviewSnapshot,check);review=await reviewApi.reopen.call(Review,scope,gate,saved,{expected:selected.choice.review,approve:()=>true,checkAuthority:check});}
  else review=await reviewApi.open.call(Review,scope,gate,{expected:selected.choice.review,approve:()=>true,checkAuthority:check});
  await continueVerifiedLocalReviewFacts(review,selected.facts);
  if(resume&&await physicalOperationV3Present(input.metadataDatabase,check)){if(!reviewSnapshot)throw fail();const snapshot=await readContinuedMetadata(scope,selected.choice,selected.original.snapshot,reviewSnapshot,check),parent=await reviewApi.capture.call(review),bundle=await continuedMetadataBundle(scope,parent,snapshot,check),input={choice:selected.choice.metadata,bundle,checkAuthority:check},expected=await previewSelectedLocalMetadataResume(review,input);metadata=await metadataApi.reopen.call(Metadata,review,{...input,expected,approve:()=>true});}
  else metadata=await metadataApi.open.call(Metadata,review,{expected:selected.choice.metadata,lanes:selected.initial,approve:()=>true,checkAuthority:check});
  await continueVerifiedLocalMetadataFacts(metadata,selected.facts);const captured=await metadataApi.capture.call(metadata);check();
  if(!equal((await scope.retainCurrent()).current.selection,selected.choice.target))throw fail('metadata_continuation_target_changed');return Object.freeze({format:'breditor/selected-local-metadata-continued',formatVersion:1,choice:selected.choice,origin:selected.original.bundle,current:captured});
 }catch(e){primary=e;failed=true;throw e;}finally{const errors:unknown[]=[];for(const action of[()=>metadata&&metadataApi.close.call(metadata),()=>review&&reviewApi.close.call(review),()=>gate?.close(),()=>intent&&intentApi.close.call(intent)])try{await action();}catch(e){errors.push(e);}if(errors.length)throw new AggregateError(failed?[primary,...errors]:errors,'Metadata continuation cleanup did not finish');}
 }

/** First destination creation remains absent-only. */
export function continueRoomMetadata(attempt:RoomExecutionAttempt,reads:PhysicalOperationV3HistoryReadOptions,input:MetadataContinuationInput):Promise<MetadataContinuationResult>{return withRoomExecutionMetadataTarget(attempt,reads,(scope,witness)=>continueHeldRoomMetadata(scope,witness,input,false));}
/** Retry requires a complete existing immutable intent, current actual targets,
 * exact partial destination facts and a new affirmative decision. */
export function resumeRoomMetadataContinuation(attempt:RoomExecutionAttempt,reads:PhysicalOperationV3HistoryReadOptions,input:MetadataContinuationInput):Promise<MetadataContinuationResult>{return withRoomExecutionMetadataTarget(attempt,reads,(scope,witness)=>continueHeldRoomMetadata(scope,witness,input,true));}
