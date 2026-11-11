/** Read earlier partial/complete destinations without their retired HTTP host.
 * Actual cold-target and original-journal custody precede caller DATA admission.
 * Existing stores stay read-only and held through the finite visitor; absent
 * destinations are reserved too. No stale intent is resumed or overwritten. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {RecoveryLease,checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {physicalOperationV3Present} from '../physical_room_operation_v3/child.js';
import {executionNames} from '../native_room_execution/plan.js';
import {DeliveryPreparationIntentStore} from '../selected_delivery_preparation/intent_store.js';
import {MetadataContinuationIntent,HandoverMetadataContinuationIntent} from './intent.js';
import {continuationChoice} from '../selected_local_metadata_continuation/policy.js';
import {verifyContinuedReviewFacts,verifyContinuedMetadataFacts} from '../selected_local_metadata_continuation/destination_facts.js';
import {LocalReviewDeliveryStore} from '../selected_local_review_delivery/store.js';
import {LocalMetadataDeliveryStore} from '../selected_local_metadata_delivery/store.js';
import {localJson} from '../selected_local_review_delivery/policy.js';
import {metadataJson} from '../selected_local_metadata_delivery/policy.js';
import type {MetadataContinuationChoice} from '../selected_local_metadata_continuation/contract.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {handoverMetadataContinuationChoice} from './handover_choice.js';
import type {HandoverMetadataContinuationChoice} from './handover_contract.js';
import {checkHeldOriginalMetadataJournals,withOriginalMetadataJournals} from './original_journals.js';
import {equal,fail} from './policy.js';
import type {MetadataContinuationEvidence,HeldMetadataContinuationEvidence,HandoverMetadataContinuationEvidence,HeldHandoverMetadataContinuationEvidence} from './evidence_contract.js';

type OriginalInspection=Parameters<Parameters<typeof withOriginalMetadataJournals>[3]>[0];
type Observation=Pick<MetadataContinuationEvidence,'phase'|'review'|'metadata'>;

/** This action needs a genuine same-visit origin. Copied descriptors cannot
 * inspect a destination, acquire a lease, or keep a proof after this visit. */
export async function withHeldMetadataContinuationEvidence<T>(
 scope:SelectedNativeRecoveryScope,original:OriginalInspection,
 provided:MetadataContinuationChoice,visit:(held:HeldMetadataContinuationEvidence)=>Promise<T>,
):Promise<T>{
 checkHeldOriginalMetadataJournals(scope,original);
 const choice=continuationChoice(provided);
 return withHeldEvidence(scope,original,choice,options=>new MetadataContinuationIntent(choice,options),
  observed=>Object.freeze({format:'breditor/metadata-continuation-evidence',formatVersion:1,choice,...observed}),visit);
}

/** Inspect the previously selected sealed destinations without contacting the
 * old path. The retained intent verifies the full path and the four source pins. */
export async function withHeldHandoverMetadataContinuationEvidence<T>(
 scope:SelectedNativeRecoveryScope,original:OriginalInspection,
 provided:HandoverMetadataContinuationChoice,visit:(held:HeldHandoverMetadataContinuationEvidence)=>Promise<T>,
):Promise<T>{
 checkHeldOriginalMetadataJournals(scope,original);
 const choice=handoverMetadataContinuationChoice(provided);
 return withHeldEvidence(scope,original,choice.continuation,options=>new HandoverMetadataContinuationIntent(choice,options),
  ({phase,review,metadata}):HandoverMetadataContinuationEvidence=>{
   if(phase==='absent')throw fail('metadata_continuation_missing');
   return Object.freeze({format:'breditor/handover-metadata-continuation-evidence',formatVersion:1,choice,phase,review,metadata});
  },visit);
}

async function withHeldEvidence<T,E>(
 scope:SelectedNativeRecoveryScope,original:OriginalInspection,choice:MetadataContinuationChoice,
 openIntent:(options:SharedArchiveIntegrityOptions)=>MetadataContinuationIntent|HandoverMetadataContinuationIntent,
 evidenceFor:(observed:Observation)=>E,visit:(held:Readonly<{evidence:E;revocations:readonly AbortSignal[];check():void}>)=>Promise<T>,
):Promise<T>{
 const execution=original.execution;
 if(typeof visit!=='function'||!equal(choice.execution,execution)||!equal(choice.target,original.target)||!equal(choice.origin,{choice:original.choice,prepared:original.bundle.parent.prepared.choice,current:original.bundle.parent.current.selection,review:{bytes:original.bundle.parent.delivery.bytes,sha256:original.bundle.parent.delivery.sha256},metadata:{bytes:original.bundle.metadata.bytes,sha256:original.bundle.metadata.sha256}}))throw fail('metadata_continuation_stale');
 const names=[choice.database,choice.prepared.database,choice.review.database,choice.metadata.database];
 const occupied=[...original.occupied,original.choice.database,original.choice.parent.database,original.bundle.parent.prepared.choice.database,execution.database,...executionNames(execution.execution.plan.layout),execution.execution.plan.preparation.plan.database,...execution.execution.plan.preparation.plan.participants.flatMap(row=>row.namespaces.map(ns=>ns.database))];
 if(names.some(name=>occupied.includes(name)))throw fail('metadata_continuation_stale');
 const factory=recoveryOpeningContext(),locks=navigator.locks,leases:RecoveryLease[]=[];
 let active=true,opening:RecoveryOpeningCustody|undefined,preparation:DeliveryPreparationIntentStore|undefined,intent:MetadataContinuationIntent|HandoverMetadataContinuationIntent|undefined,review:LocalReviewDeliveryStore|undefined,metadata:LocalMetadataDeliveryStore|undefined,primary:unknown,failed=false,closing:Promise<void>|undefined;
 const base=()=>{if(!active||globalThis.indexedDB!==factory||globalThis.navigator?.locks!==locks)throw fail('metadata_continuation_closed');checkHeldOriginalMetadataJournals(scope,original);};
 const check=()=>{base();checkRecoveryLeasesHeld(leases);intent?.check();preparation?.checkCurrent();review?.checkCurrent();metadata?.checkCurrent();base();};
 const closeReserved=()=>{if(closing)return closing;const task=Promise.resolve().then(async()=>{
  const errors:unknown[]=[];try{await preparation?.close();}catch(error){errors.push(error);}
  for(const lease of [...leases].reverse())try{await lease.close();}catch(error){errors.push(error);}
  if(errors.length)throw new AggregateError(errors,'Prior metadata reserved namespace cleanup did not drain');
 });closing=task.finally(()=>{closing=undefined;});return closing;};
 try{
  const present:boolean[]=[];for(const name of names)present.push(await physicalOperationV3Present(name,base));base();
  if(present.some((exists,i)=>exists&&i>0&&!present[i-1]))throw fail('metadata_continuation_incomplete');
  // These stores acquire their own real leases when they exist. The remaining
  // names, including the immutable preparation store, need explicit custody.
  const reserved=names.filter((_name,i)=>!present[i]||i===1).sort();
  opening=await RecoveryOpeningCustody.reserve(factory,reserved,closeReserved,{policy:()=>fail(),busy:()=>fail('metadata_continuation_busy'),storage:()=>fail('metadata_continuation_storage')});base();
  for(const name of reserved){leases.push(await RecoveryLease.acquire(JSON.stringify(name)));check();}
  for(let i=0;i<names.length;i++)if(await physicalOperationV3Present(names[i]!,check)!==present[i])throw fail('metadata_continuation_stale');
  const current=await scope.retainCurrent();check();const options={wasm:current.integrity.wasm,checkAuthority:base,signal:scope.signal};
  if(present[0]){intent=openIntent(options);await intent.reopen(original.bundle);check();}
  let prepared;
  if(present[1]){preparation=new DeliveryPreparationIntentStore(factory,choice.prepared,options);prepared=await preparation.open();check();}
  let reviewSnapshot;
  if(present[2]){review=new LocalReviewDeliveryStore(choice.review,base);reviewSnapshot=await review.open();check();verifyContinuedReviewFacts(choice,original.snapshot,reviewSnapshot);}
  let metadataSnapshot;
  if(present[3]){if(!reviewSnapshot)throw fail();metadata=new LocalMetadataDeliveryStore(choice.metadata,base);metadataSnapshot=await metadata.open();check();verifyContinuedMetadataFacts(original.snapshot,reviewSnapshot,metadataSnapshot);}
  const phase=(['absent','intent','prepared','review','metadata'] as const)[present.filter(Boolean).length]!;
  const evidence=evidenceFor({phase,review:reviewSnapshot?localJson(reviewSnapshot):null,metadata:metadataSnapshot?metadataJson(metadataSnapshot):null});
  const revocations=Object.freeze([intent,preparation,review,metadata].flatMap(store=>store?[store.revoked]:[]));
  check();const result=await visit(Object.freeze({evidence,check,revocations}));check();
  if(review&&!equal(await review.readFresh(),reviewSnapshot)||metadata&&!equal(await metadata.readFresh(),metadataSnapshot))throw fail('metadata_continuation_stale');
  if(preparation){const after=await preparation.read();check();if(!prepared||!equal(after.choice,prepared.choice)||after.file.size!==prepared.file.size)throw fail('metadata_continuation_stale');}
  check();return result;
 }catch(error){primary=error;failed=true;throw error;}finally{
  active=false;const errors:unknown[]=[];
  for(const close of[()=>metadata?.close(),()=>review?.close(),()=>intent?.close(),closeReserved,()=>opening?.rollback()])try{await close();}catch(error){errors.push(error);}
  if(errors.length)throw new AggregateError(failed?[primary,...errors]:errors,'Prior metadata evidence cleanup did not drain');
 }
}
